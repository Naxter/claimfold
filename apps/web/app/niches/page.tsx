import type { Metadata } from 'next'
import Link from 'next/link'

import { listArchivedNiches, listNiches } from '@claimfold/db'

import { ActionButton } from '../../components/action-button.tsx'
import { ChannelGenerator } from '../../components/channel-generator.tsx'
import { Shell } from '../../components/shell.tsx'
import { getMessages, languageName, LOCALES, LOCALE_LABELS } from '../../lib/i18n/index.ts'
import { describeNicheErrors, packFromRow } from '../../lib/niche.ts'
import { can } from '../../lib/permissions.ts'
import { requireSession } from '../../lib/session.ts'
import {
  archiveChannelAction,
  duplicateChannelAction,
  restoreChannelAction,
} from './actions.ts'

export const dynamic = 'force-dynamic'

/**
 * A tab you can tell apart from the other eight.
 *
 * The root layout supplies the `%s · Claimfold` template; this only names the
 * page. Resolved through the catalogue so the tab is in the reader's language
 * like everything else.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).niches.title }
}


/**
 * The topic configuration, made visible.
 *
 * This page exists because "topic-agnostic" is a claim the product makes about
 * itself, and a claim you cannot see is indistinguishable from one that isn't
 * true. Everything here is data in a `jsonb` column — no code anywhere knows
 * what a myth is, or a recipe, or a stock.
 *
 * It was read-only for a long time, on the argument that a half-built editor
 * which can save an invalid pack is worse than none — `packFromRow` fails closed,
 * so the whole channel would stop working with an error nobody can act on. That
 * reasoning was sound and the conclusion was not: it left three hardcoded presets
 * and a re-seed as the only way to have a channel, which the presets file itself
 * describes as not the intended path. The editor now exists and routes every
 * field through the same `validateNichePack` the gate uses, which is what makes
 * saving an invalid pack impossible rather than merely discouraged.
 */
export default async function NichesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; archived?: string }>
}) {
  const session = await requireSession()
  const t = await getMessages()
  const { saved, error, archived } = await searchParams

  const mayEdit = can(session, 'edit')
  const rows = await listNiches(session.orgId)
  const retired = archived ? await listArchivedNiches(session.orgId) : []

  return (
    <Shell session={session} title={t.niches.title}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-[var(--sp-5)]">
        <p className="max-w-2xl text-sm text-subtle">{t.niches.intro}</p>
        {mayEdit && (
          <Link href="/niches/new" className="btn shrink-0">
            {t.channels.create}
          </Link>
        )}
      </div>

      {saved && (
        <div className="mb-6 max-w-2xl rounded-[var(--radius-2)] border border-ok bg-ok-weak p-3 text-sm text-ok">
          {t.channels.saved}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-6 max-w-2xl rounded-[var(--radius-2)] border border-err bg-err-weak p-3 text-sm text-err"
        >
          {error}
        </div>
      )}

      {mayEdit && (
      <ChannelGenerator
        languages={LOCALES.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] }))}
        defaultLanguage={rows[0]?.language ?? 'en'}
        labels={t.channels.generator}
      />
      )}

      {rows.length === 0 ? (
        <div className="max-w-2xl rounded-lg border border-dashed border-rule p-8 text-sm">
          <p className="mb-2 text-muted">{t.niches.empty.title}</p>
          <p className="text-subtle">{t.niches.empty.body('npm run db:seed')}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((row) => {
            const parsed = packFromRow(row)
            return (
              <article
                key={row.id}
                className={`flex flex-col rounded-lg border p-4 ${
                  parsed.ok ? 'border-rule bg-raised' : 'border-err bg-err-weak'
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-fg">{row.name}</h2>
                    <p className="text-xs text-subtle">
                      {row.slug} · {languageName(row.language)}
                    </p>
                  </div>
                  {row.isDefault && (
                    <span className="shrink-0 rounded bg-sunken px-1.5 py-0.5 text-xs tracking-wide text-muted uppercase">
                      {t.niches.default}
                    </span>
                  )}
                </div>

                {row.description && (
                  <p className="mb-3 text-xs leading-relaxed text-subtle">{row.description}</p>
                )}

                {!parsed.ok ? (
                  <p className="text-xs text-err">
                    {t.niches.invalid(describeNicheErrors(parsed.errors))}
                  </p>
                ) : (
                  <>
                    <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <Row label={t.niches.formats} value={String(row.formats.length)} />
                      <Row label={t.niches.seeds} value={String(row.topicSeeds.length)} />
                      <Row
                        label={t.niches.minConfidence}
                        value={row.rules.minConfidence.toFixed(2)}
                      />
                      <Row label={t.niches.theme} value={row.themeId} />
                      <Row
                        label={t.niches.requireSources}
                        value={row.rules.requireSources ? t.common.yes : t.common.no}
                      />
                      <Row
                        label={t.niches.publicInterest}
                        value={row.rules.publicInterest ? t.common.yes : t.common.no}
                      />
                    </dl>

                    <p className="mb-1 text-xs tracking-wide text-subtle uppercase">
                      {t.niches.formats}
                    </p>
                    <ul className="mb-3 flex flex-wrap gap-1">
                      {row.formats.map((format) => (
                        <li
                          key={format.id}
                          title={format.description}
                          className="rounded bg-sunken px-1.5 py-0.5 text-xs text-muted"
                        >
                          {format.name}{' '}
                          <span className="text-subtle">
                            {format.minSlides}–{format.maxSlides}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {row.rules.forbiddenTopics.length > 0 && (
                      <p className="mb-3 text-xs text-subtle">
                        {t.niches.neverCovers} {row.rules.forbiddenTopics.join(', ')}
                      </p>
                    )}
                  </>
                )}

                {/* Offered even when the pack will not validate — a channel that
                    has drifted into an invalid state is exactly the one somebody
                    needs to open and fix. */}
                {mayEdit && (
                <div className="mt-auto flex flex-wrap items-center gap-[var(--sp-3)] border-t border-rule pt-3">
                  <Link href={`/niches/${row.id}`} className="btn btn-ghost px-2 py-1 text-xs">
                    {t.channels.edit}
                  </Link>

                  <form action={duplicateChannelAction}>
                    <input type="hidden" name="nicheId" value={row.id} />
                    <ActionButton
                      idle={t.channels.duplicate}
                      busy="…"
                      className="btn btn-quiet px-2 py-1 text-xs"
                    />
                  </form>

                  <form action={archiveChannelAction} className="ml-auto">
                    <input type="hidden" name="nicheId" value={row.id} />
                    <ActionButton
                      idle={t.channels.archive}
                      busy="…"
                      className="btn btn-quiet px-2 py-1 text-xs hover:border-err hover:text-err"
                    />
                  </form>
                </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {/* ── Retired ──────────────────────────────────────────────────────────
          Behind a link rather than always on screen: retired channels are the
          rare case, and `archivedAt` existed for a year with nothing setting it
          because there was no way to retire one in the first place. */}
      <div className="mt-8">
        {archived ? (
          <>
            <h2 className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">
              {t.channels.archivedHeading}
            </h2>
            <p className="mb-4 max-w-2xl text-xs leading-relaxed text-subtle">
              {t.channels.archivedNote}
            </p>

            {retired.length === 0 ? (
              <p className="text-sm text-subtle">{t.niches.empty.title}</p>
            ) : (
              <ul className="grid max-w-2xl gap-2">
                {retired.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-3 rounded-[var(--radius-2)] border border-rule bg-sunken p-3 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      {row.name}{' '}
                      <span className="text-xs text-subtle">
                        {row.slug} · {languageName(row.language)}
                      </span>
                    </span>
                    <form action={restoreChannelAction}>
                      <input type="hidden" name="nicheId" value={row.id} />
                      <ActionButton
                        idle={t.channels.restore}
                        busy="…"
                        className="btn btn-ghost px-2 py-1 text-xs"
                      />
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <Link href="/niches" className="mt-4 inline-block text-xs text-accent hover:underline">
              {t.common.dismiss}
            </Link>
          </>
        ) : (
          <Link href="/niches?archived=1" className="text-xs text-accent hover:underline">
            {t.channels.archivedHeading}
          </Link>
        )}
      </div>

      <p className="mt-8 max-w-2xl text-xs text-subtle">
        {t.niches.footer}{' '}
        <Link href="/generate" className="text-accent hover:underline">
          {t.niches.footerLink}
        </Link>
        .
      </p>
    </Shell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-subtle">{label}</dt>
      <dd className="text-muted">{value}</dd>
    </>
  )
}
