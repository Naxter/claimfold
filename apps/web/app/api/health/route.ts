import { sql } from 'drizzle-orm'
import { db } from '@claimfold/db'

/**
 * Liveness + readiness for orchestrators.
 *
 * `restart: unless-stopped` only reacts to a process that exits. A Next server
 * that is up but cannot reach Postgres restarts never and alerts nobody, which
 * is the failure this endpoint exists to make visible.
 *
 * Deliberately anonymous and deliberately mute: it reports reachable or not and
 * nothing else. No version, no driver, no error text — an unauthenticated probe
 * should not be able to fingerprint the install or read a connection string out
 * of a failure message.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await db.execute(sql`select 1`)
  } catch {
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
}
