'use server'

import { redirect } from 'next/navigation'

import { ideaFingerprint, runPipeline, type PipelineResult } from '@claimfold/content'
import {
  finishJob,
  isDuplicate,
  getNiche,
  JobAlreadyRunningError,
  markTopicUsed,
  recentTitles,
  releaseStaleJobs,
  saveDraft,
  startExclusiveJob,
} from '@claimfold/db'
import { redact } from '@claimfold/crypto'
import { MAX_CAROUSEL_SLIDES } from '@claimfold/niches'

import { formText } from '../../lib/form.ts'
import { getMessages } from '../../lib/i18n/index.ts'
import { describeNicheErrors, packFromRow } from '../../lib/niche.ts'
import { can } from '../../lib/permissions.ts'
import { requireSession } from '../../lib/session.ts'

/**
 * Generate a post.
 *
 * Runs the whole pipeline inline — ideate, verify, gate, write — and saves the
 * result. It takes about a minute and costs real money, which drives two
 * decisions here: the run is recorded as a job so a crash leaves evidence
 * rather than silence, and the job is exclusive per organization so a
 * double-clicked button cannot become two API bills.
 *
 * Rendering is deliberately NOT done here. The review page draws slides live
 * in the browser from the same React templates the worker screenshots, so a
 * reviewer sees the real thing without a headless Chromium in the web image.
 */

/** A generation that has been running longer than this had its process die. */
const STALE_AFTER_MS = 15 * 60 * 1000

function back(message: string): never {
  redirect(`/generate?error=${encodeURIComponent(message)}`)
}

export async function generateAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  const e = (await getMessages()).errors

  // Generation spends real money against the operator's API key, so a viewer
  // must not be able to start one.
  if (!can(session, 'edit')) back(e.notPermitted)

  const nicheId = formText(formData, 'nicheId').trim()
  const topicRaw = formText(formData, 'topic').trim()
  const slideCountRaw = formText(formData, 'slideCount').trim()
  // Present only when the topic came from discovery. Never trusted as
  // ownership: `markTopicUsed` goes through RLS, so an id belonging to another
  // tenant updates nothing rather than being checked here and forgotten later.
  const topicId = formText(formData, 'topicId').trim() || undefined

  if (!nicheId) back(e.chooseNiche)

  // Bounded before it reaches a prompt. Not a security control on its own —
  // the structured-output contract between stages is what stops injected text
  // reaching a caption — but an unbounded field billed per token is its own
  // problem, and 300 characters is more than a topic ever needs.
  const topic = topicRaw.slice(0, 300) || undefined

  const slideCount = slideCountRaw ? Number(slideCountRaw) : undefined
  if (
    slideCount !== undefined &&
    (!Number.isInteger(slideCount) || slideCount < 2 || slideCount > MAX_CAROUSEL_SLIDES)
  ) {
    back(e.slideCountRange(MAX_CAROUSEL_SLIDES))
  }

  // A niche this org does not own returns null: RLS makes the lookup itself
  // the authorization check, so there is no separate ownership test to forget.
  const nicheRow = await getNiche(session.orgId, nicheId)
  if (!nicheRow) back(e.nicheMissing)

  const parsed = packFromRow(nicheRow)
  if (!parsed.ok) {
    back(e.nicheInvalid(describeNicheErrors(parsed.errors)))
  }
  const niche = parsed.pack

  // Clear anything abandoned by a process that died mid-run, or the exclusion
  // index blocks this org forever after a single crash.
  await releaseStaleJobs(session.orgId, 'generate', STALE_AFTER_MS)

  let jobId: string
  try {
    jobId = await startExclusiveJob(session.orgId, 'generate', {
      nicheId,
      topic: topic ?? null,
      startedBy: session.userId,
    })
  } catch (error) {
    if (error instanceof JobAlreadyRunningError) {
      back(e.generateBusy)
    }
    throw error
  }

  let result: PipelineResult
  try {
    result = await runPipeline({
      niche,
      topic,
      slideCount,
      recentTitles: await recentTitles(session.orgId),
    })
  } catch (error) {
    const message = (error as Error).message
    await finishJob(session.orgId, jobId, {
      status: 'failed',
      // Provider errors echo request parameters, which is how an API key ends
      // up in a database column that gets rendered into a page.
      error: redact(message),
    })
    back(e.generateFailed(message.slice(0, 200)))
  }

  const format = niche.formats.find((f) => f.id === result.idea.format)
  const fingerprint = ideaFingerprint(result.idea)

  /**
   * The duplicate guard, which never ran.
   *
   * `ideaFingerprint` is computed and written on every generation, and
   * `isDuplicate` is the only thing that reads the column — but nothing ever
   * called it. So the column existed, the index on it existed, and ideation could
   * produce the same premise again and again at full price.
   *
   * Checked here rather than before generating, because the fingerprint hashes
   * the premise the model actually returned, which is not knowable in advance.
   * The money is therefore already spent by this point — so this refuses to
   * *save* a repeat and says plainly that it is a repeat, rather than pretending
   * it prevented one.
   */
  if (await isDuplicate(session.orgId, fingerprint)) {
    await finishJob(session.orgId, jobId, { status: 'succeeded' })
    back(e.duplicateIdea)
  }

  const claims = result.verification.verdicts.map((v) => ({
    claim: v.claim,
    verdict: v.verdict,
    confidence: v.confidence,
    reasoning: v.reasoning,
    isCore: v.isCore,
    sources: v.sources.map((s) => ({
      url: s.url,
      title: s.title,
      publisher: s.publisher ?? undefined,
      quote: s.quote ?? undefined,
    })),
  }))

  // The gate stopped this before anything was written. There are no slides to
  // review, but the verdicts and sources explaining the refusal are the most
  // interesting record the system produces, so it is saved as a rejected post
  // rather than thrown away.
  if (result.stoppedAtGate) {
    const postId = await saveDraft({
      orgId: session.orgId,
      nicheId,
      /**
       * Copied from the channel now, not resolved through it later.
       *
       * Repointing a channel at a different account must not rewrite where posts
       * that already went out claim to have gone — see
       * docs/decisions/0004-which-account-a-post-goes-to.md.
       */
      igAccountId: nicheRow.igAccountId,
      status: 'rejected',
      reviewNotes:
        'Blocked before writing:\n' +
        result.gate.blocks.map((b) => `· ${b.message}`).join('\n'),
      format: result.idea.format,
      templateId: format?.templateId ?? 'editorial',
      themeId: niche.themeId,
      title: result.idea.title,
      hook: '',
      caption: '',
      hashtags: [],
      aiDisclosure: niche.rules.publicInterest,
      ideaFingerprint: fingerprint,
      consultedSources: result.searched.map((s) => ({ url: s.url, title: s.title })),
      slides: [],
      claims,
    })

    await finishJob(session.orgId, jobId, {
      status: 'succeeded',
      payload: { postId, stoppedAtGate: true, costUsd: result.totalCostUsd ?? null },
    })

    // Marked used even though the gate refused it. "Used" records that this
    // subject was tried, which is what stops it being suggested again next
    // week — a topic whose claims did not hold up is the last one to re-offer.
    if (topicId) await markTopicUsed(session.orgId, topicId)

    redirect(`/posts/${postId}`)
  }

  const draft = result.draft!
  const postId = await saveDraft({
    orgId: session.orgId,
    nicheId,
    igAccountId: nicheRow.igAccountId,
    format: result.idea.format,
    templateId: format?.templateId ?? 'editorial',
    themeId: niche.themeId,
    title: result.idea.title,
    hook: draft.hook,
    caption: draft.caption,
    hashtags: draft.hashtags,
    // On by default for public-interest niches. EU AI Act Art. 50 applies from
    // 2 August 2026; the reviewer can still turn it off, and that is their call
    // to make and be recorded making.
    aiDisclosure: niche.rules.publicInterest,
    ideaFingerprint: fingerprint,
    consultedSources: result.searched.map((s) => ({ url: s.url, title: s.title })),
    slides: draft.slides.map((slide) => ({
      role: slide.role,
      content: {
        headline: slide.headline ?? undefined,
        body: slide.body ?? undefined,
        kicker: slide.kicker ?? undefined,
        footnote: slide.footnote ?? undefined,
        items: slide.items ?? undefined,
        figure: slide.figure ?? undefined,
        figureLabel: slide.figureLabel ?? undefined,
      },
      altText: slide.altText,
    })),
    claims,
  })

  await finishJob(session.orgId, jobId, {
    status: 'succeeded',
    payload: { postId, stoppedAtGate: false, costUsd: result.totalCostUsd ?? null },
  })

  if (topicId) await markTopicUsed(session.orgId, topicId)

  redirect(`/posts/${postId}`)
}
