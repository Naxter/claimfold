import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { withOrg } from '../rls.ts'
import { topics } from '../schema/index.ts'

/**
 * Tenant-scoped access to discovered topics.
 *
 * Reads and writes go through `withOrg`, so row-level security scopes them
 * rather than a hand-written `WHERE org_id` that can be forgotten.
 */

export type TopicRow = typeof topics.$inferSelect

export interface TopicUpsert {
  nicheId: string
  title: string
  dedupeKey: string
  sources: string[]
  articleUrl?: string
  signals: Record<string, unknown>
  breakdown: Record<string, unknown>
  score: number
  accepted: boolean
  rejectionReasons: string[]
  rejectionDetail: string[]
}

/**
 * Store a discovery run.
 *
 * Upsert rather than insert: running discovery again should refresh a topic's
 * evidence, not stack a second copy of it beside the first. `usedAt` and
 * `dismissedAt` are deliberately left alone — those record what a person did,
 * and a later run has no business undoing it.
 */
export async function saveTopics(
  orgId: string,
  rows: TopicUpsert[],
): Promise<number> {
  if (rows.length === 0) return 0

  return withOrg(orgId, async (tx) => {
    await tx
      .insert(topics)
      .values(rows.map((row) => ({ ...row, orgId })))
      .onConflictDoUpdate({
        target: [topics.nicheId, topics.dedupeKey],
        set: {
          title: sql`excluded.title`,
          sources: sql`excluded.sources`,
          articleUrl: sql`excluded.article_url`,
          signals: sql`excluded.signals`,
          breakdown: sql`excluded.breakdown`,
          score: sql`excluded.score`,
          accepted: sql`excluded.accepted`,
          rejectionReasons: sql`excluded.rejection_reasons`,
          rejectionDetail: sql`excluded.rejection_detail`,
          updatedAt: new Date(),
        },
      })

    return rows.length
  })
}

export interface ListTopicsOptions {
  nicheId?: string
  /** Include the ones the prefilter refused. They are kept for a reason. */
  includeRejected?: boolean
  includeDismissed?: boolean
  limit?: number
}

export async function listTopics(
  orgId: string,
  options: ListTopicsOptions = {},
): Promise<TopicRow[]> {
  const { nicheId, includeRejected = true, includeDismissed = false, limit = 200 } = options

  return withOrg(orgId, async (tx) => {
    const conditions = [
      nicheId ? eq(topics.nicheId, nicheId) : undefined,
      includeRejected ? undefined : eq(topics.accepted, true),
      includeDismissed ? undefined : isNull(topics.dismissedAt),
    ].filter((c) => c !== undefined)

    return tx
      .select()
      .from(topics)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(topics.accepted), desc(topics.score))
      .limit(limit)
  })
}


/** Hide a topic without deleting the evidence behind it. */
export async function dismissTopic(orgId: string, topicId: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx
      .update(topics)
      .set({ dismissedAt: new Date(), updatedAt: new Date() })
      .where(eq(topics.id, topicId))
  })
}

export async function restoreTopic(orgId: string, topicId: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx
      .update(topics)
      .set({ dismissedAt: null, updatedAt: new Date() })
      .where(eq(topics.id, topicId))
  })
}

/** Record that a post was generated from this topic. */
export async function markTopicUsed(orgId: string, topicId: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx
      .update(topics)
      .set({ usedAt: new Date(), updatedAt: new Date() })
      .where(eq(topics.id, topicId))
  })
}
