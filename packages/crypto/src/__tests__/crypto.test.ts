import { randomBytes } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import {
  __resetKeyCacheForTests,
  decryptSecret,
  encryptSecret,
  redact,
  safeEqual,
} from '../index.ts'

const ORG_A = 'org_alpha'
const ORG_B = 'org_beta'
const TOKEN = 'IGQVJXc1RleUZAtd3RhbXBsZAXRva2VuZAmFrZAQ'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64')
  __resetKeyCacheForTests()
})

describe('envelope encryption', () => {
  it('round-trips a secret', () => {
    const sealed = encryptSecret(TOKEN, 'ig_access_token', ORG_A)
    expect(sealed).not.toContain(TOKEN)
    expect(decryptSecret(sealed, 'ig_access_token', ORG_A)).toBe(TOKEN)
  })

  it('produces a different ciphertext every time', () => {
    // Equal ciphertexts would leak that two tenants stored the same secret,
    // and in GCM would mean a reused IV.
    const a = encryptSecret(TOKEN, 'ig_access_token', ORG_A)
    const b = encryptSecret(TOKEN, 'ig_access_token', ORG_A)
    expect(a).not.toBe(b)
    expect(decryptSecret(b, 'ig_access_token', ORG_A)).toBe(TOKEN)
  })

  it('refuses to decrypt another organization’s ciphertext', () => {
    // The property that matters: if a bug copies a token row between tenants,
    // the result is a hard failure, not a working token for the wrong account.
    const sealed = encryptSecret(TOKEN, 'ig_access_token', ORG_A)
    expect(() => decryptSecret(sealed, 'ig_access_token', ORG_B)).toThrow(/invalid, tampered/i)
  })

  it('refuses to decrypt under a different purpose', () => {
    const sealed = encryptSecret(TOKEN, 'ig_access_token', ORG_A)
    expect(() => decryptSecret(sealed, 'meta_app_secret', ORG_A)).toThrow(/invalid, tampered/i)
  })

  it('detects tampering with the ciphertext', () => {
    const sealed = encryptSecret(TOKEN, 'ig_access_token', ORG_A)
    const parts = sealed.split('.')
    const data = Buffer.from(parts[3]!, 'base64url')
    data[0] = data[0]! ^ 0xff
    parts[3] = data.toString('base64url')

    expect(() => decryptSecret(parts.join('.'), 'ig_access_token', ORG_A)).toThrow()
  })

  it('detects tampering with the auth tag', () => {
    const sealed = encryptSecret(TOKEN, 'ig_access_token', ORG_A)
    const parts = sealed.split('.')
    const tag = Buffer.from(parts[2]!, 'base64url')
    tag[0] = tag[0]! ^ 0xff
    parts[2] = tag.toString('base64url')

    expect(() => decryptSecret(parts.join('.'), 'ig_access_token', ORG_A)).toThrow()
  })

  it('rejects malformed payloads', () => {
    expect(() => decryptSecret('nonsense', 'ig_access_token', ORG_A)).toThrow(/Malformed/)
    expect(() => decryptSecret('v9.a.b.c', 'ig_access_token', ORG_A)).toThrow(/version/)
  })

  it('requires an organization id', () => {
    expect(() => encryptSecret(TOKEN, 'ig_access_token', '')).toThrow(/organization id/)
  })
})

describe('safeEqual', () => {
  it('compares equal strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
  })

  it('rejects different strings and lengths without throwing', () => {
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('redact', () => {
  it('masks Instagram and Anthropic tokens in free text', () => {
    const text = `failed with token ${TOKEN} and key sk-ant-api03-abcdefghijklmnopqrstuvwxyz`
    const out = redact(text)
    expect(out).not.toContain(TOKEN)
    expect(out).not.toContain('sk-ant-api03')
    expect(out).toContain('[redacted]')
  })

  it('masks by key name, even when the value looks innocuous', () => {
    const out = redact({ accessToken: 'short', nested: { apiKey: 'x' }, safe: 'keep me' })
    expect(out).toEqual({
      accessToken: '[redacted]',
      nested: { apiKey: '[redacted]' },
      safe: 'keep me',
    })
  })

  it('walks arrays', () => {
    const out = redact([{ token: 'abc' }, 'plain'])
    expect(out).toEqual([{ token: '[redacted]' }, 'plain'])
  })

  it('leaves non-secret values alone', () => {
    expect(redact(42)).toBe(42)
    expect(redact(null)).toBe(null)
  })

  /**
   * Regression tests for the four ways the first implementation failed. Each
   * one was found by running it, not by reading it.
   */

  it('preserves Error message and stack instead of returning {}', () => {
    // `Object.entries(new Error(...))` is [] — message and stack are
    // non-enumerable — so the naive object branch discarded every error.
    const error = new Error(`request failed with token ${TOKEN}`)
    const out = redact(error) as Record<string, unknown>

    expect(out['name']).toBe('Error')
    expect(String(out['message'])).toContain('[redacted]')
    expect(String(out['message'])).not.toContain(TOKEN)
    expect(out['stack']).toBeTruthy()
  })

  it('keeps custom error properties and redacts sensitive ones', () => {
    const error = Object.assign(new TypeError('nope'), {
      status: 401,
      accessToken: 'abc123',
    })
    const out = redact(error) as Record<string, unknown>

    expect(out['status']).toBe(401)
    expect(out['accessToken']).toBe('[redacted]')
  })

  it('survives circular references', () => {
    // fetch/undici errors carry circular request/response links; recursing
    // them threw a RangeError from inside a catch block.
    const a: Record<string, unknown> = { name: 'a' }
    const b: Record<string, unknown> = { name: 'b', a }
    a['b'] = b

    const out = redact(a) as Record<string, unknown>
    expect(() => JSON.stringify(out)).not.toThrow()
    expect(JSON.stringify(out)).toContain('[circular]')
  })

  it('redacts every credential shape this product actually holds', () => {
    const cases: Array<[string, string]> = [
      ['OpenAI key', 'sk-proj-abcdefghijklmnopqrstuvwxyz012345'],
      ['bearer token', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz'],
      ['access_token param', 'https://graph.instagram.com/me?access_token=ABCDEFGHIJKLMNOP'],
      ['client_secret param', 'POST body client_secret=0123456789abcdef0123'],
      ['database url', 'postgres://claimfold:hunter2@db:5432/claimfold'],
      ['encryption key', 'ENCRYPTION_KEY=aGVsbG93b3JsZGhlbGxvd29ybGQxMjM0NTY3OA=='],
    ]

    for (const [label, input] of cases) {
      expect(redact(input), `${label} was not redacted`).toContain('[redacted]')
    }
  })

  it('does not mangle harmless text that merely looks technical', () => {
    const safe = 'Rendered 8 slides in 2601ms at 1080x1350'
    expect(redact(safe)).toBe(safe)
  })

  it('handles Dates, Buffers, Maps and Sets without turning them into {}', () => {
    const date = new Date('2026-07-25T12:00:00.000Z')
    expect(redact(date)).toBe('2026-07-25T12:00:00.000Z')
    expect(String(redact(Buffer.from('hi')))).toMatch(/buffer 2 bytes/)
    expect(redact(new Map([['token', 'abc']]))).toEqual({ token: '[redacted]' })
    expect(redact(new Set(['a', 'b']))).toEqual(['a', 'b'])
  })

  it('caps depth rather than recursing without bound', () => {
    let deep: Record<string, unknown> = { value: 'end' }
    for (let i = 0; i < 40; i += 1) deep = { nested: deep }
    expect(() => redact(deep)).not.toThrow()
    expect(JSON.stringify(redact(deep))).toContain('[truncated]')
  })
})
