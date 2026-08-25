import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

import { rlsSetupStatements } from './rls.ts'
import * as schema from './schema/index.ts'

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle')

/**
 * A fresh, fully-migrated, RLS-enabled database held entirely in memory.
 *
 * Because PGlite is real Postgres, policies behave exactly as they will in
 * production — which is the point. A tenant-isolation test that runs against
 * a mock proves nothing.
 */
export async function createTestDatabase() {
  const client = new PGlite()
  const db = drizzle(client, { schema })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  await migrate(db as any, { migrationsFolder })

  for (const statement of rlsSetupStatements()) {
    await db.execute(sql.raw(statement))
  }

  return {
    db,
    async close() {
      await client.close()
    },
  }
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>['db']

/**
 * Point the shared `db` proxy at an in-memory database for the rest of a test.
 *
 * `withOrg` takes an optional database argument, so a test that writes its own
 * queries can pass one in. The repository functions cannot: they call
 * `withOrg(orgId, fn)` with two arguments by design, because a caller that can
 * choose the database is a caller that can choose the wrong one. That makes
 * `approvePost` and friends untestable without this — and the alternative,
 * re-implementing their status transitions inside a test, would assert that
 * the test agrees with itself.
 *
 * Works by filling the same `globalThis` slot `client.ts` caches into, so
 * `createDatabase()` is never reached and no file-backed database is opened.
 * Call it before the first repository call and always restore in `afterAll`;
 * a leaked install would send a later suite at whatever `DATABASE_URL` says,
 * which in development is the real `data/dev` directory.
 */
export function useSharedDatabase(database: TestDatabase): () => void {
  const slot = globalThis as { __claimfoldDb?: unknown }
  const previous = slot.__claimfoldDb
  slot.__claimfoldDb = database

  return () => {
    if (previous === undefined) delete slot.__claimfoldDb
    else slot.__claimfoldDb = previous
  }
}
