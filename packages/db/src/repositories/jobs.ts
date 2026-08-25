import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'

import { withOrg, withoutTenantScope } from '../rls.ts'
import { jobs } from '../schema/index.ts'

/**
 * Durable record of background work.
 *
 * Used here for exclusion and accounting rather than queueing: generation runs
 * inline in a request, but it costs money and takes a minute, so there has to
 * be a record that it is happening and what it cost when it stopped.
 */

export type JobRow = typeof jobs.$inferSelect

/** Raised when a job of the same kind is already running for this org. */
export class JobAlreadyRunningError extends Error {
  constructor(readonly kind: string) {
    super(`A ${kind} job is already running for this organization.`)
    this.name = 'JobAlreadyRunningError'
  }
}

/**
 * Start a job, or refuse because one of its kind is already running.
 *
 * The exclusion is a partial unique index on (org_id, kind) where status is
 * 'running' — see schema/core.ts. The insert either succeeds or violates the
 * constraint; there is no window between checking and inserting for a second
 * request to slip through, which a `SELECT` then `INSERT` would leave open.
 */
export async function startExclusiveJob(
  orgId: string,
  kind: string,
  payload: Record<string, unknown> = {},
): Promise<string> {
  return withOrg(orgId, async (tx) => {
    try {
      const [row] = await tx
        .insert(jobs)
        .values({ orgId, kind, payload, status: 'running', attempts: 1, startedAt: new Date() })
        .returning({ id: jobs.id })
      return row!.id
    } catch (error) {
      if (isUniqueViolation(error)) throw new JobAlreadyRunningError(kind)
      throw error
    }
  })
}

/**
 * Record how a job ended.
 *
 * Only acts on a job that is still `running`. Without that predicate this was a
 * last-writer-wins race with `releaseStaleJobs`: a process that hung long
 * enough to be declared abandoned, then returned, would overwrite the `failed`
 * verdict with `succeeded` — or the reverse, if the release landed second. Both
 * directions rewrite history that an operator reads to understand what
 * happened.
 *
 * @returns true if this call is what closed the job.
 */
export async function finishJob(
  orgId: string,
  jobId: string,
  outcome: { status: 'succeeded' | 'failed'; error?: string; payload?: Record<string, unknown> },
): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const closed = await tx
      .update(jobs)
      .set({
        status: outcome.status,
        // Truncated: a provider error can carry a whole HTTP body, and this
        // column is read back into a page.
        lastError: outcome.error ? outcome.error.slice(0, 2_000) : null,
        ...(outcome.payload ? { payload: outcome.payload } : {}),
        finishedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running')))
      .returning({ id: jobs.id })

    return closed.length > 0
  })
}

/**
 * What generation has cost this org, over a window.
 *
 * Every run already records `costUsd` on its job payload — `pipeline.ts` rolls
 * it up per call and `generate/actions.ts` persists it. The only thing that
 * ever read it back was a dev script, so a product that spends real money per
 * post could not answer "how much have I spent this month" from its own
 * interface. At roughly $0.43 a post that is a number an operator is entitled
 * to see without opening a database client.
 *
 * Counted from the jobs table rather than a separate ledger: the job row is
 * already the durable record of a run, and a second source of truth for money
 * is a second thing to reconcile.
 */
export async function spendOverDays(
  orgId: string,
  days: number,
): Promise<{ runs: number; totalUsd: number }> {
  // The cutoff is computed here rather than passed in, so callers do not have
  // to reach for the clock. A server component calling `Date.now()` inline is
  // an impure read during render, which the React compiler rejects — and the
  // window is this function's business anyway.
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  return withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select({
        runs: sql<number>`count(*)::int`,
        // `->>` then cast: the payload is jsonb and the value may be absent on
        // a run that failed before the pipeline reported a cost.
        totalUsd: sql<number>`coalesce(sum((${jobs.payload}->>'costUsd')::numeric), 0)::float8`,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.kind, 'generate'),
          eq(jobs.status, 'succeeded'),
          gte(jobs.createdAt, since),
        ),
      )

    return { runs: row?.runs ?? 0, totalUsd: row?.totalUsd ?? 0 }
  })
}

/** Most recent jobs of a kind. For showing "what happened last time". */
export async function recentJobs(orgId: string, kind: string, limit = 5): Promise<JobRow[]> {
  return withOrg(orgId, async (tx) =>
    tx
      .select()
      .from(jobs)
      .where(eq(jobs.kind, kind))
      .orderBy(desc(jobs.createdAt))
      .limit(limit),
  )
}

/**
 * Release jobs left `running` by a process that died mid-flight.
 *
 * Without this, one crash during generation permanently blocks the exclusion
 * index and the org can never generate again — a self-inflicted denial of
 * service that would look, from the outside, like the product being broken.
 */
export async function releaseStaleJobs(
  orgId: string,
  kind: string,
  olderThanMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)
  return withOrg(orgId, async (tx) => {
    const released = await tx
      .update(jobs)
      .set({
        status: 'failed',
        lastError: 'Abandoned: the process running this job stopped before finishing.',
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(jobs.kind, kind),
          eq(jobs.status, 'running'),
          // `startedAt` is nullable in the schema but always set by
          // startExclusiveJob, so fall back to createdAt rather than letting a
          // null quietly exclude the row this function exists to rescue.
          lt(sql`coalesce(${jobs.startedAt}, ${jobs.createdAt})`, cutoff),
        ),
      )
      .returning({ id: jobs.id })

    return released.length
  })
}

/**
 * Default staleness cutoff for the unattended sweep.
 *
 * Generation is documented as taking about a minute and the slowest observed
 * run was 216 seconds, so fifteen minutes is far past "slow" and safely inside
 * "the process is gone".
 */
export const STALE_JOB_AFTER_MS = 15 * 60 * 1000

/**
 * The same rescue as `releaseStaleJobs`, across every tenant.
 *
 * `releaseStaleJobs` is per-org and was called only from two web actions, which
 * meant recovery required a human to open a page. An org whose worker crashed
 * mid-generation kept failing new work against the one-running-per-kind index
 * until someone happened to visit — so the automatic recovery was, in practice,
 * manual. The worker calls this on its maintenance tick.
 *
 * Runs unscoped because it is a cross-tenant sweep; it touches only the two
 * columns that record abandonment and never reads tenant content.
 */
export async function releaseAllStaleJobs(olderThanMs = STALE_JOB_AFTER_MS): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)

  return withoutTenantScope(async (tx) => {
    const released = await tx
      .update(jobs)
      .set({
        status: 'failed',
        lastError: 'Abandoned: the process running this job stopped before finishing.',
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(jobs.status, 'running'),
          lt(sql`coalesce(${jobs.startedAt}, ${jobs.createdAt})`, cutoff),
        ),
      )
      .returning({ id: jobs.id })

    return released.length
  })
}

/**
 * Delete finished job rows past the retention window.
 *
 * `jobs` is the fastest-growing table in the schema and carries a full `payload`
 * jsonb, and nothing deleted from it — the row for every generation an install
 * has ever run was kept forever.
 */
export async function purgeFinishedJobs(olderThanMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)

  return withoutTenantScope(async (tx) => {
    const removed = await tx
      .delete(jobs)
      .where(and(sql`${jobs.status} in ('succeeded', 'failed')`, lt(jobs.finishedAt, cutoff)))
      .returning({ id: jobs.id })

    return removed.length
  })
}

function isUniqueViolation(error: unknown): boolean {
  // Postgres 23505. postgres.js exposes it as `code`; PGlite nests it the same
  // way, but both also stringify it into the message, so check for either.
  const code = (error as { code?: unknown } | null)?.code
  if (code === '23505') return true
  return error instanceof Error && /duplicate key value|23505/.test(error.message)
}
