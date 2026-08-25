import { desc, eq } from 'drizzle-orm'

import { withOrg } from '../rls.ts'
import { metrics } from '../schema/index.ts'

/**
 * Reading what a published post actually did.
 *
 * The `metrics` table had no readers and no writers for its whole life while the
 * README promised a "measure" stage. The worker writes it now
 * (apps/worker/src/insights-job.ts); this is the other end.
 */

export interface PostMetrics {
  capturedOn: string
  reach: number
  impressions: number
  saved: number
  shares: number
  likes: number
  comments: number
  profileVisits: number
  follows: number
}

/**
 * The most recent reading for one post, or null if it has never been measured.
 *
 * Latest rather than a sum: these are cumulative totals from Instagram, not daily
 * deltas, so adding the rows up would multiply the same reach by however many
 * days the post has been polled. The history exists so a trend can be drawn
 * later; the single number a reviewer wants is the newest one.
 */
export async function latestMetrics(orgId: string, postId: string): Promise<PostMetrics | null> {
  return withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select({
        capturedOn: metrics.capturedOn,
        reach: metrics.reach,
        impressions: metrics.impressions,
        saved: metrics.saved,
        shares: metrics.shares,
        likes: metrics.likes,
        comments: metrics.comments,
        profileVisits: metrics.profileVisits,
        follows: metrics.follows,
      })
      .from(metrics)
      .where(eq(metrics.postId, postId))
      .orderBy(desc(metrics.capturedOn))
      .limit(1)

    return row ?? null
  })
}
