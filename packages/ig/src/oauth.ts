import { InstagramError } from './errors.ts'

/**
 * "Instagram API with Instagram Login" OAuth.
 *
 * Chosen over the Facebook Login path because it needs no linked Facebook
 * Page, and — crucially for a product sold to other people — each operator
 * registers their own Meta app and adds their own account as a role-holder.
 * That keeps every install on Standard Access, so nobody ever needs App Review.
 * Routing all installs through one shared app would make Advanced Access
 * mandatory and put a weeks-long Meta review between a buyer and their first
 * post.
 */

const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize'
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token'
const GRAPH_TOKEN_URL = 'https://graph.instagram.com/access_token'
const GRAPH_REFRESH_URL = 'https://graph.instagram.com/refresh_access_token'

/**
 * Least privilege. `instagram_business_basic` identifies the account,
 * `content_publish` posts, `manage_insights` reads metrics. Notably absent:
 * anything that can read or send DMs or manage comments — the product never
 * needs them, and asking for them would widen the blast radius of a stolen
 * token for no benefit.
 */
export const SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_insights',
] as const

export interface OAuthConfig {
  appId: string
  appSecret: string
  /** Must match a redirect URI registered on the Meta app, exactly. */
  redirectUri: string
}

/**
 * Read a field out of a Graph API response as a string, or fail.
 *
 * Everything here previously used `String(payload[key])`, which turns an
 * object into the literal text `[object Object]`. For a message that is only
 * logged, that is ugly. For `access_token` it is a real defect: the placeholder
 * would be encrypted, stored and used, and every later publish would fail with
 * an opaque Graph error rather than "Meta returned something unexpected".
 *
 * Numbers are accepted because Meta returns `user_id` as one in some responses
 * and as a string in others.
 */
function requireText(payload: Record<string, unknown>, key: string): string {
  const value = payload[key]
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number') return String(value)

  throw new InstagramError(
    `Instagram returned no usable "${key}". This normally means the Meta app is ` +
      'misconfigured — check the app id, the secret and the redirect URI.',
    undefined,
    undefined,
    // The HTTP call succeeded; the body was not what the API documents. 502
    // says "upstream gave us something we cannot use", which is what happened.
    502,
    false,
  )
}

/** Same, but for fields that are genuinely optional. */
function optionalText(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number') return String(value)
  return undefined
}

/**
 * Build the consent URL.
 *
 * `state` is required, not optional: without it the callback is vulnerable to
 * login-CSRF, where an attacker walks a victim through connecting the
 * attacker's Instagram account to the victim's workspace. Callers must generate
 * it unpredictably, store it against the session, and compare on return.
 */
export function buildAuthorizeUrl(config: OAuthConfig, state: string): string {
  if (!state) throw new Error('OAuth state is required')

  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', config.appId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', SCOPES.join(','))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

export interface ShortLivedToken {
  accessToken: string
  userId: string
  permissions: string[]
}

/** Exchange the callback code for a short-lived (1 hour) token. */
export async function exchangeCode(
  config: OAuthConfig,
  code: string,
): Promise<ShortLivedToken> {
  const body = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
    // Meta appends `#_` to the code in the browser redirect. Leaving it on
    // produces a confusing "invalid code" that looks like a config error.
    code: code.replace(/#_$/, ''),
  })

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  })

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>

  if (!response.ok) {
    throw new InstagramError(
      optionalText(payload, 'error_message') ??
        optionalText(payload, 'error') ??
        'Code exchange failed',
      undefined,
      undefined,
      response.status,
      false,
    )
  }

  return {
    accessToken: requireText(payload, 'access_token'),
    userId: requireText(payload, 'user_id'),
    permissions: Array.isArray(payload['permissions'])
      ? payload['permissions'].filter((p): p is string => typeof p === 'string')
      : (optionalText(payload, 'permissions') ?? '').split(',').filter(Boolean),
  }
}

export interface LongLivedToken {
  accessToken: string
  /** Absolute expiry, computed from the API's relative `expires_in`. */
  expiresAt: Date
}

/** Trade a short-lived token for a 60-day one. Server-side only — uses the app secret. */
export async function exchangeForLongLivedToken(
  config: OAuthConfig,
  shortLivedToken: string,
): Promise<LongLivedToken> {
  const url = new URL(GRAPH_TOKEN_URL)
  url.searchParams.set('grant_type', 'ig_exchange_token')
  url.searchParams.set('client_secret', config.appSecret)
  url.searchParams.set('access_token', shortLivedToken)

  return requestToken(url, 'Long-lived token exchange failed')
}

/**
 * Refresh a long-lived token, extending it 60 days from now.
 *
 * Two constraints that make this unforgiving: the token must be at least 24
 * hours old, and it must not yet have expired. Miss the window and there is no
 * recovery — the operator must go through consent again. The worker therefore
 * refreshes well before the cliff rather than close to it.
 */
export async function refreshLongLivedToken(currentToken: string): Promise<LongLivedToken> {
  const url = new URL(GRAPH_REFRESH_URL)
  url.searchParams.set('grant_type', 'ig_refresh_token')
  url.searchParams.set('access_token', currentToken)

  return requestToken(url, 'Token refresh failed')
}

async function requestToken(url: URL, failureMessage: string): Promise<LongLivedToken> {
  const response = await fetch(url)
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>

  if (!response.ok || !payload['access_token']) {
    const detail = (payload['error'] as { message?: string } | undefined)?.message
    throw new InstagramError(
      `${failureMessage}${detail ? `: ${detail}` : ''}`,
      undefined,
      undefined,
      response.status,
      response.status >= 500,
      // A refusal here means the token is unusable; only re-consent fixes it.
      response.status === 400,
    )
  }

  const expiresIn = Number(payload['expires_in'] ?? 60 * 60 * 24 * 60)
  return {
    accessToken: requireText(payload, 'access_token'),
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  }
}

export interface AccountProfile {
  id: string
  username: string
  accountType?: string
}

/** Who this token belongs to. Used to label the connection in the dashboard. */
export async function fetchProfile(accessToken: string): Promise<AccountProfile> {
  const url = new URL('https://graph.instagram.com/v25.0/me')
  url.searchParams.set('fields', 'id,username,account_type')
  url.searchParams.set('access_token', accessToken)

  const response = await fetch(url)
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>

  if (!response.ok) {
    throw new InstagramError(
      'Could not read the connected account profile',
      undefined,
      undefined,
      response.status,
      false,
    )
  }

  return {
    id: requireText(payload, 'id'),
    username: optionalText(payload, 'username') ?? 'unknown',
    accountType: optionalText(payload, 'account_type'),
  }
}
