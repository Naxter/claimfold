import { existsSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { releaseAllStaleJobs } from '@claimfold/db'
import { closeBrowser } from '@claimfold/render'

import { collectInsights } from './insights-job.ts'
import { log } from './log.ts'
import { findDuePosts, publishPost } from './publish-job.ts'
import { runRetention } from './retention-job.ts'
import { refreshExpiringTokens } from './token-refresh.ts'

/**
 * The worker.
 *
 * Exists because Instagram's Content Publishing API has no scheduling: "post
 * at 18:00" is entirely the application's problem. It is also why production
 * cannot be a laptop — something has to be awake at 18:00.
 *
 * Deliberately a plain interval loop rather than a job framework. The workload
 * is a handful of posts per day across a handful of tenants; a queue broker
 * would be more infrastructure for a buyer to run and more to go wrong, for no
 * benefit at this scale.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
if (existsSync(resolve(repoRoot, '.env'))) process.loadEnvFile(resolve(repoRoot, '.env'))

const TICK_SECONDS = Number(process.env.WORKER_TICK_SECONDS ?? 30)
const TOKEN_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
/**
 * Four times a day.
 *
 * Instagram's own numbers update on roughly that cadence for a young post, and
 * one row per post per day is all the `metrics` table stores — so polling more
 * often would spend rate limit to overwrite the same row.
 */
const INSIGHTS_INTERVAL_MS = 6 * 60 * 60 * 1000
/** Housekeeping: retention sweep and stale-job release. */
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000

/**
 * Touched at the end of every tick so a container healthcheck can tell a wedged
 * loop from a running one. `restart: unless-stopped` only reacts to a process
 * that exits — a worker whose tick is hung stays "up" forever and alerts
 * nobody, which is exactly the state this file's loop can reach.
 */
const HEARTBEAT_PATH = process.env.WORKER_HEARTBEAT_PATH ?? '/tmp/claimfold-worker-heartbeat'

let running = true
let lastTokenCheck = 0
let lastInsightsCheck = 0
let lastMaintenance = 0

/**
 * The publish currently in flight, if any.
 *
 * SIGTERM arrives on every `docker compose up -d`. Exiting between the Graph
 * API call and the database write is the window that produces a duplicate
 * carousel on the next tick, so shutdown waits for this rather than calling
 * `process.exit` through it.
 */
let inFlight: Promise<unknown> | null = null



function beat(): void {
  try {
    writeFileSync(HEARTBEAT_PATH, String(Date.now()))
  } catch {
    // A healthcheck that cannot be written is not worth taking the loop down
    // for. The check will fail on staleness, which is the correct signal.
  }
}

async function tick(): Promise<void> {
  // ── Publish anything due ────────────────────────────────────────────────
  const due = await findDuePosts()
  if (due.length > 0) log.info({ event: 'publish.due', count: due.length })

  for (const { id, orgId } of due) {
    // Stop starting new publishes once shutdown has begun. The one already
    // running is awaited below; beginning another would widen the window.
    if (!running) break

    try {
      inFlight = publishPost(orgId, id)
      const outcome = (await inFlight) as Awaited<ReturnType<typeof publishPost>>
      log.info({ event: 'publish.outcome', postId: id, status: outcome.status, detail: outcome.detail })
    } catch (error) {
      // A crash here must not take the loop down — the next tick should still
      // pick up the remaining posts.
      log.error({ event: 'publish.crashed', postId: id, reason: (error as Error).message })
    } finally {
      inFlight = null
    }
  }

  /*
    ── Insights, a few times a day ─────────────────────────────────────────

    After publishing, never before it. Insights are the free extra the README
    promises; publishing is what people are actually waiting for, and the two
    share a rate limit.
  */
  if (Date.now() - lastInsightsCheck > INSIGHTS_INTERVAL_MS) {
    lastInsightsCheck = Date.now()
    try {
      const outcomes = await collectInsights()
      const captured = outcomes.filter((o) => o.status === 'captured').length
      if (outcomes.length > 0)
        log.info({ event: 'insights.swept', captured, total: outcomes.length })
      for (const outcome of outcomes.filter((o) => o.status !== 'captured')) {
        log.warn({
          event: 'insights.skipped',
          postId: outcome.postId,
          status: outcome.status,
          detail: outcome.detail,
        })
      }
    } catch (error) {
      log.error({ event: 'insights.failed', reason: (error as Error).message })
    }
  }

  // ── Token maintenance, a few times a day ────────────────────────────────
  if (Date.now() - lastTokenCheck > TOKEN_CHECK_INTERVAL_MS) {
    lastTokenCheck = Date.now()
    try {
      const outcomes = await refreshExpiringTokens()
      for (const outcome of outcomes) {
        log.info({
          event: 'token.refresh',
          username: outcome.username,
          status: outcome.status,
          detail: outcome.detail,
        })
      }
    } catch (error) {
      log.error({ event: 'token.failed', reason: (error as Error).message })
    }
  }

  /*
    ── Housekeeping ────────────────────────────────────────────────────────

    Two jobs that had no home and therefore never ran unattended.

    `releaseStaleJobs` was called only from two web actions, so an org whose
    worker crashed mid-generation kept failing new work against the
    one-running-per-kind index until a human happened to open the page. Recovery
    should not depend on someone visiting a URL.

    `runRetention` is the delete path nothing had: every copy edit orphans a
    render asset and its JPEG, and finished job rows accumulate forever.
  */
  if (Date.now() - lastMaintenance > MAINTENANCE_INTERVAL_MS) {
    lastMaintenance = Date.now()
    try {
      const released = await releaseAllStaleJobs()
      if (released > 0) log.warn({ event: 'jobs.released', count: released })
    } catch (error) {
      log.error({ event: 'jobs.releaseFailed', reason: (error as Error).message })
    }

    try {
      const swept = await runRetention()
      if (swept.assets > 0 || swept.jobs > 0 || swept.cacheFiles > 0) {
        log.info({
          event: 'retention.swept',
          assets: swept.assets,
          jobs: swept.jobs,
          cacheFiles: swept.cacheFiles,
        })
      }
    } catch (error) {
      log.error({ event: 'retention.failed', reason: (error as Error).message })
    }
  }

  beat()
}

async function main(): Promise<void> {
  log.info({ event: 'worker.started', tickSeconds: TICK_SECONDS })

  // Check tokens on boot: an install that was down for a fortnight should not
  // wait six hours to discover its token is about to die.
  lastTokenCheck = 0

  while (running) {
    const started = Date.now()
    try {
      await tick()
    } catch (error) {
      log.error({ event: 'tick.failed', reason: (error as Error).message })
    }

    const elapsed = Date.now() - started
    const wait = Math.max(0, TICK_SECONDS * 1000 - elapsed)
    await new Promise((r) => setTimeout(r, wait))
  }
}

/**
 * How long shutdown waits for a publish already in progress.
 *
 * Must stay below the orchestrator's kill timeout — `stop_grace_period` in
 * docker-compose.yml — or the wait is pointless because SIGKILL lands first.
 */
const SHUTDOWN_GRACE_MS = 90_000

let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  // Compose sends SIGTERM once, but an impatient operator sends it twice.
  // Re-entering here would exit through the wait we are about to do.
  if (shuttingDown) return
  shuttingDown = true

  log.info({ event: 'worker.shutdown', signal })
  running = false

  /*
    Wait for a publish in flight.

    This process can be between `media_publish` returning 200 and the row that
    records `igMediaId` being committed. Exiting there loses the only evidence
    that Instagram already has the carousel, and the recovery path then
    republishes it. A duplicate on someone's real account is not something an
    apology fixes, so a slower shutdown is the cheaper trade.
  */
  const pending = inFlight
  if (pending) {
    log.info({ event: 'worker.awaitingPublish' })
    const settled = pending.then(
      () => true,
      () => true,
    )
    const timedOut = new Promise<boolean>((r) => setTimeout(() => r(false), SHUTDOWN_GRACE_MS))
    if (!(await Promise.race([settled, timedOut]))) {
      log.warn({ event: 'worker.graceExpired', graceMs: SHUTDOWN_GRACE_MS })
    }
  }

  // Chromium does not exit with the parent; an orphan holds ~150MB until the
  // box is rebooted.
  await closeBrowser()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

main().catch(async (error: unknown) => {
  log.error({ event: 'worker.crashed', reason: (error as Error).message })
  await closeBrowser()
  process.exit(1)
})
