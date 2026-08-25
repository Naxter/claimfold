import { createPublicKey, verify } from 'node:crypto'

/**
 * Offline licence verification.
 *
 * `.env.example` has promised "Ed25519-signed key, verified offline" since the
 * first commit, `organization.licenseTier` says it is "cached from the licence
 * key at boot", and docker-compose passes `LICENSE_KEY` through. None of it was
 * read by anything: setting a licence key did nothing at all, and every install
 * sat on the enum's `evaluation` default.
 *
 * Offline is the whole design. A self-hosted product that phones home to check a
 * licence stops working when the vendor's server does, and buyers of self-hosted
 * software are buying the absence of that dependency. A signature can be checked
 * with no network, and a key that cannot be checked is reported as unchecked
 * rather than quietly trusted.
 *
 * NOTHING IS GATED ON THE RESULT YET. This reports what the licence says; no
 * feature reads it. That is deliberate — turning limits on is a pricing decision,
 * and a half-enforced tier that locks an operator out of their own workspace is
 * worse than an honest banner.
 */

/**
 * The vendor's public signing key, base64 of the raw 32 bytes.
 *
 * Committed on purpose — it is the public half, and baking it into the build is
 * what makes verification independent of any server. The private half signs
 * keys and must never be in this repository; `npm run license:keygen` writes it
 * to a gitignored file.
 *
 * Empty until a keypair is generated. An empty key means verification is
 * impossible, which is reported as `unverifiable` — never as valid, and never as
 * a forgery either, because "we cannot check this" and "this is fake" are
 * different things to tell somebody.
 */
const PUBLIC_KEY_BASE64 = process.env['LICENSE_PUBLIC_KEY'] ?? ''

/** The tiers the database enum knows about. */
export type LicenseTier = 'evaluation' | 'solo' | 'studio' | 'agency'

const TIERS: LicenseTier[] = ['evaluation', 'solo', 'studio', 'agency']

export interface LicensePayload {
  /** Stable id, so a leaked key can be named in a revocation list later. */
  id: string
  tier: LicenseTier
  /** Who it was issued to. Shown in the interface so a mix-up is visible. */
  licensee: string
  issuedAt: string
  /** ISO date, or null for a perpetual licence. */
  expiresAt: string | null
}

export type LicenseStatus =
  /** No key set. The honest default for an install nobody has paid for. */
  | { state: 'evaluation' }
  /** A key was set, but this build has no public key to check it against. */
  | { state: 'unverifiable'; reason: string }
  /** Signature did not match, or the key is malformed. */
  | { state: 'invalid'; reason: string }
  /** Verified, and past its expiry date. */
  | { state: 'expired'; payload: LicensePayload }
  | { state: 'valid'; payload: LicensePayload }

/**
 * `CLAIMFOLD-1.<payload>.<signature>`, both parts base64url.
 *
 * A version prefix so a future format change is a clear refusal rather than a
 * confusing signature failure, and base64url so a key survives being pasted into
 * an env file, a shell and a YAML block without escaping.
 */
const PREFIX = 'CLAIMFOLD-1.'

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export function toBase64Url(value: Buffer): string {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The signed bytes. Kept in one place so signing and verifying cannot disagree. */
export function signedBytes(payloadBase64Url: string): Buffer {
  return Buffer.from(`${PREFIX}${payloadBase64Url}`, 'utf8')
}

function parsePayload(raw: unknown): LicensePayload | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>

  const tier = value['tier']
  if (typeof tier !== 'string' || !TIERS.includes(tier as LicenseTier)) return null
  if (typeof value['id'] !== 'string' || typeof value['licensee'] !== 'string') return null
  if (typeof value['issuedAt'] !== 'string') return null

  const expiresAt = value['expiresAt']
  if (expiresAt !== null && typeof expiresAt !== 'string') return null

  return {
    id: value['id'],
    tier: tier as LicenseTier,
    licensee: value['licensee'],
    issuedAt: value['issuedAt'],
    expiresAt: expiresAt ?? null,
  }
}

/**
 * Check a licence key.
 *
 * Order matters: the signature is verified BEFORE the payload is trusted for
 * anything, including its own expiry date. Reading the expiry out of an unsigned
 * payload and then deciding it is merely "expired" would let anyone mint a key
 * that claims a tier — the difference between a signed statement and a string.
 */
export function verifyLicense(key: string, now = new Date()): LicenseStatus {
  const trimmed = key.trim()
  if (!trimmed) return { state: 'evaluation' }

  if (!PUBLIC_KEY_BASE64) {
    return {
      state: 'unverifiable',
      reason: 'This build has no licence signing key, so a key cannot be checked.',
    }
  }

  if (!trimmed.startsWith(PREFIX)) {
    return { state: 'invalid', reason: 'Not a Claimfold licence key.' }
  }

  const parts = trimmed.slice(PREFIX.length).split('.')
  if (parts.length !== 2) return { state: 'invalid', reason: 'Licence key is malformed.' }

  const [payloadPart, signaturePart] = parts as [string, string]

  let ok = false
  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([
        // DER prefix for a raw Ed25519 public key, so the 32 bytes can be
        // committed as plain base64 instead of a PEM block in a source file.
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(PUBLIC_KEY_BASE64, 'base64'),
      ]),
      format: 'der',
      type: 'spki',
    })

    ok = verify(null, signedBytes(payloadPart), publicKey, fromBase64Url(signaturePart))
  } catch {
    // A malformed public key or signature lands here. Reported as invalid rather
    // than thrown: a bad licence must never stop the application booting.
    return { state: 'invalid', reason: 'Licence signature could not be checked.' }
  }

  if (!ok) return { state: 'invalid', reason: 'Licence signature does not match.' }

  let payload: LicensePayload | null
  try {
    payload = parsePayload(JSON.parse(fromBase64Url(payloadPart).toString('utf8')))
  } catch {
    payload = null
  }

  if (!payload) return { state: 'invalid', reason: 'Licence contents are not readable.' }

  if (payload.expiresAt) {
    const expiresAt = new Date(payload.expiresAt).getTime()

    /*
      An unparseable expiry is invalid, not perpetual.

      `NaN < now` is false, so `2026-13-45` — or any other string that survives
      payload parsing but not `Date` — sailed past this check and the licence
      was treated as valid forever. The signature makes that hard to reach by
      accident, but "hard to reach" is not the same as "cannot happen", and the
      failure direction was wrong: a licence we cannot evaluate should not be
      one we honour indefinitely.
    */
    if (Number.isNaN(expiresAt)) {
      return { state: 'invalid', reason: 'Licence expiry date is not a valid date.' }
    }

    if (expiresAt < now.getTime()) return { state: 'expired', payload }
  }

  return { state: 'valid', payload }
}

/**
 * The tier to record, whatever the licence turned out to be.
 *
 * Anything short of a valid licence is `evaluation`. Notably an EXPIRED licence
 * is evaluation too — the signature proves it was genuine, and it is still not
 * current. `organization.licenseTier` is a cache of this.
 */
export function tierFor(status: LicenseStatus): LicenseTier {
  return status.state === 'valid' ? status.payload.tier : 'evaluation'
}

/** True when the operator should be told something. */
export function needsAttention(status: LicenseStatus): boolean {
  return status.state === 'invalid' || status.state === 'expired' || status.state === 'unverifiable'
}
