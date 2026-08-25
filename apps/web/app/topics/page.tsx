import type { Metadata } from 'next'
import Link from 'next/link'

import { listNiches, listTopics, recentJobs, type TopicRow } from '@claimfold/db'
import { isRecommendedNicheFit, THRESHOLDS, WEIGHTS } from '@claimfold/trends'

import { Shell } from '../../components/shell.tsx'
import { getLocale, getMessages, type Locale, type Messages } from '../../lib/i18n/index.ts'
import { requireSession } from '../../lib/session.ts'
import { discoverAction, dismissTopicAction, restoreTopicAction } from './actions.ts'
import { DiscoverForm } from './discover-form.tsx'

export const dynamic = 'force-dynamic'

/**
 * A tab you can tell apart from the other eight.
 *
 * The root layout supplies the `%s · Claimfold` template; this only names the
 * page. Resolved through the catalogue so the tab is in the reader's language
 * like everything else.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).topics.title }
}


/**
 * Discovered topics, ranked.
 *
 * A table rather than a grid of cards, because the job here is scanning
 * twenty-odd rows on the same handful of attributes and comparing them. Cards
 * are for items you look at one at a time; this is a list you sort down.
 *
 * The refusals get their own table rather than being hidden. A discovery tool
 * that only lists what it approved is asking to be trusted; one that shows
 * what it rejected and why can be argued with. Same reason the pipeline saves
 * the ideas its gate refused.
 */

/**
 * A run note in the reader's language.
 *
 * The run states what it did as a code plus its numbers and carries English
 * prose alongside, exactly like a gate issue: the sentence is built here, and a
 * language with no phrasing for a code falls back to the English rather than
 * rendering an empty bullet.
 *
 * Plain strings are accepted too, because they are what the job payloads
 * written before this change still contain — already English prose, so they
 * are shown as they are rather than dropped. Notes are the only place the
 * dashboard admits a run measured twenty candidates out of fifty-one; losing
 * old ones to a shape change would quietly rewrite that history as "nothing to
 * report".
 */
function noteText(note: unknown, t: Messages): string | null {
  if (typeof note === 'string') return note.trim() || null
  if (typeof note !== 'object' || note === null) return null

  const { code, params, message } = note as {
    code?: string
    params?: Record<string, string | number>
    message?: string
  }
  const phrase = code ? t.runNotes[code] : undefined
  if (!phrase) return message ?? null
  try {
    return phrase(params ?? {})
  } catch {
    return message ?? null
  }
}

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ nicheId?: string; error?: string; show?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const t = await getMessages()
  const locale = await getLocale()

  const niches = await listNiches(session.orgId)
  const selected =
    niches.find((n) => n.id === params.nicheId) ?? niches.find((n) => n.isDefault) ?? niches[0]

  const showDismissed = params.show === 'dismissed'
  /*
    `listTopics` depends on which channel was selected, so it cannot start
    before `listNiches` finishes. `recentJobs` does not — it only needs the org
    — and it was waiting behind the topic query for no reason. Two sequential
    transactions become one round of two.

    The column list stays as-is deliberately: the table renders `breakdown`,
    `signals`, `rejectionReasons` and `rejectionDetail`, so the wide `select()`
    is fetching things that are actually shown, not padding.
  */
  const [topics, lastRun] = await Promise.all([
    selected
      ? listTopics(session.orgId, { nicheId: selected.id, includeDismissed: showDismissed })
      : Promise.resolve([]),
    recentJobs(session.orgId, 'discover', 1).then((rows) => rows[0]),
  ])
  const notes = (Array.isArray(lastRun?.payload['notes']) ? lastRun.payload['notes'] : [])
    .map((note) => noteText(note, t))
    .filter((line): line is string => line !== null)

  const passedPrefilter = topics.filter((x) => x.accepted && !x.dismissedAt)
  const recommended = passedPrefilter.filter((topic) =>
    isRecommendedNicheFit(topicNicheFit(topic)),
  )
  const explore = passedPrefilter.filter((topic) => !isRecommendedNicheFit(topicNicheFit(topic)))
  const rejected = topics.filter((x) => !x.accepted && !x.dismissedAt)
  const dismissed = topics.filter((x) => x.dismissedAt)

  return (
    <Shell session={session} title={t.topics.title} bleed>
      <p className="prose mb-[var(--sp-7)] text-sm">
        {t.topics.intro(Math.round(WEIGHTS.durability * 100))}
      </p>

      {params.error && (
        <div
          role="alert"
          className="border-err bg-err-weak text-err mb-[var(--sp-7)] max-w-2xl rounded-[var(--radius-2)] border p-[var(--sp-5)] text-sm"
        >
          {params.error}
        </div>
      )}

      {niches.length === 0 ? (
        <div className="border-rule max-w-xl rounded-[var(--radius-2)] border border-dashed p-[var(--sp-8)]">
          <p className="text-fg mb-[var(--sp-4)] text-sm font-medium">{t.topics.noNiche.title}</p>
          <p className="text-subtle text-sm">{t.topics.noNiche.body}</p>
        </div>
      ) : (
        <>
          <DiscoverForm
            niches={niches.map((n) => ({ id: n.id, name: n.name, language: n.language }))}
            selectedId={selected?.id ?? ''}
            action={discoverAction}
            t={{
              niche: t.topics.niche,
              discover: t.topics.discover,
              working: t.topics.working,
              waitTitle: t.topics.waitTitle,
              waitBody: t.topics.waitBody,
              waitCached: t.topics.waitCached,
            }}
          />

          {/* What the run did that the ranked list cannot show — every cap it
              applied, every source that failed. A run that quietly dropped half
              its pool reads exactly like a thorough one otherwise. */}
          {notes.length > 0 && (
            <section className="panel mt-[var(--sp-7)] max-w-3xl p-[var(--sp-6)]">
              <h2 className="label mb-[var(--sp-4)]">{t.topics.aboutLastRun}</h2>
              <ul className="text-subtle space-y-[var(--sp-3)] text-xs leading-relaxed">
                {notes.map((note, index) => (
                  <li key={index}>· {note}</li>
                ))}
              </ul>
            </section>
          )}

          {topics.length === 0 ? (
            <p className="prose mt-[var(--sp-8)] text-sm">{t.topics.empty}</p>
          ) : (
            <div className="mt-[var(--sp-8)] space-y-[var(--sp-9)]">
              <TopicTable
                title={t.topics.recommended}
                empty={t.topics.recommendedEmpty}
                rows={recommended}
                nicheId={selected!.id}
                t={t}
                locale={locale}
                action={dismissTopicAction}
                actionLabel={t.common.dismiss}
              />

              <TopicTable
                title={t.topics.explore}
                note={t.topics.exploreNote}
                empty={t.topics.exploreEmpty}
                rows={explore}
                nicheId={selected!.id}
                t={t}
                locale={locale}
                action={dismissTopicAction}
                actionLabel={t.common.dismiss}
                exploratory
              />

              <TopicTable
                title={t.topics.rejected}
                note={t.topics.rejectedNote}
                empty={t.topics.rejectedEmpty}
                rows={rejected}
                nicheId={selected!.id}
                t={t}
                locale={locale}
                action={dismissTopicAction}
                actionLabel={t.common.dismiss}
              />

              {showDismissed ? (
                <TopicTable
                  title={t.topics.dismissed}
                  empty={t.topics.dismissedEmpty}
                  rows={dismissed}
                  nicheId={selected!.id}
                  t={t}
                  locale={locale}
                  action={restoreTopicAction}
                  actionLabel={t.common.restore}
                />
              ) : (
                <Link
                  href={`/topics?nicheId=${selected!.id}&show=dismissed`}
                  className="text-subtle hover:text-fg inline-block text-xs"
                >
                  {t.topics.showDismissed}
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </Shell>
  )
}

function TopicTable({
  title,
  note,
  empty,
  rows,
  nicheId,
  t,
  locale,
  action,
  actionLabel,
  exploratory = false,
}: {
  title: string
  note?: string
  empty: string
  rows: TopicRow[]
  nicheId: string
  t: Messages
  locale: Locale
  action: (formData: FormData) => Promise<void>
  actionLabel: string
  exploratory?: boolean
}) {
  return (
    <section>
      <h2 className="mb-[var(--sp-4)] flex items-center gap-[var(--sp-4)]">
        <span className="label">{title}</span>
        <span className="bg-sunken text-muted rounded-[var(--radius-1)] px-[var(--sp-3)] text-xs">
          {rows.length}
        </span>
      </h2>
      {note && <p className="prose mb-[var(--sp-5)] text-xs">{note}</p>}

      {rows.length === 0 ? (
        <p className="text-subtle text-sm">{empty}</p>
      ) : (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t.topics.colTopic}</th>
                <th scope="col" className="num">
                  {t.topics.colViews}
                </th>
                <th scope="col" className="num">
                  {t.topics.colLinks}
                </th>
                <th scope="col" className="num">
                  {t.topics.colScore}
                </th>
                <th scope="col">{t.topics.colWhy}</th>
                <th scope="col">
                  <span className="visually-hidden">{t.topics.colActions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((topic) => (
                <TopicRowCells
                  key={topic.id}
                  topic={topic}
                  nicheId={nicheId}
                  t={t}
                  locale={locale}
                  action={action}
                  actionLabel={actionLabel}
                  exploratory={exploratory}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function TopicRowCells({
  topic,
  nicheId,
  t,
  locale,
  action,
  actionLabel,
  exploratory,
}: {
  topic: TopicRow
  nicheId: string
  t: Messages
  locale: Locale
  action: (formData: FormData) => Promise<void>
  actionLabel: string
  exploratory: boolean
}) {
  const signals = topic.signals as {
    medianMonthlyViews?: number
    referenceCount?: number
    trending?: boolean
  }
  const breakdown = topic.breakdown as {
    durability?: number
    demand?: number
    factCheckability?: number
    nicheFit?: number
    recencyMultiplier?: number
  }

  const why = topic.accepted
    ? t.topics.breakdown({
        lasting: pct(breakdown.durability),
        interest: pct(breakdown.demand),
        sources: pct(breakdown.factCheckability),
        fit: pct(breakdown.nicheFit),
      })
    : topic.rejectionDetail.join(' ')

  return (
    <tr>
      <td className="max-w-[22rem]">
        <div className="flex items-center gap-[var(--sp-4)]">
          <span className="text-fg truncate font-medium" title={topic.title}>
            {topic.title}
          </span>
          {signals.trending && <span className="badge bg-warn-weak text-warn">{t.topics.trending}</span>}
        </div>
        <div className="text-subtle mt-[var(--sp-1)] flex gap-[var(--sp-3)] text-xs">
          {topic.sources.map((source) => (
            <span key={source}>{source}</span>
          ))}
        </div>
      </td>

      <td className="num text-muted">
        {typeof signals.medianMonthlyViews === 'number'
          ? Math.round(signals.medianMonthlyViews).toLocaleString(locale)
          : '—'}
      </td>

      <td className="num text-muted" title={t.topics.linksHelp(THRESHOLDS.minExternalLinks)}>
        {typeof signals.referenceCount === 'number' ? signals.referenceCount : '—'}
      </td>

      <td className="num">
        <span
          className={`badge ${
            topic.accepted
              ? exploratory
                ? 'bg-idle-weak text-muted'
                : 'bg-ok-weak text-ok'
              : 'bg-warn-weak text-warn'
          }`}
          title={t.topics.scoreHelp}
        >
          {topic.score.toFixed(2)}
        </span>
      </td>

      {/* Truncated with the full text on hover and in the accessibility tree,
          rather than wrapped: a rejection reason can be three sentences, and
          one long row would set the height for the whole table. */}
      <td className="max-w-[24rem]">
        {topic.accepted ? (
          <span className="text-subtle block truncate text-xs" title={why}>
            {why}
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-[var(--sp-2)]" title={why}>
            {topic.rejectionReasons.map((reason) => (
              <span key={reason} className="badge bg-warn-weak text-warn">
                {t.topics.reasons[reason] ?? reason}
              </span>
            ))}
          </span>
        )}
      </td>

      {/* Always visible, never hover-only: an action that appears on hover is
          invisible to touch and unreachable by keyboard. */}
      <td>
        <div className="flex items-center justify-end gap-[var(--sp-4)] text-xs whitespace-nowrap">
          {topic.usedAt ? (
            <span className="text-subtle">{t.topics.alreadyUsed}</span>
          ) : (
            <Link
              href={`/generate?nicheId=${encodeURIComponent(nicheId)}&topicId=${encodeURIComponent(topic.id)}&topic=${encodeURIComponent(topic.title)}`}
              className="text-accent hover:underline"
            >
              {t.topics.generate}
            </Link>
          )}

          {topic.articleUrl && (
            <a
              href={topic.articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-subtle hover:text-fg"
            >
              {t.topics.article}
            </a>
          )}

          <form action={action}>
            <input type="hidden" name="topicId" value={topic.id} />
            <button type="submit" className="text-subtle hover:text-fg cursor-pointer">
              {actionLabel}
            </button>
          </form>
        </div>
      </td>
    </tr>
  )
}

function topicNicheFit(topic: TopicRow): number | undefined {
  const breakdown = topic.breakdown as { nicheFit?: number }
  return breakdown.nicheFit
}

function pct(value: number | undefined): string {
  return value === undefined ? '—' : `${Math.round(value * 100)}%`
}
