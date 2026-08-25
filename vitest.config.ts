import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `apps/web` has no src/ — its code lives in app/ and lib/. An earlier glob
    // required a `src` segment, so any test written for the web app would have
    // been silently skipped rather than failing loudly.
    //
    // `.tsx` is here for exactly the same reason, and it was the same bug: the
    // glob ended at `.test.ts`, so the 18 client components had no coverage AND
    // a `.test.tsx` written for one of them would have been collected by
    // nothing and reported as passing. A runner that silently ignores a file is
    // worse than one with no tests, because the first looks green.
    //
    // Line comments, not a block: a glob containing `**/` closes a block
    // comment early, which is a parse error in this file rather than anything
    // subtle — but it is why this reads the way it does.
    include: ['{packages,apps}/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    // PGlite boots a WASM Postgres per suite; the default 5s is not enough
    // on a cold run, and a flaky timeout here would train us to ignore it.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
