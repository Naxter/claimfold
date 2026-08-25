import { getTableColumns, getTableName, is, sql } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../schema/index.ts'
import { TENANT_TABLES } from '../schema/core.ts'
import { createTestDatabase, type TestDatabase } from '../testing.ts'

/**
 * The guard that makes migrate.ts honest.
 *
 * `rlsSetupStatements()` iterates a hardcoded list. A new table with an
 * `org_id` that nobody remembers to add to that list gets no policy — and the
 * app role holds SELECT/INSERT/UPDATE/DELETE on ALL tables in the schema, so
 * it would be fully readable across tenants from inside any `withOrg` call.
 *
 * The existing isolation suite cannot catch this: it tests specific tables by
 * name. This one reflects over the schema, so it fails the moment someone adds
 * a tenant table and forgets — which is precisely the failure mode the ADR
 * claims to guard against.
 */

let harness: Awaited<ReturnType<typeof createTestDatabase>>
let db: TestDatabase

beforeAll(async () => {
  harness = await createTestDatabase()
  db = harness.db
})

afterAll(async () => {
  await harness.close()
})

/** Every exported drizzle table that carries an `org_id` column. */
function tenantScopedTableNames(): string[] {
  const names: string[] = []

  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue
    const columns = getTableColumns(value)
    if ('orgId' in columns) names.push(getTableName(value))
  }

  return names.sort()
}

describe('row-level security coverage', () => {
  it('lists every org-scoped table in TENANT_TABLES', () => {
    const discovered = tenantScopedTableNames()
    const declared = [...TENANT_TABLES].sort()

    const missing = discovered.filter((t) => !declared.includes(t as never))
    expect(
      missing,
      `These tables have an org_id but are not in TENANT_TABLES, so they get NO ` +
        `row-level security policy and are readable across tenants: ${missing.join(', ')}`,
    ).toEqual([])

    // And nothing declared that no longer exists, which would silently pass.
    const stale = declared.filter((t) => !discovered.includes(t))
    expect(stale, `TENANT_TABLES names tables that do not exist: ${stale.join(', ')}`).toEqual(
      [],
    )
  })

  it('has a live policy in pg_policies for every org-scoped table', async () => {
    const result = await db.execute<{ tablename: string; policyname: string }>(
      sql`select tablename, policyname from pg_policies where schemaname = 'public'`,
    )

    const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows) ?? []
    const withPolicy = new Set(
      (rows as Array<{ tablename: string }>).map((r) => r.tablename),
    )

    for (const table of tenantScopedTableNames()) {
      expect(withPolicy.has(table), `${table} has no row-level security policy`).toBe(true)
    }
  })

  it('forces RLS so the table owner cannot bypass it', async () => {
    // Without FORCE, the owner — which is who the app connects as — bypasses
    // every policy, and the whole scheme is decorative.
    const result = await db.execute<{ relname: string; relforcerowsecurity: boolean }>(
      sql`select c.relname, c.relrowsecurity, c.relforcerowsecurity
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r'`,
    )

    const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows) ?? []
    const byName = new Map(
      (rows as Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>).map(
        (r) => [r.relname, r],
      ),
    )

    for (const table of tenantScopedTableNames()) {
      const row = byName.get(table)
      expect(row?.relrowsecurity, `${table} does not have RLS enabled`).toBe(true)
      expect(row?.relforcerowsecurity, `${table} does not FORCE RLS`).toBe(true)
    }
  })

  it('covers ig_accounts, which holds the encrypted Instagram tokens', () => {
    // Called out explicitly because the isolation suite never touched it, and
    // it is the single most damaging table to leak.
    expect(tenantScopedTableNames()).toContain('ig_accounts')
  })
})
