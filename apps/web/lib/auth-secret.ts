/** Minimum length, matching what the generator in `.env.example` produces. */
export const MIN_AUTH_SECRET_LENGTH = 32

/**
 * The session signing secret, validated the way `ENCRYPTION_KEY` is.
 *
 * Its own module so it can be tested without importing better-auth, which runs
 * `betterAuth({...})` at module scope and would drag the database adapter in
 * with it. A guard nobody can test is a guard nobody knows is on.
 *
 * Session integrity rests entirely on this value, and it was the one secret
 * passed straight through to the library — `.env.example` ships it blank, so an
 * install that never filled it in got whatever `undefined` does rather than a
 * refusal. A secret nobody set is not a secret.
 */
export function readAuthSecret(
  // Deliberately looser than `NodeJS.ProcessEnv`, which this project types as
  // requiring `NODE_ENV` — a test should be able to pass the two variables
  // this reads and nothing else.
  env: Record<string, string | undefined> = process.env,
): string {
  const secret = env['AUTH_SECRET'] ?? ''
  if (secret.length >= MIN_AUTH_SECRET_LENGTH) return secret

  /*
    `next build` imports every route module to collect page data, and the
    production Dockerfile deliberately keeps `.env` out of the image — so
    throwing here would break `docker compose up`, which is the documented
    install. That is the exact trap `packages/db/src/client.ts` documents for
    DATABASE_URL. No request is served during a build, so nothing is signed
    with the placeholder.
  */
  if (env['NEXT_PHASE'] === 'phase-production-build') {
    return 'build-phase-placeholder-never-used-to-sign-anything'
  }

  throw new Error(
    `AUTH_SECRET is ${secret ? `${secret.length} characters` : 'not set'}; ` +
      `it must be at least ${MIN_AUTH_SECRET_LENGTH}. Generate one with:\n` +
      '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
  )
}
