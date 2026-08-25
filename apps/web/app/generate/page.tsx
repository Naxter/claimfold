import type { Metadata } from 'next'
import Link from 'next/link'

import { listNiches, recentJobs, spendOverDays } from '@claimfold/db'
import { MAX_CAROUSEL_SLIDES } from '@claimfold/niches'

import { Shell } from '../../components/shell.tsx'
import { getLocale, getMessages } from '../../lib/i18n/index.ts'
import { describeNicheErrors, packFromRow } from '../../lib/niche.ts'
import { requireSession } from '../../lib/session.ts'
import { generateAction } from './actions.ts'
import { GenerateForm, type NicheOption } from './generate-form.tsx'

export const dynamic = 'force-dynamic'

/**
 * A tab you can tell apart from the other eight.
 *
 * The root layout supplies the `%s · Claimfold` template; this only names the
 * page. Resolved through the catalogue so the tab is in the reader's language
 * like everything else.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).generate.title }
}


export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; topic?: string; topicId?: string; nicheId?: string }>
}) {
  const session = await requireSession()
  const { error, topic, topicId, nicheId } = await searchParams
  const t = await getMessages()
  const locale = await getLocale()

  const rows = await listNiches(session.orgId)

  // Validated here rather than at submit time so a misconfigured niche is
  // visible before someone selects it and waits a minute to find out.
  const niches: NicheOption[] = rows.map((row) => {
    const parsed = packFromRow(row)
    return {
      id: row.id,
      name: row.name,
      language: row.language,
      formatsLabel: t.generate.formats(row.formats.length),
      isDefault: row.isDefault,
      ...(parsed.ok ? {} : { problem: describeNicheErrors(parsed.errors) }),
    }
  })

  /*
    Thirty days back. Long enough to be a bill-shaped number, short enough that
    it changes when behaviour changes — a lifetime total stops being
    informative after the first month.
  */
  const [history, spend] = await Promise.all([
    recentJobs(session.orgId, 'generate', 5),
    spendOverDays(session.orgId, 30),
  ])

  // The one-running-per-kind index means there is at most one.
  const running = history.find((job) => job.status === 'running')

  return (
    <Shell
      session={session}
      title={t.generate.title}
      actions={
        <Link href="/" className="text-xs text-subtle hover:text-muted">
          {t.nav.backToBoard}
        </Link>
      }
    >
      <p className="mb-6 max-w-xl text-sm text-subtle">{t.generate.intro}</p>

      {error && (
        <div
          role="alert"
          className="mb-6 max-w-xl rounded-lg border border-err bg-err-weak p-3 text-sm text-err"
        >
          {error}
        </div>
      )}

      {/**
       * A generation that is still running, surfaced where the person is.
       *
       * Generation runs inline in the server action and takes about a minute of
       * billable work. Reload or navigate away and it keeps going, keeps
       * spending, and creates the post — but the redirect that would have taken
       * you to it is gone. The only trace was a line in "Recent" further down
       * this same page, which a returning user has no reason to scroll to.
       *
       * The job row already exists (`startExclusiveJob`), so this costs nothing
       * beyond reading what is already fetched.
       */}
      {running && (
        <div
          role="status"
          className="mb-6 max-w-xl rounded-lg border border-warn bg-warn-weak p-3 text-sm text-warn"
        >
          <p className="font-medium">{t.generate.alreadyRunning}</p>
          <p className="mt-1 text-xs">
            {t.generate.alreadyRunningSince(running.startedAt ?? running.createdAt, locale)}
          </p>
        </div>
      )}

      {niches.length === 0 ? (
        <div className="max-w-xl rounded-lg border border-dashed border-rule p-8 text-sm">
          <p className="mb-2 text-muted">{t.generate.noNiche.title}</p>
          <p className="text-subtle">
            {t.generate.noNiche.body} {t.generate.noNiche.seedHint('npm run db:seed')}
          </p>
        </div>
      ) : (
        <GenerateForm
          niches={niches}
          action={generateAction}
          maxSlides={MAX_CAROUSEL_SLIDES}
          t={{
            niche: t.generate.niche,
            nicheHelp: t.generate.nicheHelp,
            topic: t.generate.topic,
            topicPlaceholder: t.generate.topicPlaceholder,
            topicFromDiscovery: t.generate.topicFromDiscovery,
            slides: t.generate.slides,
            slidesPlaceholder: t.generate.slidesPlaceholder,
            slidesHelp: t.generate.slidesHelp(MAX_CAROUSEL_SLIDES),
            submit: t.generate.submit,
            working: t.generate.working,
            cost: t.generate.cost,
            stages: t.generate.stages,
            gateNote: t.generate.gateNote,
            misconfigured: t.generate.misconfigured,
            optional: t.common.optional,
          }}
          {...(nicheId ? { defaultNicheId: nicheId } : {})}
          {...(topic ? { defaultTopic: topic.slice(0, 300) } : {})}
          {...(topicId ? { topicId } : {})}
        />
      )}

      {niches.some((n) => n.problem) && (
        <div className="mt-6 max-w-xl rounded-lg border border-warn bg-warn-weak p-3 text-xs text-warn">
          <p className="mb-1 font-medium">{t.generate.problems}</p>
          <ul className="space-y-1">
            {niches
              .filter((n) => n.problem)
              .map((n) => (
                <li key={n.id}>
                  {n.name} — {n.problem}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/**
       * What this has actually cost.
       *
       * The per-run figure was recorded on every job and read by nothing but a
       * dev script, so an operator spending real money per post had no way to
       * answer "how much this month" from inside the product. Shown next to the
       * button that spends it, which is the only place the number changes a
       * decision.
       */}
      {spend.runs > 0 && (
        <p className="mt-8 max-w-xl text-xs text-subtle">
          {t.generate.spend(spend.runs, spend.totalUsd.toFixed(2))}
        </p>
      )}

      {history.length > 0 && (
        <section className="mt-10 max-w-xl">
          <h2 className="mb-3 text-xs font-medium tracking-wide text-subtle uppercase">
            {t.generate.recentRuns}
          </h2>
          <ul className="space-y-1.5 text-xs">
            {history.map((job) => {
              const postId = job.payload['postId']
              const cost = job.payload['costUsd']
              return (
                <li key={job.id} className="flex items-center gap-2 text-subtle">
                  <span
                    className={
                      job.status === 'failed'
                        ? 'text-err'
                        : job.status === 'running'
                          ? 'text-warn'
                          : 'text-accent'
                    }
                  >
                    {job.status}
                  </span>
                  {/* The reader's locale, not the server's. This page renders
                      on a box in whatever region was cheapest, so an argument-
                      less `toLocaleString()` formatted run times for the
                      machine — the board already gets this right one file
                      over. */}
                  <span>{job.createdAt.toLocaleString(locale)}</span>
                  {typeof cost === 'number' && <span>${cost.toFixed(4)}</span>}
                  {typeof postId === 'string' && (
                    <Link href={`/posts/${postId}`} className="text-accent hover:underline">
                      {t.common.open}
                    </Link>
                  )}
                  {job.lastError && (
                    <span className="truncate text-err">{job.lastError.slice(0, 80)}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </Shell>
  )
}
