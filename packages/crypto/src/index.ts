import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

/**
 * Envelope encryption for secrets at rest.
 *
 * What lives in here: Instagram long-lived access tokens and per-organization
 * Meta app secrets. A leak of the database alone must not be enough to post to
 * a customer's Instagram account.
 *
 * Design notes, and why each choice is not arbitrary:
 *
 *  - AES-256-GCM, not CBC. GCM is authenticated: tampering is detected on
 *    decrypt rather than silently producing garbage plaintext.
 *  - A fresh random 96-bit IV per encryption. GCM catastrophically loses
 *    confidentiality on IV reuse, so it is never derived or counted.
 *  - Additional Authenticated Data binds each ciphertext to the organization
 *    and field it belongs to. Copying org A's encrypted token into org B's row
 *    produces a decryption failure, not a working token. Without AAD, a
 *    database write bug becomes account takeover between tenants.
 *  - A version prefix, so the algorithm can be rotated later without having to
 *    guess what old rows contain.
 */

const VERSION = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32

let cachedKey: Buffer | null = null

function loadKey(): Buffer {
  if (cachedKey) return cachedKey

  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    )
  }

  const key = Buffer.from(raw, 'base64')
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}. ` +
        'It should be 32 random bytes, base64-encoded.',
    )
  }

  cachedKey = key
  return key
}

/**
 * Identifies what a ciphertext is for. Mixed into the AAD, so a value
 * encrypted as one kind cannot be decrypted as another.
 */
export type SecretPurpose = 'ig_access_token' | 'meta_app_secret'

function buildAad(purpose: SecretPurpose, orgId: string): Buffer {
  if (!orgId) throw new Error('encrypt/decrypt requires an organization id')
  return Buffer.from(`${VERSION}:${purpose}:${orgId}`, 'utf8')
}

/**
 * Encrypt a secret for one organization.
 *
 * Output: `v1.<iv>.<tag>.<ciphertext>`, all base64url. Safe to store in a text
 * column and to move through JSON.
 */
export function encryptSecret(
  plaintext: string,
  purpose: SecretPurpose,
  orgId: string,
): string {
  const key = loadKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(buildAad(purpose, orgId))

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

/**
 * Decrypt a secret. Throws if the payload was tampered with, was encrypted for
 * a different organization or purpose, or the key has changed.
 *
 * Callers should treat a throw as "this account must reconnect", never as
 * something to retry.
 */
export function decryptSecret(
  payload: string,
  purpose: SecretPurpose,
  orgId: string,
): string {
  const key = loadKey()
  const parts = payload.split('.')
  if (parts.length !== 4) {
    throw new Error('Malformed ciphertext: expected 4 dot-separated segments')
  }

  const [version, ivB64, tagB64, dataB64] = parts as [string, string, string, string]
  if (version !== VERSION) {
    throw new Error(`Unsupported ciphertext version "${version}"`)
  }

  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const ciphertext = Buffer.from(dataB64, 'base64url')

  if (iv.length !== IV_BYTES) throw new Error('Malformed ciphertext: bad IV length')
  if (tag.length !== TAG_BYTES) throw new Error('Malformed ciphertext: bad tag length')

  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES })
  decipher.setAAD(buildAad(purpose, orgId))
  decipher.setAuthTag(tag)

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    // Deliberately opaque: the specific reason (wrong key vs wrong org vs
    // tampering) is not something a caller should branch on, and echoing it
    // back would leak whether a given ciphertext belongs to a given tenant.
    throw new Error('Decryption failed: ciphertext is invalid, tampered with, or not yours')
  }
}

/** Constant-time string comparison, for licence keys and webhook signatures. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Redact anything that looks like a secret before it reaches a log.
 *
 * Instagram tokens are long opaque strings that show up in error payloads from
 * the Graph API, so an unfiltered `console.error(err)` on a failed publish is a
 * realistic way to write a live token to disk.
 */
const SECRET_PATTERNS: RegExp[] = [
  /\bIG[A-Za-z0-9_-]{20,}\b/g, // Instagram access tokens
  /\bEA[A-Za-z0-9]{20,}\b/g, // Meta/Facebook access tokens
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, // Anthropic API keys
  /\bsk-[A-Za-z0-9_-]{20,}\b/g, // OpenAI keys, incl. sk-proj-
  /\bv1\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]+/g, // our own envelopes
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi, // Authorization headers in free text
  // Credentials in query strings. Meta REQUIRES access_token as a URL
  // parameter, so any thrown fetch error carries a live token in its message.
  /\b(access_token|client_secret|refresh_token|api[_-]?key|code)=[^&\s"']{8,}/gi,
  /\b(ENCRYPTION_KEY|AUTH_SECRET|POSTGRES_PASSWORD)=\S+/g,
  /\b[a-z][a-z0-9+.-]*:\/\/[^:/\s]+:[^@\s]+@/gi, // user:password@host in a URL
]

const SECRET_KEY_NAMES = /token|secret|password|api[_-]?key|authorization|credential|cookie/i

/** Depth cap, so a deeply nested structure cannot blow the stack. */
const MAX_DEPTH = 8

function redactString(value: string): string {
  let out = value
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[redacted]')
  return out
}

/**
 * Strip secrets from anything before it reaches a log.
 *
 * Three failure modes this has to survive, all of which the first version did
 * not:
 *
 *  - **Errors.** `Object.entries(new Error(...))` is `[]`, because `message`
 *    and `stack` are non-enumerable. The naive object branch turned every
 *    error into `{}` — so the one thing redaction exists for, logging a caught
 *    failure, silently discarded the entire error.
 *  - **Circular references.** `fetch`/undici errors carry circular
 *    request/response links. Recursing them threw a RangeError from inside a
 *    catch block, converting a handled failure into an unhandled one.
 *  - **Coverage.** Redacting Anthropic keys while missing OpenAI keys, bearer
 *    tokens, `access_token=` parameters and database URLs is worse than not
 *    redacting at all, because it reads as safe.
 */
export function redact(value: string): string
export function redact(value: unknown): unknown
export function redact(value: unknown): unknown {
  // Not `<T>(value: T): T`. That signature was a lie: an Error goes in and a
  // plain object comes out, so callers were told they still had an Error.
  // Strings are overloaded because that is the common case and callers do
  // want a string back.
  return redactValue(value, new WeakSet(), 0)
}

function redactValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redactString(value)
  if (typeof value !== 'object') return value

  if (depth >= MAX_DEPTH) return '[truncated]'

  // Cycles are normal in fetch errors, not exotic.
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      name: value.name,
      message: redactString(value.message),
    }
    if (value.stack) out['stack'] = redactString(value.stack)
    if (value.cause !== undefined) out['cause'] = redactValue(value.cause, seen, depth + 1)

    // Libraries hang useful context off custom error properties (status,
    // code, requestId). Those are enumerable, so pick them up too.
    for (const [key, v] of Object.entries(value)) {
      if (key in out) continue
      out[key] = SECRET_KEY_NAMES.test(key) ? '[redacted]' : redactValue(v, seen, depth + 1)
    }
    return out
  }

  if (value instanceof Date) return value.toISOString()
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return `[buffer ${value.byteLength} bytes]`
  }
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([k, v]) => [
        String(k),
        SECRET_KEY_NAMES.test(String(k)) ? '[redacted]' : redactValue(v, seen, depth + 1),
      ]),
    )
  }
  if (value instanceof Set) return [...value].map((v) => redactValue(v, seen, depth + 1))
  if (Array.isArray(value)) return value.map((v) => redactValue(v, seen, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    // Redact by key name too — a short or unusual token still must not leak.
    out[key] = SECRET_KEY_NAMES.test(key) ? '[redacted]' : redactValue(v, seen, depth + 1)
  }
  return out
}

/** Test seam. Never call this from application code. */
export function __resetKeyCacheForTests(): void {
  cachedKey = null
}

export {
  needsAttention,
  signedBytes,
  tierFor,
  toBase64Url,
  verifyLicense,
  type LicensePayload,
  type LicenseStatus,
  type LicenseTier,
} from './license.ts'
