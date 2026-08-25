import { defineConfig } from 'drizzle-kit'

// Paths are relative to the repo root, since the npm scripts run from there.
const url = process.env.DATABASE_URL ?? 'pglite://./data/dev'
const isEmbedded = url.startsWith('pglite://')

export default defineConfig({
  schema: './packages/db/src/schema/index.ts',
  out: './packages/db/drizzle',
  dialect: 'postgresql',
  ...(isEmbedded
    ? { driver: 'pglite' as const, dbCredentials: { url: url.slice('pglite://'.length) } }
    : { dbCredentials: { url } }),
  strict: true,
  verbose: true,
})
