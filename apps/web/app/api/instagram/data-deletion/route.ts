import { createHash } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { igAccounts, withOrg } from '@claimfold/db'

import { readAppUrl } from '../../../../lib/app-url.ts'
import { readSignedRequest, verifySignedRequest } from '../../../../lib/meta-signed-request.ts'

/**
 * Meta's Data Deletion Request Callback.
 *
 * The other required field on a Meta app configuration, and the other one that
 * did not exist. Called when someone asks Meta to have their data removed from
 * this app.
 *
 * Meta requires a specific response shape — a `url` a person can visit to check
 * on the request, and a `confirmation_code` — so this cannot be a bare 200 like
 * the deauthorize callback.
 *
 * **What is actually deleted.** The `ig_accounts` row: the encrypted access
 * token, the encrypted Meta app secret, the username and the Instagram user id.
 * That is the whole of what this install holds which belongs to the Instagram
 * user. Posts, slides and claims are the operator's own editorial work and are
 * not the requester's personal data; they carry no Instagram identifier once
 * the account row is gone. `posts.ig_account_id` is `ON DELETE set null`, so
 * they survive with the link removed rather than cascading away someone's
 * published record.
 *
 * The confirmation code is derived from the account id rather than stored,
 * because there is no queue here: the deletion is synchronous and complete
 * before this responds, so there is no status to look up later beyond "it was
 * done". Deriving it keeps a code that is stable if Meta repeats the request.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const signedRequest = await readSignedRequest(request)
  if (!signedRequest) return respond('unverified')

  const verified = await verifySignedRequest(signedRequest)
  if (!verified.ok) return respond('unverified')

  await withOrg(verified.orgId, async (tx) => {
    await tx.delete(igAccounts).where(eq(igAccounts.id, verified.accountId))
  })

  return respond(confirmationFor(verified.accountId))
}

/** Stable, non-reversible, and not an id anyone can look anything up with. */
function confirmationFor(accountId: string): string {
  return createHash('sha256').update(`data-deletion:${accountId}`).digest('hex').slice(0, 16)
}

function respond(confirmationCode: string): Response {
  const base = readAppUrl().replace(/\/+$/, '')

  return Response.json(
    {
      url: `${base}/settings`,
      confirmation_code: confirmationCode,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
