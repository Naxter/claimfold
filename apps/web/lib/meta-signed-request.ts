import { createHmac, timingSafeEqual } from 'node:crypto'

import { decryptSecret } from '@claimfold/crypto'
import { igAccounts, withoutTenantScope } from '@claimfold/db'
import { eq } from 'drizzle-orm'

/**
 * Meta's `signed_request`, verified.
 *
 * Both the Deauthorize Callback and the Data Deletion Request Callback are
 * REQUIRED fields on a Meta app configuration — an operator cannot finish
 * setting one up without supplying URLs — and neither existed. Beyond the
 * stall, the practical consequence was that a user revoking access from
 * Instagram's side went unnoticed here until the next publish failed.
 *
 * These endpoints are unauthenticated by definition: Meta calls them
 * server-to-server with no session and no bearer token. The HMAC IS the
 * authentication, so everything below treats the payload as hostile until it
 * verifies.
 *
 * The signature is over the *encoded* payload string, not the decoded JSON —
 * re-encoding before verifying is the classic way to get this wrong, because
 * base64url has more than one valid encoding of the same bytes.
 */

export interface SignedRequestPayload {
  /** The Instagram-scoped user id. */
  user_id?: string
  algorithm?: string
  issued_at?: number
}

export type VerifiedRequest =
  | { ok: true; orgId: string; accountId: string; igUserId: string }
  | { ok: false }

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/**
 * Decode without verifying.
 *
 * Needed to learn WHICH account this is about, so the right app secret can be
 * fetched to check the signature against. Nothing from here is acted on — the
 * only field read is the user id, and it is used to look up a row, not to
 * decide anything.
 */
function peekUserId(payloadPart: string): string | null {
  try {
    const parsed = JSON.parse(fromBase64Url(payloadPart).toString('utf8')) as SignedRequestPayload
    return typeof parsed.user_id === 'string' && parsed.user_id ? parsed.user_id : null
  } catch {
    return null
  }
}

/**
 * Verify a `signed_request` and resolve it to a connected account.
 *
 * Unscoped, because there is no session and no tenant context — Meta's callback
 * knows only an Instagram user id. The lookup is by that id alone and returns
 * exactly the columns needed to check the signature; nothing tenant-owned is
 * read or returned before the HMAC passes.
 */
export async function verifySignedRequest(signedRequest: string): Promise<VerifiedRequest> {
  const [signaturePart, payloadPart] = signedRequest.split('.')
  if (!signaturePart || !payloadPart) return { ok: false }

  const igUserId = peekUserId(payloadPart)
  if (!igUserId) return { ok: false }

  const account = await withoutTenantScope(async (tx) => {
    const [row] = await tx
      .select({
        id: igAccounts.id,
        orgId: igAccounts.orgId,
        igUserId: igAccounts.igUserId,
        encryptedMetaAppSecret: igAccounts.encryptedMetaAppSecret,
      })
      .from(igAccounts)
      .where(eq(igAccounts.igUserId, igUserId))
      .limit(1)
    return row
  })

  if (!account) return { ok: false }

  let appSecret: string
  try {
    appSecret = decryptSecret(account.encryptedMetaAppSecret, 'meta_app_secret', account.orgId)
  } catch {
    return { ok: false }
  }

  // HMAC-SHA256 over the encoded payload string, exactly as received.
  const expected = createHmac('sha256', appSecret).update(payloadPart).digest()
  const provided = fromBase64Url(signaturePart)

  // `timingSafeEqual` throws on a length mismatch, which is itself an answer.
  if (provided.length !== expected.length) return { ok: false }
  if (!timingSafeEqual(provided, expected)) return { ok: false }

  return { ok: true, orgId: account.orgId, accountId: account.id, igUserId: account.igUserId }
}

/** Read `signed_request` from a form post or a query string. */
export async function readSignedRequest(request: Request): Promise<string | null> {
  const url = new URL(request.url)
  const fromQuery = url.searchParams.get('signed_request')
  if (fromQuery) return fromQuery

  try {
    const form = await request.formData()
    const value = form.get('signed_request')
    return typeof value === 'string' && value ? value : null
  } catch {
    return null
  }
}
