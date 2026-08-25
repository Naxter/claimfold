import { randomBytes } from 'node:crypto'

import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'

import { encryptSecret } from '@claimfold/crypto'
import { igAccounts, withOrg } from '@claimfold/db'
import { buildAuthorizeUrl } from '@claimfold/ig'

import { formText } from '../../../../lib/form.ts'
import { getMessages } from '../../../../lib/i18n/index.ts'
import { can } from '../../../../lib/permissions.ts'
import { isResponse, requireSessionOr401 } from '../../../../lib/session.ts'

/**
 * Start connecting an Instagram account.
 *
 * The operator supplies THEIR OWN Meta app credentials. That is the whole
 * reason this product needs no App Review: each install talks to Meta as its
 * own app with its own account as a role-holder, which is Standard Access.
 * Routing every customer through one shared app would make Advanced Access
 * mandatory and put a multi-week Meta review between a buyer and their first
 * post.
 */

export const dynamic = 'force-dynamic'

const STATE_COOKIE = 'ig_oauth_state'

/**
 * Where to land after consent.
 *
 * Consent leaves the app and returns through a redirect that carries no memory
 * of where it started, so the origin is parked in a cookie. The value is
 * matched against a fixed set rather than reflected: a path taken from a form
 * field and used in a redirect is an open redirect, and this one survives a
 * round trip through an external site.
 */
const RETURN_COOKIE = 'ig_oauth_return'
const RETURN_TARGETS = new Set(['setup', 'settings'])

export async function POST(request: Request): Promise<Response> {
  const session = await requireSessionOr401()
  if (isResponse(session)) return session

  /**
   * The capability check this route did not have.
   *
   * Every other write path in the app gates on `can(session, …)` — every server
   * action under app/**\/actions.ts does. This one, the endpoint that writes the
   * encrypted Meta app secret and decides which Instagram account the org's
   * posts land on, checked only that *someone* was signed in.
   *
   * Two things a read-only member could do with that:
   *
   *  - Insert a junk row with `status='disconnected'`. The callback picks a
   *    pending row with no ordering, so the operator's real consent could
   *    resolve against the attacker's row and fail to decrypt — a denial of
   *    connection with no obvious cause.
   *  - On an install with nothing connected yet, complete consent with their
   *    own Meta app and their own Instagram account, becoming the org's only
   *    connected account. `soleConnectedAccountId` then pre-fills it as the
   *    default for the operator's next channel.
   *
   * `publish` rather than `edit`: this decides where posts go, under someone's
   * real name, which is the same class of decision as approving one.
   */
  if (!can(session, 'publish')) {
    return new Response('Not permitted', { status: 403 })
  }

  /*
    Origin check, as defence in depth.

    Next's built-in cross-origin protection covers Server Actions, not route
    handlers. The actual defence here is `sameSite: 'lax'` on the session
    cookie, which does block a cross-site POST — but this is the one endpoint
    in the product that writes a credential, and relying on a single cookie
    attribute for it is thinner than it deserves.

    Same-origin only. This form is never embedded anywhere and never posted to
    from another site, so there is no legitimate cross-origin caller to break.
  */
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(requireAppUrl()).origin) {
    return new Response('Cross-origin request refused', { status: 403 })
  }

  const e = (await getMessages()).errors

  const form = await request.formData()
  const appId = formText(form, 'appId').trim()
  const appSecret = formText(form, 'appSecret').trim()
  const returnTo = formText(form, 'returnTo').trim()

  // Instagram Login authorises against instagram.com with the Instagram
  // product's own credentials — not the Meta App ID in the dashboard header.
  // Both are long numbers, so the wrong one gets this far and fails at consent.
  if (!/^\d{5,}$/.test(appId)) {
    return badRequest(e.appIdFormat)
  }
  if (appSecret.length < 16) {
    return badRequest(e.appSecretFormat)
  }

  const redirectUri = `${requireAppUrl()}/api/instagram/callback`

  /**
   * CSRF defence for the OAuth callback.
   *
   * Without it, an attacker can walk a signed-in victim through a consent flow
   * that attaches the ATTACKER's Instagram account to the victim's workspace —
   * after which the victim's posts publish to the attacker's audience. The
   * nonce is bound to the org so a state minted for one tenant cannot complete
   * a connection for another.
   */
  const nonce = randomBytes(32).toString('base64url')
  const state = `${session.orgId}.${nonce}`

  const jar = await cookies()
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: requireAppUrl().startsWith('https://'),
    path: '/',
    maxAge: 600,
  }
  jar.set(STATE_COOKIE, state, cookieOptions)
  jar.set(RETURN_COOKIE, RETURN_TARGETS.has(returnTo) ? returnTo : 'settings', cookieOptions)

  // Store the credentials now so the callback can complete the exchange. The
  // secret is encrypted immediately; it is never held in a cookie or the URL.
  await withOrg(session.orgId, async (tx) => {
    const existing = await tx
      .select({ id: igAccounts.id })
      .from(igAccounts)
      .where(eq(igAccounts.metaAppId, appId))
      .limit(1)

    const values = {
      orgId: session.orgId,
      metaAppId: appId,
      encryptedMetaAppSecret: encryptSecret(appSecret, 'meta_app_secret', session.orgId),
      updatedAt: new Date(),
    }

    if (existing[0]) {
      /*
        `status` and the pending marker have to be rewritten here too.

        The update branch used to set only the credentials, so a row that was
        already `connected` stayed `connected` — and the callback, which looks
        for a pending row, then answered `connectNoPending`. Re-connecting an
        account, which is exactly what credential rotation and a re-auth after
        an expired token both do, could not complete.
      */
      await tx
        .update(igAccounts)
        .set({
          ...values,
          igUserId: pendingMarker(nonce),
          status: 'disconnected',
        })
        .where(eq(igAccounts.id, existing[0].id))
    } else {
      await tx.insert(igAccounts).values({
        ...values,
        // Placeholders until consent completes. `disconnected` keeps the
        // worker from treating this as a publishable account.
        igUserId: pendingMarker(nonce),
        username: 'pending',
        encryptedToken: encryptSecret('pending', 'ig_access_token', session.orgId),
        tokenExpiresAt: new Date(Date.now() + 600_000),
        status: 'disconnected',
      })
    }
  })

  const url = buildAuthorizeUrl({ appId, appSecret, redirectUri }, state)
  return Response.redirect(url, 303)
}

function badRequest(message: string): Response {
  return new Response(message, { status: 400 })
}

function requireAppUrl(): string {
  const url = process.env.APP_URL
  if (!url) throw new Error('APP_URL is not set; the OAuth redirect URI cannot be built.')
  return url.replace(/\/+$/, '')
}

/**
 * The placeholder `igUserId` a row carries between consent starting and
 * finishing, derived from this attempt's nonce.
 *
 * It was already written in this shape but never read back: the callback found
 * its row with `WHERE status='disconnected' … LIMIT 1`, unordered, so with two
 * connection attempts open it could pick the wrong one and decrypt the wrong
 * secret. Deriving it in one place and matching on it makes the nonce do the
 * job it was minted for.
 */
export function pendingMarker(nonce: string): string {
  return `pending-${nonce.slice(0, 12)}`
}

export { STATE_COOKIE, RETURN_COOKIE }
