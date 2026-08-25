import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { buildAuditRecord, type AuditRecord } from '../../../../lib/audit-record.ts'
import { getMessages, languageName } from '../../../../lib/i18n/index.ts'
import { requireSession } from '../../../../lib/session.ts'

export const dynamic = 'force-dynamic'

/**
 * A tab you can tell apart from the other eight.
 *
 * The root layout supplies the `%s · Claimfold` template; this only names the
 * page. Resolved through the catalogue so the tab is in the reader's language
 * like everything else.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).record.kicker }
}


/**
 * The printable editorial record.
 *
 * Print-to-PDF rather than a PDF library: a browser already renders this
 * exactly, on every platform, with no extra dependency in the web image and no
 * font-embedding problem. A generated PDF would look marginally more official
 * and cost a permanent maintenance surface for it.
 *
 * Styled light-on-white against the dashboard's dark theme on purpose. This is
 * a document, and it is going to end up on paper or in an email attachment.
 */
export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params
  const t = (await getMessages()).record

  const record = await buildAuditRecord(session.orgId, id)
  if (!record) notFound()

  const unresolved = record.claims.filter(
    (c) => c.isCore && c.verdict !== 'supported' && !c.override,
  ).length

  return (
    <div className="min-h-screen bg-white text-[#111] print:bg-white">
      <div className="mx-auto max-w-3xl px-8 py-10 print:px-0 print:py-0">
        {/* Screen-only controls. */}
        <div className="mb-8 flex items-center gap-4 text-sm print:hidden">
          <Link href={`/posts/${record.post.id}`} className="text-[#555] hover:underline">
            {t.backToReview}
          </Link>
          <span className="text-[#bbb]">·</span>
          <a href={`/posts/${record.post.id}/export?format=json`} className="text-[#555] hover:underline">
            {t.downloadJson}
          </a>
          <a href={`/posts/${record.post.id}/export?format=csv`} className="text-[#555] hover:underline">
            {t.downloadCsv}
          </a>
          <span className="ml-auto text-xs text-[#888]">{t.printHint}</span>
        </div>

        <header className="mb-8 border-b border-[#ddd] pb-6">
          <p className="mb-1 text-xs tracking-[0.12em] text-[#888] uppercase">{t.kicker}</p>
          <h1 className="mb-2 text-2xl leading-tight font-semibold">
            {record.post.title || record.post.hook || t.untitled}
          </h1>
          <p className="text-sm text-[#555]">
            {record.niche.name} · {languageName(record.niche.language)} ·{' '}
            {record.post.format} · {record.post.status}
          </p>
        </header>

        {/* ── Summary ──────────────────────────────────────────────────── */}
        <Section title={t.summary}>
          <dl className="grid grid-cols-[minmax(0,180px)_1fr] gap-x-6 gap-y-1.5 text-sm">
            <Field label={t.postId} value={record.post.id} mono />
            <Field label={t.created} value={formatStamp(record.post.createdAt)} />
            <Field label={t.approved} value={formatStamp(record.post.approvedAt)} />
            <Field
              label={t.responsibility}
              value={
                record.approvedBy
                  ? `${record.approvedBy.name} <${record.approvedBy.email}>`
                  : t.notApproved
              }
            />
            <Field label={t.published} value={formatStamp(record.post.publishedAt)} />
            {record.post.igMediaId && (
              <Field label={t.igMediaId} value={record.post.igMediaId} mono />
            )}
            <Field
              label={t.aiDisclosure}
              value={record.post.aiDisclosure ? t.labelled : t.notLabelled}
            />
            <Field
              label={t.confidenceFloor}
              value={t.confidenceFloorValue(record.niche.minConfidence.toFixed(2))}
            />
            <Field
              label={t.claimsLabel}
              value={t.claimsValue(
                record.claims.length,
                record.claims.filter((c) => c.isCore).length,
                record.claims.filter((c) => c.override).length,
              )}
            />
            <Field label={t.pagesConsulted} value={String(record.consultedSources.length)} />
          </dl>

          {unresolved > 0 && (
            <p className="mt-4 border-l-2 border-[#c0392b] pl-3 text-sm text-[#c0392b]">
              {t.unresolved(unresolved)}
            </p>
          )}
        </Section>

        {/* ── Claims ───────────────────────────────────────────────────── */}
        <Section title={t.claimsTitle(record.claims.length)}>
          {record.claims.length === 0 ? (
            <p className="text-sm text-[#777]">{t.noClaims}</p>
          ) : (
            <ol className="space-y-5">
              {record.claims.map((claim, i) => (
                <li key={i} className="break-inside-avoid text-sm">
                  <div className="mb-1 flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-xs text-[#888]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="font-medium uppercase">{claim.verdict}</span>
                    <span className="text-[#666]">{claim.confidence.toFixed(2)}</span>
                    {claim.isCore && (
                      <span className="rounded bg-[#eee] px-1.5 py-0.5 text-xs tracking-wide uppercase">
                        {t.core}
                      </span>
                    )}
                  </div>

                  <p className="mb-1 leading-snug">{claim.claim}</p>
                  <p className="mb-2 text-[13px] leading-relaxed text-[#555]">{claim.reasoning}</p>

                  {claim.sources.length > 0 ? (
                    <ul className="space-y-1 text-[12px]">
                      {claim.sources.map((source, j) => (
                        <li key={j} className="break-words">
                          <span className="text-[#333]">{source.title}</span>
                          {source.publisher ? ` — ${source.publisher}` : ''}
                          <br />
                          <span className="font-mono text-xs text-[#777]">{source.url}</span>
                          {source.quote && (
                            <blockquote className="mt-1 border-l-2 border-[#ddd] pl-2 text-[#555] italic">
                              {source.quote}
                            </blockquote>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12px] text-[#999]">{t.noSources}</p>
                  )}

                  {claim.override && (
                    <p className="mt-2 border-l-2 border-[#b7791f] pl-3 text-[13px]">
                      <strong>{t.overriddenBy}</strong>{' '}
                      {claim.override.by
                        ? `${claim.override.by.name} <${claim.override.by.email}>`
                        : t.overriddenByUnknown}
                      {claim.override.note ? `: ${claim.override.note}` : '.'}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* ── Published content ────────────────────────────────────────── */}
        <Section title={t.slidesTitle(record.slides.length)}>
          {record.slides.length === 0 ? (
            <p className="text-sm text-[#777]">{t.nothingWritten}</p>
          ) : (
            <ol className="space-y-3 text-sm">
              {record.slides.map((slide) => (
                <li key={slide.index} className="break-inside-avoid">
                  <p className="mb-0.5 text-xs text-[#888]">
                    {slide.index + 1}. {slide.role}
                  </p>
                  <p className="whitespace-pre-wrap">{slide.text}</p>
                  <p className="mt-0.5 text-[12px] text-[#777]">
                    {t.altText} {slide.altText}
                  </p>
                  {/* A slide rewritten after the research carries text that was
                      never read against the sources listed below. Naming who did
                      it is what keeps this document able to support the claim it
                      makes — an invisible edit would quietly hollow it out. */}
                  {slide.editedAt && (
                    <p className="mt-0.5 text-[12px] text-[#777]">
                      {t.editedByHand}{' '}
                      {slide.editedBy
                        ? `${slide.editedBy.name} <${slide.editedBy.email}>`
                        : t.overriddenByUnknown}
                      {' · '}
                      {formatStamp(slide.editedAt)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Section>

        {record.post.caption && (
          <Section title={t.captionTitle}>
            <p className="text-sm whitespace-pre-wrap">{record.post.caption}</p>
            {record.post.hashtags.length > 0 && (
              <p className="mt-2 text-[13px] text-[#666]">
                {record.post.hashtags.map((h) => `#${h}`).join(' ')}
              </p>
            )}
          </Section>
        )}

        {record.post.reviewNotes?.trim() && (
          <Section title={t.reviewNoteTitle}>
            <p className="text-sm whitespace-pre-wrap">{record.post.reviewNotes}</p>
          </Section>
        )}

        {record.consultedSources.length > 0 && (
          <Section title={t.consultedTitle(record.consultedSources.length)}>
            <p className="mb-2 text-[13px] text-[#666]">{t.consultedIntro}</p>
            <ul className="space-y-0.5 text-[12px]">
              {record.consultedSources.map((source, i) => (
                <li key={i} className="break-words">
                  {source.title} — <span className="font-mono text-xs text-[#777]">{source.url}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <footer className="mt-10 border-t border-[#ddd] pt-4 text-xs leading-relaxed text-[#777]">
          <p className="mb-2">{t.producedAt(formatStamp(record.generatedAt), record.post.id)}</p>
          <p>{t.disclaimer}</p>
        </footer>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 break-inside-avoid">
      <h2 className="mb-3 border-b border-[#eee] pb-1 text-xs font-semibold tracking-[0.12em] text-[#888] uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-[#777]">{label}</dt>
      <dd className={mono ? 'font-mono text-[12px] break-all' : ''}>{value}</dd>
    </>
  )
}

function formatStamp(iso: string | null): string {
  if (!iso) return '—'
  // Fixed locale and explicit UTC: this document may be read anywhere, and a
  // date that means something different depending on the reader's machine is
  // not a record.
  return `${new Date(iso).toISOString().replace('T', ' ').slice(0, 19)} UTC`
}

export type { AuditRecord }
