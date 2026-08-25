import { cookies } from 'next/headers'
import { and, eq } from 'drizzle-orm'

import { decryptSecret, encryptSecret, safeEqual } from '@claimfold/crypto'
import { igAccounts, withOrg } from '@claimfold/db'
import { exchangeCode, exchangeForLongLivedToken, fetchProfile } from '@claimfold/ig'

import { getMessages } from '../../../../lib/i18n/index.ts'
import { isResponse, requireSessionOr401 } from '../../../../lib/session.ts'
import { RETURN_COOKIE, STATE_COOKIE, pendingMarker } from '../connect/route.ts'

/**
 * Completing the Instagram connection.
 *
 * Order matters here. The state is validated BEFORE the authorization code is
 * exchanged, so a forged callback never causes a token to be minted at all.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const session = await requireSessionOr401()
  if (isResponse(session)) return session

  const e = (await getMessages()).errors

  const url = new URL(request.url)
  const jar = await cookies()

  // Where the operator started. Consent left the app, so this is the only way
  // back to the wizard rather than dumping a first-time user on settings one
  // step from the end. Anything unrecognised falls back to settings.
  const origin = jar.get(RETURN_COOKIE)?.value === 'setup' ? 'setup' : 'settings'
  const finish = (message: string, kind: 'ok' | 'error' = 'error') =>
    redirectBack(origin, message, kind)

  // The user declined, or Meta rejected the request.
  const error = url.searchParams.get('error_description') ?? url.searchParams.get('error')
  if (error) return finish(e.instagramDeclined(error))

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expected = jar.get(STATE_COOKIE)?.value

  if (!code || !state || !expected) {
    return finish(e.connectExpired)
  }

  // Constant-time compare, and only then check the org binding. A state minted
  // for one tenant must not be able to complete a connection for another, even
  // if the same browser is signed into both.
  if (!safeEqual(state, expected) || !state.startsWith(`${session.orgId}.`)) {
    return finish(e.connectUnverified)
  }

  // One-shot: consume the state immediately so a replayed callback fails.
  jar.delete(STATE_COOKIE)
  jar.delete(RETURN_COOKIE)

  /*
    Find the row THIS attempt created, by the nonce it was minted with.

    The nonce was already written into `igUserId` as `pending-<12 chars>` and
    then never read: this looked up any row with `status='disconnected'`, with
    no ordering and `LIMIT 1`. With two connection attempts open — a retry after
    a typo, or a second person in the org — the callback could pick the other
    one, decrypt with the wrong app secret and fail for no visible reason. It
    also meant an unprivileged member could park a junk pending row and break
    the operator's connect.
  */
  const nonce = state.slice(session.orgId.length + 1)

  const pending = await withOrg(session.orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(igAccounts)
      .where(
        and(eq(igAccounts.status, 'disconnected'), eq(igAccounts.igUserId, pendingMarker(nonce))),
      )
      .limit(1)
    return rows[0]
  })

  if (!pending) return finish(e.connectNoPending)

  try {
    const appSecret = decryptSecret(
      pending.encryptedMetaAppSecret,
      'meta_app_secret',
      session.orgId,
    )
    const config = {
      appId: pending.metaAppId,
      appSecret,
      // Must match the connect step byte for byte, or Meta rejects the exchange.
      redirectUri: `${process.env.APP_URL?.replace(/\/+$/, '')}/api/instagram/callback`,
    }

    const shortLived = await exchangeCode(config, code)
    const longLived = await exchangeForLongLivedToken(config, shortLived.accessToken)
    const profile = await fetchProfile(longLived.accessToken)

    if (!shortLived.permissions.includes('instagram_business_content_publish')) {
      return finish(e.connectNoPublish)
    }

    await withOrg(session.orgId, async (tx) => {
      await tx
        .update(igAccounts)
        .set({
          igUserId: profile.id,
          username: profile.username,
          encryptedToken: encryptSecret(
            longLived.accessToken,
            'ig_access_token',
            session.orgId,
          ),
          tokenExpiresAt: longLived.expiresAt,
          lastRefreshedAt: new Date(),
          status: 'connected',
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(igAccounts.id, pending.id))
    })

    return finish(e.connected(profile.username), 'ok')
  } catch (err) {
    return finish(e.connectFailed((err as Error).message))
  }
}

/**
 * Back to wherever the connection was started from.
 *
 * The wizard gets the step too: a success belongs on the readiness step that
 * follows, a failure on the credential step that produced it, because that is
 * where the fix is.
 */
function redirectBack(
  origin: 'setup' | 'settings',
  message: string,
  kind: 'ok' | 'error' = 'error',
): Response {
  const base = process.env.APP_URL?.replace(/\/+$/, '') ?? ''
  const target = new URL(`${base}/${origin}`)
  if (origin === 'setup') target.searchParams.set('step', kind === 'ok' ? '5' : '4')
  target.searchParams.set(kind === 'ok' ? 'connected' : 'error', message)
  return Response.redirect(target.toString(), 303)
}
