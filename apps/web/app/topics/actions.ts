'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { redact } from '@claimfold/crypto'
import {
  dismissTopic,
  getNiche,
  JobAlreadyRunningError,
  finishJob,
  releaseStaleJobs,
  restoreTopic,
  saveTopics,
  startExclusiveJob,
} from '@claimfold/db'
import { discoverTopics, normaliseKey } from '@claimfold/trends'

import { formText } from '../../lib/form.ts'
import { getMessages } from '../../lib/i18n/index.ts'
import { describeNicheErrors, packFromRow } from '../../lib/niche.ts'
import { can } from '../../lib/permissions.ts'
import { requireSession } from '../../lib/session.ts'

/**
 * Running discovery.
 *
 * Recorded as an exclusive job for the same reason generation is: it is slow,
 * it talks to services that rate-limit, and a double-clicked button should not
 * become two runs competing for the same ten requests a minute. Unlike
 * generation it costs nothing but time, so the exclusion is about politeness
 * to the sources rather than about money.
 */

/** A run stuck longer than this had its process die mid-flight. */
const STALE_AFTER_MS = 20 * 60 * 1000

function back(nicheId: string, message: string): never {
  redirect(`/topics?nicheId=${encodeURIComponent(nicheId)}&error=${encodeURIComponent(message)}`)
}

export async function discoverAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  const e = (await getMessages()).errors

  /**
   * The capability check all three actions in this file were missing.
   *
   * Tenant scoping was never the gap — RLS handles that. What was missing is
   * the role check every sibling action file has, and ADR 0005 states as the
   * rule: "Every check lives in the server action."
   *
   * Discovery in particular is not a read. It fires outbound requests to five
   * external APIs under this install's own User-Agent, consumes a
   * process-wide rate-limit budget shared with every other tenant, and writes
   * rows. `generateAction` gates the analogous costs-the-operator-something
   * path with exactly this check.
   */
  if (!can(session, 'edit')) redirect(`/topics?error=${encodeURIComponent(e.notPermittedTopics)}`)

  const nicheId = formText(formData, 'nicheId').trim()
  if (!nicheId) redirect(`/topics?error=${encodeURIComponent(e.chooseNiche)}`)

  // RLS makes the lookup the authorization check: a niche this org does not
  // own comes back null rather than being fetched and then tested.
  const row = await getNiche(session.orgId, nicheId)
  if (!row) back(nicheId, e.nicheMissing)

  const parsed = packFromRow(row)
  if (!parsed.ok) {
    back(nicheId, e.nicheInvalid(describeNicheErrors(parsed.errors)))
  }
  const niche = parsed.pack

  await releaseStaleJobs(session.orgId, 'discover', STALE_AFTER_MS)

  let jobId: string
  try {
    jobId = await startExclusiveJob(session.orgId, 'discover', {
      nicheId,
      startedBy: session.userId,
    })
  } catch (error) {
    if (error instanceof JobAlreadyRunningError) {
      back(nicheId, e.discoverBusy)
    }
    throw error
  }

  try {
    const run = await discoverTopics({
      niche: {
        language: niche.language,
        topicSeeds: niche.topicSeeds,
        description: niche.description,
        forbiddenTopics: niche.rules.forbiddenTopics,
      },
    })

    await saveTopics(
      session.orgId,
      run.topics.map((topic) => ({
        nicheId,
        title: topic.title,
        dedupeKey: normaliseKey(topic.title),
        sources: topic.sources,
        ...(topic.article ? { articleUrl: topic.article.url } : {}),
        signals: { ...topic.signals },
        breakdown: { ...topic.score },
        score: topic.score.score,
        // `accepted` is the persisted safety/prefilter decision. Whether a
        // safe topic is a close channel recommendation is a separate, visible
        // niche-fit decision in the Topics page.
        accepted: topic.prefilter.ok,
        rejectionReasons: topic.prefilter.reasons,
        rejectionDetail: topic.prefilter.detail,
      })),
    )

    await finishJob(session.orgId, jobId, {
      status: 'succeeded',
      payload: {
        nicheId,
        found: run.topics.length,
        accepted: run.topics.filter((t) => t.prefilter.ok).length,
        // Kept on the job so the caps and source failures survive the page
        // reload. A run that silently dropped half its pool reads exactly like
        // a thorough one otherwise.
        notes: run.notes,
      },
    })
  } catch (error) {
    /*
      Redacted, for the reason `generate/actions.ts` gives at the same point:
      provider errors echo request parameters, which is how an API key ends up
      in a database column that gets rendered into a page — and, here, into a
      redirect query string that a user can copy out of the address bar.

      Discovery talks to GDELT, Wikimedia, Wikidata and Google Trends over HTTP
      with parameters in the URL. This was the one of the two sibling actions
      that passed the raw message through.
    */
    const message = redact((error as Error).message)
    await finishJob(session.orgId, jobId, { status: 'failed', error: message })
    back(nicheId, e.discoverFailed(message.slice(0, 200)))
  }

  redirect(`/topics?nicheId=${encodeURIComponent(nicheId)}`)
}

export async function dismissTopicAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  if (!can(session, 'edit')) return

  const topicId = formText(formData, 'topicId').trim()
  if (topicId) await dismissTopic(session.orgId, topicId)
  revalidatePath('/topics')
}

export async function restoreTopicAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  if (!can(session, 'edit')) return

  const topicId = formText(formData, 'topicId').trim()
  if (topicId) await restoreTopic(session.orgId, topicId)
  revalidatePath('/topics')
}
