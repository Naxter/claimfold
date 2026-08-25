import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema/index.ts'

/**
 * Load the repo-root .env here, at the one place every entry point already
 * imports. Doing it per-script means one of them eventually forgets, and the
 * symptom is a confusing "DATABASE_URL is not set" from a command that worked
 * yesterday. Real environment variables always win, so Docker (which injects
 * them directly and ships no .env) is unaffected.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const envFile = resolve(repoRoot, '.env')
if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

/**
 * Two drivers, one API.
 *
 *   postgres://…       real Postgres (Docker, VPS) — production
 *   pglite://./data/dev embedded Postgres compiled to WASM — local dev
 *
 * PGlite is genuine Postgres, not a shim, so row-level security, enums and
 * jsonb behave identically. That is what lets `npm run dev` work on a laptop
 * with nothing installed while production runs the same migrations.
 */

export type Database = ReturnType<typeof createDatabase>

function databaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  }
  return url
}

/** True when running on the embedded WASM Postgres rather than a real server. */
export function isEmbedded(): boolean {
  return (process.env.DATABASE_URL ?? '').startsWith('pglite://')
}

function createDatabase() {
  const url = databaseUrl()

  if (isEmbedded()) {
    // `pglite://./data/dev` → <repo root>/data/dev
    //
    // Resolved against the repo root, not process.cwd(): the same URL is read
    // by the root scripts, the db workspace and the worker, and a relative path
    // must mean the same database in all three or dev silently splits into
    // several half-migrated copies.
    const dir = resolve(repoRoot, url.slice('pglite://'.length))
    mkdirSync(dir, { recursive: true })
    const client = new PGlite(dir)
    return drizzlePglite(client, { schema })
  }

  const client = postgres(url, {
    // The worker and web each hold a small pool; a 4 GB box does not want 20
    // idle backends. Raise on bigger hardware.
    max: Number(process.env.DB_POOL_MAX ?? 8),
    // RLS depends on `SET LOCAL`, which requires a transaction and a stable
    // connection for its duration. Prepared statements are fine; pooling in
    // transaction mode is not — do not put PgBouncer in front without care.
    prepare: true,
  })
  return drizzlePostgres(client, { schema })
}

/**
 * Connect on first use, not on import.
 *
 * This used to be `export const db = createDatabase()`, which opened a database
 * — or threw — the moment anything imported this module. That made the module
 * un-importable without a live configuration, and it broke the one place that
 * matters most: `next build`.
 *
 * The production Dockerfile builds the app, `.dockerignore` correctly keeps
 * `.env` out of the image, and Next imports every route module to collect page
 * data. So `docker compose up` — the documented install, and the product's
 * whole distribution format — failed at build time with "DATABASE_URL is not
 * set". It worked in development only because a `.env` happened to be present.
 *
 * A Proxy rather than a `getDb()` function so the several hundred existing call
 * sites are untouched. Methods are bound to the real instance, because Drizzle's
 * query builders rely on `this`.
 */
/**
 * Cached on `globalThis`, deliberately, and not in a module variable.
 *
 * A module-scoped `let instance` is correct in production and quietly
 * destructive in development. Next's dev server hot-reloads server modules on
 * every file change, and each re-evaluation of this file creates a NEW module
 * scope with `instance` back to `undefined`. The next query then calls
 * `new PGlite(dir)` again — a second embedded Postgres opening the same
 * `data/dev` directory while the first one is still holding it.
 *
 * PGlite is single-connection embedded Postgres. Two live instances over one
 * directory corrupt it, and the corruption is delayed: the database keeps
 * answering for a while and then every query fails with
 * `RuntimeError: Aborted()` from the WebAssembly runtime, long after the edit
 * that caused it. That is the failure this repo has been repeatedly resetting
 * `data/dev` to recover from, and why it looked like force-killing the server
 * was to blame — a kill is one way to get there, but an afternoon of editing
 * is another.
 *
 * `globalThis` survives module re-evaluation, so hot reload reuses the one
 * instance. Harmless in production, where the module is evaluated once.
 *
 * Measured rather than reasoned about: instrumenting both the module body and
 * `createDatabase` showed six module re-evaluations in five minutes of ordinary
 * editing, every one of them finding the cache already populated, against a
 * single construction at boot. Under the old module-scoped variable those six
 * would each have opened another PGlite over `data/dev`.
 */
const globalCache = globalThis as { __claimfoldDb?: Database }

export const db: Database = new Proxy({} as Database, {
  get(_target, property): unknown {
    const real = (globalCache.__claimfoldDb ??= createDatabase())
    const value: unknown = Reflect.get(real, property, real)
    if (typeof value !== 'function') return value

    // Bound because Drizzle's query builders rely on `this`. Cast to a concrete
    // signature so `bind` returns a function rather than `any` — a proxy get
    // trap is untyped by construction, and `Database` on the export is what
    // every call site actually sees.
    type Method = (this: unknown, ...args: unknown[]) => unknown
    return (value as Method).bind(real)
  },
  has(_target, property) {
    const real = (globalCache.__claimfoldDb ??= createDatabase())
    return Reflect.has(real, property)
  },
})

export { schema }
