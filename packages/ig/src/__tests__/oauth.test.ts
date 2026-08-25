import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { InstagramError } from '../errors.ts'
import { exchangeCode, exchangeForLongLivedToken, fetchProfile } from '../oauth.ts'

/**
 * These tests exist because of one specific defect class.
 *
 * Every field was read with `String(payload[key])`. When Meta returns a shape
 * we did not expect — an error object where a token belongs, a nested value, a
 * null — `String()` produces the text `[object Object]` and the code carries on
 * as if nothing happened. For `access_token` that placeholder gets encrypted,
 * stored, and used, and every publish afterwards fails with an opaque Graph
 * error pointing nowhere near the actual cause.
 *
 * The fix is to refuse. These assert that it refuses.
 */

const CONFIG = {
  appId: '1234567890',
  appSecret: 'a'.repeat(32),
  redirectUri: 'https://example.org/api/instagram/callback',
}

function respondWith(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok,
        status,
        json: () => Promise.resolve(body),
      } as Response),
    ),
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('exchangeCode', () => {
  it('returns the token when the response is well formed', async () => {
    respondWith({ access_token: 'IGQVJ...short', user_id: 17841400000000000 })

    const result = await exchangeCode(CONFIG, 'code-123')

    expect(result.accessToken).toBe('IGQVJ...short')
    // Meta returns user_id as a number here and a string elsewhere; both work.
    expect(result.userId).toBe('17841400000000000')
  })

  it('strips the #_ Meta appends to the code in the browser redirect', async () => {
    const fetchMock = vi.fn((_url: string | URL, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 't', user_id: '1' }),
      } as Response),
    )
    vi.stubGlobal('fetch', fetchMock)

    await exchangeCode(CONFIG, 'code-123#_')

    const body = fetchMock.mock.calls[0]?.[1]?.body
    expect(body).toBeInstanceOf(URLSearchParams)
    expect((body as URLSearchParams).get('code')).toBe('code-123')
  })

  it('refuses an object where the access token belongs', async () => {
    // Previously produced accessToken: "[object Object]", which was then
    // encrypted and stored as if it were a real credential.
    respondWith({ access_token: { value: 'nested' }, user_id: '1' })

    await expect(exchangeCode(CONFIG, 'code')).rejects.toThrow(InstagramError)
    await expect(exchangeCode(CONFIG, 'code')).rejects.toThrow(/access_token/)
  })

  it('refuses a missing user id rather than storing the string "undefined"', async () => {
    respondWith({ access_token: 'valid-token' })

    await expect(exchangeCode(CONFIG, 'code')).rejects.toThrow(/user_id/)
  })

  it('reads permissions whether they arrive as an array or a comma string', async () => {
    respondWith({
      access_token: 't',
      user_id: '1',
      permissions: 'instagram_business_basic,instagram_business_content_publish',
    })
    expect((await exchangeCode(CONFIG, 'c')).permissions).toEqual([
      'instagram_business_basic',
      'instagram_business_content_publish',
    ])

    respondWith({ access_token: 't', user_id: '1', permissions: ['a', 'b'] })
    expect((await exchangeCode(CONFIG, 'c')).permissions).toEqual(['a', 'b'])
  })

  it('surfaces Meta’s own error message on a failed exchange', async () => {
    respondWith({ error_message: 'Invalid platform app' }, false, 400)

    await expect(exchangeCode(CONFIG, 'code')).rejects.toThrow('Invalid platform app')
  })

  it('falls back to a readable message when the error body is unusable', async () => {
    // An error object rather than a string used to become "[object Object]"
    // as the entire user-facing message.
    respondWith({ error: { type: 'OAuthException', code: 191 } }, false, 400)

    await expect(exchangeCode(CONFIG, 'code')).rejects.toThrow('Code exchange failed')
    // And specifically not the stringified object it used to produce.
    await expect(exchangeCode(CONFIG, 'code')).rejects.not.toThrow('[object Object]')
  })
})

describe('exchangeForLongLivedToken', () => {
  it('computes an absolute expiry from the relative one', async () => {
    respondWith({ access_token: 'long-lived', expires_in: 60 * 60 * 24 * 60 })

    const before = Date.now()
    const result = await exchangeForLongLivedToken(CONFIG, 'short-token')

    const days = (result.expiresAt.getTime() - before) / 86_400_000
    expect(days).toBeGreaterThan(59.9)
    expect(days).toBeLessThan(60.1)
  })

  it('refuses a response with no token at all', async () => {
    // Already guarded before this change — asserted so it stays guarded.
    respondWith({ expires_in: 5_184_000 })

    await expect(exchangeForLongLivedToken(CONFIG, 'short')).rejects.toThrow(
      'Long-lived token exchange failed',
    )
  })

  it('refuses a token that is present but not a string', async () => {
    // The gap the missing-token guard did not close: an object is truthy, so
    // it sailed past `!payload['access_token']` and became "[object Object]".
    respondWith({ access_token: { data: 'x' }, expires_in: 5_184_000 })

    await expect(exchangeForLongLivedToken(CONFIG, 'short')).rejects.toThrow(/access_token/)
  })
})

describe('fetchProfile', () => {
  it('reads the account, defaulting only the genuinely optional fields', async () => {
    respondWith({ id: '17841400000000000', username: 'wissen.de' })

    const profile = await fetchProfile('token')
    expect(profile.id).toBe('17841400000000000')
    expect(profile.username).toBe('wissen.de')
    expect(profile.accountType).toBeUndefined()
  })

  it('refuses a profile with no id', async () => {
    respondWith({ username: 'wissen.de' })

    await expect(fetchProfile('token')).rejects.toThrow(/"id"/)
  })
})
