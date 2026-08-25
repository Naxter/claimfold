import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'

import { sql } from 'drizzle-orm'

import { db, isEmbedded } from './client.ts'
import { rlsSetupStatements } from './rls.ts'

/**
 * Applies schema migrations, then (re)asserts row-level security.
 *
 * RLS is applied here rather than inside a generated migration because
 * drizzle-kit generates DDL from the schema and knows nothing about policies.
 * The statements are idempotent, so re-running this keeps a new table from
 * silently shipping without a policy — the failure mode being guarded against
 * is "someone adds a table and forgets", which is exactly the kind of thing
 * that only surfaces when a customer sees another customer's data.
 *
 * **Who runs it.** In development, `npm run db:migrate` by hand. In production,
 * the one-shot `migrate` service in docker-compose.yml, which web and worker
 * both wait on via `service_completed_successfully`.
 *
 * This docstring used to say "on every boot", and nothing ran it on any boot:
 * neither Dockerfile invoked it and compose had no migration step, so the
 * documented `docker compose up -d` produced a running stack against an empty
 * database — and, because RLS lives here, a schema created any other way would
 * have had no tenant isolation at all. The claim was the reason nobody noticed.
 */

const here = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(here, '..', 'drizzle')

async function main() {
  if (!existsSync(migrationsFolder)) {
    console.error(
      `No migrations found at ${migrationsFolder}.\nRun \`npm run db:generate\` first.`,
    )
    process.exit(1)
  }

  console.log(`Applying migrations (${isEmbedded() ? 'embedded PGlite' : 'Postgres'})…`)

  if (isEmbedded()) {
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    // The two migrators want their own driver-specific database type, and this
    // function deliberately handles both. Narrowing here would mean importing
    // both migrator types just to satisfy a cast that is discarded at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    await migrate(db as any, { migrationsFolder })
  } else {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    await migrate(db as any, { migrationsFolder })
  }

  console.log('Asserting row-level security…')
  for (const statement of rlsSetupStatements()) {
    await db.execute(sql.raw(statement))
  }

  console.log('Done.')
  process.exit(0)
}

main().catch((error: unknown) => {
  // PGlite reports an unrecoverable data directory as a WASM abort, which
  // arrives as fifty lines of `wasm-function[10860]` and no advice. It happens
  // when the previous process was killed rather than stopped — on a developer
  // machine, routine. Name the cause and the fix.
  if (isPgliteAbort(error)) {
    console.error(
      '\nThe embedded development database could not be opened.\n\n' +
        'PGlite is Postgres compiled to WebAssembly and does not recover from being\n' +
        'killed mid-write — a hard-stopped dev server or a reboot can leave the data\n' +
        'directory unreadable. Development data is disposable, so rebuild it:\n\n' +
        '    npm run db:reset\n\n' +
        'That moves the old directory aside rather than deleting it.\n',
    )
    process.exit(1)
  }

  console.error('Migration failed:', error)
  process.exit(1)
})

function isPgliteAbort(error: unknown): boolean {
  if (!isEmbedded()) return false
  // The abort surfaces as the `cause` of a Drizzle query error, so walk the
  // chain rather than reading only the top-level message.
  let current: unknown = error
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    if (/Aborted\(\)|_pg_initdb/.test(`${current.message}\n${current.stack ?? ''}`)) return true
    current = current.cause
  }
  return false
}
