import { generateKeyPairSync, sign } from 'node:crypto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Offline licence verification.
 *
 * The public key is read from the environment at module load, so every test here
 * imports the module fresh after setting it. That is the awkward part of a
 * baked-in key and worth the awkwardness: a key resolved per call could be
 * swapped at runtime, which is the one thing a licence check must not allow.
 *
 * The suite signs its own keys with a throwaway pair, so it proves the real thing
 * — a genuine signature is accepted, a tampered one is not — rather than only
 * checking that nonsense is rejected.
 */

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const spki = publicKey.export({ format: 'der', type: 'spki' })
const PUBLIC_BASE64 = spki.subarray(spki.length - 32).toString('base64')

type LicenseModule = typeof import('../license.ts')

/** The module, loaded with a given public key in the environment. */
async function load(publicKeyBase64: string | undefined): Promise<LicenseModule> {
  vi.resetModules()
  if (publicKeyBase64 === undefined) delete process.env['LICENSE_PUBLIC_KEY']
  else process.env['LICENSE_PUBLIC_KEY'] = publicKeyBase64
  return import('../license.ts')
}

let mod: LicenseModule

/** A signed key, using the throwaway pair. */
function issue(
  payload: Record<string, unknown>,
  helpers: Pick<LicenseModule, 'toBase64Url' | 'signedBytes'>,
): string {
  const part = helpers.toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const signature = sign(null, helpers.signedBytes(part), privateKey)
  return `CLAIMFOLD-1.${part}.${helpers.toBase64Url(signature)}`
}

const VALID_PAYLOAD = {
  id: 'lic-1',
  tier: 'studio',
  licensee: 'Acme GmbH',
  issuedAt: '2026-01-01',
  expiresAt: '2027-01-01',
}

beforeAll(async () => {
  mod = await load(PUBLIC_BASE64)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('no key at all', () => {
  it('is evaluation, not an error', async () => {
    // The honest default for a self-hosted install nobody has paid for. Treating
    // it as a failure would put a red banner on every fresh install.
    expect(mod.verifyLicense('')).toEqual({ state: 'evaluation' })
    expect(mod.verifyLicense('   ')).toEqual({ state: 'evaluation' })
  })
})

describe('a genuine key', () => {
  it('is accepted, with its tier and licensee', () => {
    const status = mod.verifyLicense(issue(VALID_PAYLOAD, mod), new Date('2026-06-01'))

    expect(status.state).toBe('valid')
    if (status.state !== 'valid') return
    expect(status.payload.tier).toBe('studio')
    expect(status.payload.licensee).toBe('Acme GmbH')
    expect(mod.tierFor(status)).toBe('studio')
    expect(mod.needsAttention(status)).toBe(false)
  })

  it('is expired once the date has passed, and still recognisably genuine', () => {
    const status = mod.verifyLicense(issue(VALID_PAYLOAD, mod), new Date('2027-06-01'))

    expect(status.state).toBe('expired')
    if (status.state !== 'expired') return
    // The signature proved it was real, so the licensee can be named in the
    // banner — which is what makes it a renewal conversation and not an accusation.
    expect(status.payload.licensee).toBe('Acme GmbH')
    // Expired is not a paid tier.
    expect(mod.tierFor(status)).toBe('evaluation')
    expect(mod.needsAttention(status)).toBe(true)
  })

  it('never expires when the licence is perpetual', () => {
    const key = issue({ ...VALID_PAYLOAD, expiresAt: null }, mod)
    expect(mod.verifyLicense(key, new Date('2099-01-01')).state).toBe('valid')
  })

  it('refuses an expiry date it cannot read, rather than treating it as perpetual', () => {
    /*
      The failure this pins was a one-character-class problem with a large
      consequence: the check was `new Date(expiresAt).getTime() < now`, and for
      an unparseable date that is `NaN < now`, which is `false`. So a licence
      with a broken expiry sailed past and was valid forever — a signed key that
      cannot be evaluated was being honoured indefinitely, which is the wrong
      direction to fail in.

      Hard to reach by accident, because the payload is signed. "Hard to reach"
      is not "cannot happen", and there was no test.
    */
    for (const bad of ['2026-13-45', 'soon', '2026-99']) {
      const key = issue({ ...VALID_PAYLOAD, expiresAt: bad }, mod)
      const status = mod.verifyLicense(key, new Date('2026-06-01'))

      expect(status.state).toBe('invalid')
      expect(mod.tierFor(status)).toBe('evaluation')
      expect(mod.needsAttention(status)).toBe(true)
    }
  })

  it('treats an empty expiry as perpetual, the same as null', () => {
    // Deliberately NOT lumped in with the unparseable dates above: an absent
    // expiry and an empty one both mean "no expiry", and only a date that is
    // present but unreadable is a licence we cannot evaluate.
    const key = issue({ ...VALID_PAYLOAD, expiresAt: '' }, mod)
    expect(mod.verifyLicense(key, new Date('2099-01-01')).state).toBe('valid')
  })
})

describe('a key that should not be accepted', () => {
  it('rejects a tampered payload', () => {
    /*
      The case that matters. Someone edits the tier in a real key and keeps the
      original signature — which is exactly why the signature is checked before
      the payload is read for anything, including its own expiry date.
    */
    const genuine = issue({ ...VALID_PAYLOAD, tier: 'solo' }, mod)
    const [prefix, , signature] = genuine.split('.') as [string, string, string]
    const forged = mod.toBase64Url(
      Buffer.from(JSON.stringify({ ...VALID_PAYLOAD, tier: 'agency' }), 'utf8'),
    )

    const status = mod.verifyLicense(`${prefix}.${forged}.${signature}`)
    expect(status.state).toBe('invalid')
    expect(mod.tierFor(status)).toBe('evaluation')
  })

  it('rejects a signature from a different key', async () => {
    const other = generateKeyPairSync('ed25519')
    const otherSpki = other.publicKey.export({ format: 'der', type: 'spki' })
    const stranger = await load(otherSpki.subarray(otherSpki.length - 32).toString('base64'))

    // Signed with our pair, checked against somebody else's.
    expect(stranger.verifyLicense(issue(VALID_PAYLOAD, stranger)).state).toBe('invalid')

    mod = await load(PUBLIC_BASE64)
  })

  it('rejects a tier that is not one of ours', () => {
    // Signed correctly, but claiming a tier the database enum has never heard of.
    const key = issue({ ...VALID_PAYLOAD, tier: 'enterprise' }, mod)
    expect(mod.verifyLicense(key).state).toBe('invalid')
  })

  it('rejects malformed keys without throwing', () => {
    for (const key of [
      'nonsense',
      'CLAIMFOLD-1.only-one-part',
      'CLAIMFOLD-1.a.b.c',
      'CLAIMFOLD-2.abc.def',
      `CLAIMFOLD-1.${mod.toBase64Url(Buffer.from('not json'))}.AAAA`,
    ]) {
      expect(() => mod.verifyLicense(key), key).not.toThrow()
      expect(mod.verifyLicense(key).state, key).toBe('invalid')
    }
  })
})

describe('a build shipped without a public key', () => {
  it('says it cannot check, rather than trusting or accusing', async () => {
    /*
      "We cannot check this" and "this is fake" are different things to tell
      somebody, and the difference is whose mistake it is. A build with no
      `LICENSE_PUBLIC_KEY` is our packaging error.
    */
    const unkeyed = await load('')
    const status = unkeyed.verifyLicense(issue(VALID_PAYLOAD, unkeyed))

    expect(status.state).toBe('unverifiable')
    expect(unkeyed.tierFor(status)).toBe('evaluation')
    expect(unkeyed.needsAttention(status)).toBe(true)

    // Still evaluation with no key at all — nothing to check, nothing to warn.
    expect(unkeyed.verifyLicense('').state).toBe('evaluation')

    mod = await load(PUBLIC_BASE64)
  })
})
