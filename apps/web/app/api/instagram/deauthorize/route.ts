import { eq } from 'drizzle-orm'

import { igAccounts, withOrg } from '@claimfold/db'

import { readSignedRequest, verifySignedRequest } from '../../../../lib/meta-signed-request.ts'

/**
 * Meta's Deauthorize Callback.
 *
 * Called server-to-server when someone removes this app from their Instagram
 * account. A required field on the Meta app configuration, and it did not
 * exist — so an operator could not finish the setup wizard's Meta half, and a
 * revoked connection was discovered here only when the next scheduled publish
 * failed with an opaque token error.
 *
 * Marks the account disconnected rather than deleting it. The revocation is
 * about access, not about the record: the org's posts still reference this
 * account, and the operator needs to see *which* channel stopped working in
 * order to reconnect it. Deletion is what the data-deletion callback is for.
 *
 * Always answers 200. Meta retries on a non-2xx, and there is nothing to retry:
 * an unverifiable request will not become verifiable. The body says nothing
 * about whether the account was found, because this endpoint is unauthenticated
 * and a distinguishable response is an oracle for which Instagram accounts an
 * install has connected.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const signedRequest = await readSignedRequest(request)
  if (!signedRequest) return ok()

  const verified = await verifySignedRequest(signedRequest)
  if (!verified.ok) return ok()

  await withOrg(verified.orgId, async (tx) => {
    await tx
      .update(igAccounts)
      .set({
        status: 'disconnected',
        lastError:
          'Access was removed from the Instagram side. Reconnect this account to publish again.',
        updatedAt: new Date(),
      })
      .where(eq(igAccounts.id, verified.accountId))
  })

  return ok()
}

function ok(): Response {
  return Response.json({ received: true }, { headers: { 'Cache-Control': 'no-store' } })
}
