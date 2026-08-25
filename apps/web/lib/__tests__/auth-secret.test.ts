import { describe, expect, it } from 'vitest'

import { MIN_AUTH_SECRET_LENGTH, readAuthSecret } from '../auth-secret.ts'

/**
 * The guard on the session signing secret.
 *
 * Worth testing rather than eyeballing, because both of its branches are ones
 * nobody sees in normal use: the throw only fires on an install that skipped a
 * step, and the build-phase escape only fires inside `next build`. A guard that
 * is never exercised is a guard that quietly stops working — and the failure it
 * prevents is "sessions signed with nothing", which produces no error at all.
 */

const VALID = 'a'.repeat(MIN_AUTH_SECRET_LENGTH)

describe('readAuthSecret', () => {
  it('returns a secret that is long enough', () => {
    expect(readAuthSecret({ AUTH_SECRET: VALID })).toBe(VALID)
  })

  it('refuses a missing secret and says how to make one', () => {
    expect(() => readAuthSecret({})).toThrow(/AUTH_SECRET is not set/)
    expect(() => readAuthSecret({})).toThrow(/randomBytes/)
  })

  it('refuses a short secret and states the length it got', () => {
    // The realistic mistake is a word, not an empty string.
    expect(() => readAuthSecret({ AUTH_SECRET: 'hunter2' })).toThrow(/7 characters/)
  })

  it('refuses one character below the floor', () => {
    expect(() => readAuthSecret({ AUTH_SECRET: 'a'.repeat(MIN_AUTH_SECRET_LENGTH - 1) })).toThrow()
  })

  it('lets a production build through without a secret', () => {
    // `next build` imports every route module with no .env in the image. This
    // branch is why `docker compose up` does not die at build time — the same
    // trap packages/db/src/client.ts documents for DATABASE_URL.
    expect(readAuthSecret({ NEXT_PHASE: 'phase-production-build' })).toMatch(/never-used-to-sign/)
  })

  it('still prefers a real secret during a build', () => {
    expect(
      readAuthSecret({ NEXT_PHASE: 'phase-production-build', AUTH_SECRET: VALID }),
    ).toBe(VALID)
  })
})
