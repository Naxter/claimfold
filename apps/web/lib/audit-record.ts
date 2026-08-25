import { db, getAccount, getPost, schema } from '@claimfold/db'
import { inArray } from 'drizzle-orm'

/**
 * The per-post editorial record.
 *
 * This is the artefact that answers "where did you get that?" — every claim,
 * its verdict, the sources consulted, who overrode what and why, and who took
 * editorial responsibility by approving it.
 *
 * It is also the evidence for EU AI Act Art. 50(4), applicable 2 August 2026:
 * a deployer publishing AI-generated text on matters of public interest must
 * disclose it *unless* the content underwent substantive human review with a
 * named person holding editorial responsibility. "Substantive review" is not
 * self-certifying — it is something you have to be able to show. This is that.
 *
 * Deliberately assembled in one place and exported in three formats, because
 * whoever eventually asks for it (a platform, a regulator, a customer, a
 * journalist) will want it in a form nobody can predict.
 */

export interface AuditRecord {
  post: {
    id: string
    title: string
    hook: string
    status: string
    format: string
    caption: string
    hashtags: string[]
    aiDisclosure: boolean
    createdAt: string
    approvedAt: string | null
    scheduledAt: string | null
    publishedAt: string | null
    igMediaId: string | null
    reviewNotes: string | null
    /**
     * The account this went out on.
     *
     * The record stored the media id and never which account published it, so it
     * could not answer "which of my accounts was this?" — a question this document
     * exists to answer for anyone running more than one channel.
     */
    account: { username: string; igUserId: string } | null
  }
  niche: {
    name: string
    slug: string
    language: string
    minConfidence: number
    requireSources: boolean
    publicInterest: boolean
  }
  /** Named, because "a human reviewed it" is not a defence without the human. */
  approvedBy: { name: string; email: string } | null
  slides: Array<{
    index: number
    role: string
    altText: string
    text: string
    /**
     * Who rewrote this slide after it was researched, and when.
     *
     * The claims below are attached to slides by index, so a slide edited after
     * the fact carries text that was never read against the sources listed for
     * it. Recording that here is what keeps this document honest: "a human
     * reviewed it" is the AI Act Art. 50(4) exemption, and an edit nobody can
     * see quietly turns the same document into a claim it cannot support.
     */
    editedBy: { name: string; email: string } | null
    editedAt: string | null
  }>
  claims: Array<{
    claim: string
    verdict: string
    confidence: number
    reasoning: string
    isCore: boolean
    sources: Array<{ url: string; title: string; publisher?: string; quote?: string }>
    /** Set when a person published this claim despite its verdict. */
    override: { by: { name: string; email: string } | null; note: string } | null
  }>
  /** Every page the verifier opened, whether or not it was cited. */
  consultedSources: Array<{ url: string; title: string }>
  generatedAt: string
}

export async function buildAuditRecord(
  orgId: string,
  postId: string,
): Promise<AuditRecord | null> {
  const detail = await getPost(orgId, postId)
  if (!detail) return null

  const { post, niche, slides, claims } = detail

  const account = post.igAccountId ? await getAccount(orgId, post.igAccountId) : null

  // Users are not a tenant table — they can belong to several organizations —
  // so this lookup is by explicit id list rather than through withOrg. Only ids
  // already stored on this org's rows are resolved, so nothing leaks.
  const userIds = [
    post.approvedBy,
    ...claims.map((c) => c.resolvedBy),
    ...slides.map((s) => s.editedBy),
  ].filter((id): id is string => Boolean(id))

  const people = new Map<string, { name: string; email: string }>()
  if (userIds.length > 0) {
    const rows = await db
      .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
      .from(schema.user)
      .where(inArray(schema.user.id, [...new Set(userIds)]))
    for (const row of rows) people.set(row.id, { name: row.name, email: row.email })
  }

  return {
    post: {
      id: post.id,
      title: post.title,
      hook: post.hook,
      status: post.status,
      format: post.format,
      caption: post.caption,
      hashtags: post.hashtags,
      aiDisclosure: post.aiDisclosure,
      createdAt: post.createdAt.toISOString(),
      approvedAt: post.approvedAt?.toISOString() ?? null,
      scheduledAt: post.scheduledAt?.toISOString() ?? null,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      igMediaId: post.igMediaId,
      reviewNotes: post.reviewNotes,
      account: account ? { username: account.username, igUserId: account.igUserId } : null,
    },
    niche: {
      name: niche.name,
      slug: niche.slug,
      language: niche.language,
      minConfidence: niche.rules.minConfidence,
      requireSources: niche.rules.requireSources,
      publicInterest: niche.rules.publicInterest,
    },
    approvedBy: post.approvedBy ? (people.get(post.approvedBy) ?? null) : null,
    slides: slides.map((slide) => ({
      index: slide.index,
      role: slide.role,
      altText: slide.altText,
      text: flattenSlide(slide.content),
      editedBy: slide.editedBy ? (people.get(slide.editedBy) ?? null) : null,
      editedAt: slide.editedAt?.toISOString() ?? null,
    })),
    claims: claims.map((claim) => ({
      claim: claim.claim,
      verdict: claim.verdict,
      confidence: claim.confidence,
      reasoning: claim.reasoning,
      isCore: claim.isCore,
      sources: claim.sources.map((s) => ({
        url: s.url,
        title: s.title,
        ...(s.publisher ? { publisher: s.publisher } : {}),
        ...(s.quote ? { quote: s.quote } : {}),
      })),
      override: claim.resolvedBy
        ? {
            by: people.get(claim.resolvedBy) ?? null,
            note: claim.resolvedNote ?? '',
          }
        : null,
    })),
    consultedSources: post.consultedSources,
    generatedAt: new Date().toISOString(),
  }
}

/** Slide content is a loose object; this reduces it to the words on the slide. */
function flattenSlide(content: Record<string, unknown>): string {
  const parts: string[] = []
  for (const key of ['kicker', 'headline', 'body', 'figure', 'figureLabel', 'footnote']) {
    const value = content[key]
    if (typeof value === 'string' && value.trim()) parts.push(value.trim())
  }
  const items = content['items']
  if (Array.isArray(items)) {
    for (const item of items) if (typeof item === 'string') parts.push(`· ${item}`)
  }
  return parts.join('\n')
}

/* ─── CSV ─────────────────────────────────────────────────────────────────── */

const CSV_COLUMNS = [
  'post_id',
  'post_title',
  'post_status',
  'published_at',
  'approved_by',
  'ai_disclosure',
  'claim',
  'is_core',
  'verdict',
  'confidence',
  'reasoning',
  'source_urls',
  'source_titles',
  'overridden_by',
  'override_note',
] as const

export function auditRecordToCsv(record: AuditRecord): string {
  const rows = record.claims.map((claim) => [
    record.post.id,
    record.post.title,
    record.post.status,
    record.post.publishedAt ?? '',
    record.approvedBy ? `${record.approvedBy.name} <${record.approvedBy.email}>` : '',
    String(record.post.aiDisclosure),
    claim.claim,
    String(claim.isCore),
    claim.verdict,
    claim.confidence.toFixed(2),
    claim.reasoning,
    claim.sources.map((s) => s.url).join(' | '),
    claim.sources.map((s) => s.title).join(' | '),
    claim.override?.by ? `${claim.override.by.name} <${claim.override.by.email}>` : '',
    claim.override?.note ?? '',
  ])

  // BOM so Excel opens UTF-8 correctly — without it, German umlauts in a
  // German audit trail arrive mojibaked, which is exactly the impression you
  // do not want to make with a compliance document.
  return '﻿' + [CSV_COLUMNS, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

function csvCell(value: string): string {
  // A leading =, +, - or @ makes Excel treat the cell as a formula. The text
  // here comes from a model that read attacker-controllable web pages, so it
  // is prefixed rather than trusted.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${guarded.replace(/"/g, '""')}"`
}
