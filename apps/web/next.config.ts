import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { NextConfig } from 'next'

// Environment variables come from the repo-root `.env`, loaded by
// `@claimfold/db` at import (see packages/db/src/client.ts). Next only reads
// `.env` from the app directory, which this workspace does not use.

/** Repo root. File tracing has to start here or workspace packages are missed. */
const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const config: NextConfig = {
  // Emits `.next/standalone` carrying only the modules actually reached at
  // runtime. Without it the runtime image was the whole build stage — source
  // tree, typescript, eslint, vitest, drizzle-kit and the Playwright test
  // runner, none of which serve a request.
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,

  // Workspace packages ship TypeScript source rather than build output, so
  // Next has to compile them. Keeps `npm run dev` free of a build step.
  transpilePackages: [
    '@claimfold/db',
    '@claimfold/niches',
    '@claimfold/templates',
    '@claimfold/render',
    '@claimfold/content',
    '@claimfold/crypto',
    '@claimfold/storage',
    // Used by both Instagram OAuth routes. Was missing here and from
    // package.json — the same undeclared-dependency shape as @claimfold/storage,
    // which worked only because npm workspaces hoist every package into the root
    // node_modules.
    '@claimfold/ig',
  ],

  serverExternalPackages: [
    // Native or WASM binaries that must not be bundled.
    '@electric-sql/pglite',
    'postgres',
    'playwright',
    'sharp',
  ],

  eslint: { ignoreDuringBuilds: true },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // The dashboard renders model-generated text. None of it is ever
          // inserted as HTML, but these make a mistake non-exploitable rather
          // than merely unlikely.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default config
