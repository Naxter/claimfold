import { and, eq, gte, isNotNull, sql } from 'drizzle-orm'

import { decryptSecret, redact } from '@claimfold/crypto'
import { igAccounts, metrics, niches, posts, withOrg, withoutTenantScope } from '@claimfold/db'
import { fetchInsights, InstagramError } from '@claimfold/ig'

/**
 * The measure stage.
 *
 * The README has drawn the pipeline as `… → publish → measure` from the
 * beginning, `docs/decisions/0002-what-is-free.md` lists insights among the free
 * features, the OAuth consent screen requests
 * `instagram_business_manage_insights`, `fetchInsights` was written and tested,
 * and the `metrics` table was designed down to the "saves and shares are the
 * ranking signals that matter; likes are vanity" comment.
 *
 * None of it was ever called. Operators were asked to grant Instagram a
 * metrics-reading permission the product never used — which is both a promise
 * not kept and the kind of unused scope a Meta app review flags. This is the
 * missing half.
 *
 * `posts.hook` says it best: "which hook patterns earn saves" is the question the
 * whole insights loop exists to answer, and until now nothing collected the
 * numbers to answer it with.
 */

/**
 * How long a post keeps being worth re-measuring.
 *
 * A carousel's reach is essentially settled after a month, and Instagram's own
 * insights get less useful the further back you go. Polling everything ever
 * published would grow the work linearly forever for numbers nobody reads.
 */
const MEASURE_FOR_DAYS = 30

/** One row per post per day, so a re-run inside the same day updates rather than stacks. */
export interface InsightsOutcome {
  postId: string
  status: 'captured' | 'skipped' | 'failed'
  detail?: string
}

interface Candidate {
  id: string
  orgId: string
  igMediaId: string
  igAccountId: string
  /** IANA zone from the post's channel; null falls back to UTC. */
  timeZone: string | null
}

/**
 * Published posts young enough to still be moving, that have not been measured
 * today.
 *
 * Runs unscoped because the sweep spans tenants, then hands each post to
 * `withOrg` for the actual work — the same shape as `findDuePosts`.
 */
/**
 * The day a measurement is filed under, in the channel's own timezone.
 *
 * A post belongs to exactly one channel, which carries an IANA timezone in its
 * cadence — so "one row per post per day" can mean the operator's day rather
 * than UTC's, and `metrics_post_day_idx` still holds because the timezone is a
 * property of the post's channel, not of the viewer.
 *
 * This was UTC, which is wrong in a way that is easy to miss: an operator in
 * UTC+13 saw a "day" that ended mid-afternoon, so a post published in the
 * evening had its first day's numbers split across two rows and its second day
 * silently merged.
 *
 * Falls back to UTC when a channel has no usable zone. `Intl` throws on an
 * invalid identifier, and a bad timezone string in one channel must not stop
 * the whole sweep.
 *
 * Separately — and this was the actual bug — the day used to be computed twice
 * from two different clocks: the candidate scan filtered on the injected `now`
 * while the upsert called `new Date()`. A sweep crossing midnight checked one
 * day and wrote another, re-measuring everything it had just measured. One
 * clock, threaded through.
 */
function localDay(at: Date, timeZone: string | null): string {
  if (!timeZone) return at.toISOString().slice(0, 10)

  try {
    // `en-CA` formats as YYYY-MM-DD, which is what the `date` column wants.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

export async function findPostsToMeasure(now = new Date()): Promise<Candidate[]> {
  const since = new Date(now.getTime() - MEASURE_FOR_DAYS * 86_400_000)

  return withoutTenantScope(async (tx) => {
    const rows = await tx
      .select({
        id: posts.id,
        orgId: posts.orgId,
        igMediaId: posts.igMediaId,
        igAccountId: posts.igAccountId,
        timeZone: sql<string | null>`${niches.cadence}->>'timezone'`,
      })
      .from(posts)
      .innerJoin(niches, eq(niches.id, posts.nicheId))
      .where(
        and(
          eq(posts.status, 'published'),
          isNotNull(posts.igMediaId),
          isNotNull(posts.igAccountId),
          gte(posts.publishedAt, since),
          /*
            Not measured yet today, where "today" is the CHANNEL's day.

            Computed in SQL rather than in JavaScript because each post's day
            depends on its own channel's timezone — a single `today` string
            compared against every row is what made this UTC-only. Postgres
            resolves the IANA zone per row; an unrecognised one falls back to
            UTC via the coalesce, matching `localDay`.

            The unique index on (post_id, captured_on) would make a second write
            today an upsert anyway; skipping it here saves the API call, which
            is the scarce thing.
          */
          sql`not exists (
            select 1 from ${metrics}
            where ${metrics.postId} = ${posts.id}
              and ${metrics.capturedOn} = (
                ${now}::timestamptz at time zone coalesce(${niches.cadence}->>'timezone', 'UTC')
              )::date
          )`,
        ),
      )
      .limit(50)

    return rows.filter(
      (row): row is Candidate => row.igMediaId !== null && row.igAccountId !== null,
    )
  })
}

/**
 * Read one post's numbers and store them.
 *
 * Failures are per-post and non-fatal. Insights are a nice-to-have that must
 * never be able to interfere with publishing, which is the thing people paid
 * for — so a post whose media has been deleted on Instagram is skipped and the
 * sweep carries on.
 */
export async function measurePost(
  candidate: Candidate,
  /** Must be the same day the candidate scan filtered on. See `localDay`. */
  capturedOn: string = localDay(new Date(), candidate.timeZone),
): Promise<InsightsOutcome> {
  const { id: postId, orgId } = candidate

  const account = await withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select({ encryptedToken: igAccounts.encryptedToken, status: igAccounts.status })
      .from(igAccounts)
      .where(eq(igAccounts.id, candidate.igAccountId))
      .limit(1)
    return row ?? null
  })

  if (!account) return { postId, status: 'skipped', detail: 'account gone' }
  if (account.status !== 'connected') {
    return { postId, status: 'skipped', detail: `account ${account.status}` }
  }

  let accessToken: string
  try {
    accessToken = decryptSecret(account.encryptedToken, 'ig_access_token', orgId)
  } catch {
    return { postId, status: 'skipped', detail: 'token could not be decrypted' }
  }

  try {
    const insights = await fetchInsights(candidate.igMediaId, accessToken)

    await withOrg(orgId, async (tx) => {
      await tx
        .insert(metrics)
        .values({
          orgId,
          postId,
          capturedOn,
          ...insights,
        })
        /*
          One row per post per day is the shape `metrics_post_day_idx` enforces,
          so a second run on the same day replaces the earlier numbers rather
          than failing or duplicating. Later in the day is the better reading.
        */
        .onConflictDoUpdate({
          target: [metrics.postId, metrics.capturedOn],
          set: { ...insights, capturedAt: new Date() },
        })
    })

    return { postId, status: 'captured', detail: `${insights.saved} saves, ${insights.reach} reach` }
  } catch (error) {
    // Redacted because Graph errors echo request parameters, which is how an
    // access token reaches a log file.
    const detail = redact(error instanceof Error ? error.message : String(error))

    if (error instanceof InstagramError && !error.retryable) {
      return { postId, status: 'skipped', detail }
    }
    return { postId, status: 'failed', detail }
  }
}

/** One sweep. Returns what happened, for the worker to log. */
export async function collectInsights(now = new Date()): Promise<InsightsOutcome[]> {
  const candidates = await findPostsToMeasure(now)
  const outcomes: InsightsOutcome[] = []

  // Sequential on purpose: this shares a rate limit with publishing, and
  // publishing is the thing that must not be starved.
  for (const candidate of candidates) {
    outcomes.push(await measurePost(candidate, localDay(now, candidate.timeZone)))
  }

  return outcomes
}

export { MEASURE_FOR_DAYS }
