import { sql, type ExtractTablesWithRelations } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'

import { db, type Database } from './client.ts'
import * as schema from './schema/index.ts'
import { TENANT_TABLES } from './schema/core.ts'

/**
 * The transaction handle passed to every tenant-scoped callback.
 *
 * Derived from drizzle's own `PgTransaction` rather than by unwrapping
 * `Parameters<Database['transaction']>`: that inference collapses to a
 * zero-argument overload, which silently strips the query builders and makes
 * every scoped query fail to typecheck at the call site.
 *
 * The first generic is the driver's query-result shape, which genuinely
 * differs between PGlite and postgres-js. It is the one place `any` is the
 * honest answer — the table types, which are what actually protect queries,
 * stay fully typed.
 */
export type TenantTx = PgTransaction<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>

/**
 * Tenant isolation.
 *
 * Application-layer scoping ("remember to add WHERE org_id = …") fails OPEN:
 * forget it once and a customer sees another customer's data. Row-level
 * security fails CLOSED: forget it and the query returns nothing. For software
 * sold to people whose Instagram accounts must never touch, that difference is
 * the whole ballgame.
 *
 * Two details make this actually work rather than merely look like it works:
 *
 *  1. FORCE ROW LEVEL SECURITY — without FORCE, the table *owner* bypasses
 *     policies, and the owner is exactly who the app connects as.
 *  2. A non-superuser role — superusers bypass RLS even with FORCE. PGlite
 *     connects as a superuser by default, so every scoped query does
 *     `SET LOCAL ROLE` first. Without this, isolation tests would pass
 *     trivially in dev and the protection would only exist in production.
 */

/** The role every scoped query runs as. Deliberately not a superuser. */
export const APP_ROLE = 'claimfold_app'

/** Postgres GUC read by every RLS policy. */
const ORG_SETTING = 'app.current_org'

/**
 * Emitted by the migration runner after tables exist.
 * Idempotent — safe to re-run on every boot.
 */
export function rlsSetupStatements(): string[] {
  const statements: string[] = [
    // A role with no LOGIN: we never connect as it, we SET LOCAL ROLE to it.
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
         CREATE ROLE ${APP_ROLE} NOLOGIN;
       END IF;
     END $$;`,
    `GRANT USAGE ON SCHEMA public TO ${APP_ROLE};`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE};`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE};`,
  ]

  for (const table of TENANT_TABLES) {
    statements.push(
      `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`,
      // Without FORCE the owner silently bypasses every policy below.
      `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`,
      `DROP POLICY IF EXISTS "${table}_tenant_isolation" ON "${table}";`,
      // USING gates reads/updates/deletes; WITH CHECK gates writes, so a row
      // cannot be inserted into or moved to another tenant.
      `CREATE POLICY "${table}_tenant_isolation" ON "${table}"
         USING (org_id = current_setting('${ORG_SETTING}', true))
         WITH CHECK (org_id = current_setting('${ORG_SETTING}', true));`,
    )
  }

  return statements
}

/**
 * Run `fn` inside a transaction scoped to one organization.
 *
 * Everything that touches tenant data goes through here. `SET LOCAL` is
 * transaction-scoped, so the role and org reset automatically on commit or
 * rollback — a leaked setting cannot outlive the request.
 *
 * @example
 *   const rows = await withOrg(orgId, (tx) =>
 *     tx.select().from(posts)          // no WHERE org_id needed — RLS handles it
 *   )
 */
export async function withOrg<T>(
  orgId: string,
  fn: (tx: TenantTx) => Promise<T>,
  database: Database = db,
): Promise<T> {
  if (!orgId) {
    throw new Error('withOrg called without an organization id')
  }

  return database.transaction(async (tx) => {
    // set_config(…, true) is the parameterised form of SET LOCAL — using it
    // instead of string interpolation keeps orgId from being an injection point.
    await tx.execute(sql`SELECT set_config(${ORG_SETTING}, ${orgId}, true)`)
    await tx.execute(sql.raw(`SET LOCAL ROLE ${APP_ROLE}`))
    return fn(tx)
  })
}

/**
 * Escape hatch for genuinely cross-tenant work: migrations, the worker's queue
 * scan, licence checks, admin tooling.
 *
 * Runs as the connecting (owner) role with no org set, so RLS does not apply.
 * Every call site is a place where a bug becomes a data leak — keep them few,
 * keep them obvious, and never reach for this from a request handler.
 */
export async function withoutTenantScope<T>(
  fn: (tx: TenantTx) => Promise<T>,
  database: Database = db,
): Promise<T> {
  return database.transaction(async (tx) => fn(tx as unknown as TenantTx))
}
