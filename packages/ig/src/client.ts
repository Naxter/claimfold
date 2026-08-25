import { redact } from '@claimfold/crypto'

import { classifyGraphError, InstagramError, type GraphErrorBody } from './errors.ts'

/**
 * Thin HTTP layer over the Instagram Graph API.
 *
 * Deliberately small. Everything interesting lives in the flows above it; this
 * exists so that error classification, redaction and version pinning happen in
 * exactly one place.
 */

/**
 * Pinned Graph API version.
 *
 * Meta ships a new version roughly quarterly and supports each for two years.
 * Pinning means a new version cannot silently change behaviour under a running
 * install; upgrading is a deliberate edit with a changelog to read first.
 */
export const GRAPH_VERSION = 'v25.0'

const GRAPH_HOST = 'https://graph.instagram.com'

export interface RequestOptions {
  accessToken: string
  /** Query parameters. `access_token` is added automatically. */
  params?: Record<string, string | number | boolean | undefined>
  method?: 'GET' | 'POST'
  /** Seconds. Publishing calls can be slow while Meta fetches the images. */
  timeoutSeconds?: number
}

/**
 * One Graph API call.
 *
 * The access token goes in the POST body or query string as the API requires,
 * but is never included in a thrown error or log line — Graph error payloads
 * routinely echo the request back, which is how live tokens end up in logs.
 */
export async function graphRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const { accessToken, params = {}, method = 'GET', timeoutSeconds = 60 } = options

  const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/${path.replace(/^\//, '')}`)
  const body = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (method === 'POST') body.set(key, String(value))
    else url.searchParams.set(key, String(value))
  }

  if (method === 'POST') body.set('access_token', accessToken)
  else url.searchParams.set('access_token', accessToken)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      body: method === 'POST' ? body : undefined,
      headers:
        method === 'POST'
          ? { 'content-type': 'application/x-www-form-urlencoded' }
          : undefined,
      signal: controller.signal,
      /*
        Redirects are refused rather than followed.

        The Graph endpoints used here return JSON and do not redirect, so this
        should never fire. If it ever does, the request carries a live access
        token in its query string or body — following it would hand that token
        to wherever the redirect pointed, and on a self-hosted box "wherever"
        can be an address inside the operator's own network. A publish that
        fails loudly is recoverable; a token that left the building is not.
      */
      redirect: 'error',
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new InstagramError(
        `Instagram API timed out after ${timeoutSeconds}s`,
        undefined,
        undefined,
        408,
        true,
      )
    }
    // Network-level failure: DNS, TLS, connection reset. Always worth retrying.
    throw new InstagramError(
      `Network error calling Instagram: ${redact((error as Error).message)}`,
      undefined,
      undefined,
      0,
      true,
    )
  }

  /*
    The body read stays INSIDE the timeout.

    `clearTimeout` used to sit in a `finally` on the fetch alone, so the
    AbortController was disarmed the moment headers arrived and
    `await response.text()` below was untimed. Meta answering headers promptly
    and then stalling the body would hang a publish indefinitely — with the
    post already claimed and its lease being renewed, which is the one state
    the worker cannot recover from on its own.
  */
  let text: string
  try {
    text = await response.text()
  } catch (error) {
    throw new InstagramError(
      `Instagram response body failed after ${timeoutSeconds}s: ${redact((error as Error).message)}`,
      undefined,
      undefined,
      408,
      true,
    )
  } finally {
    clearTimeout(timer)
  }

  /*
    Meta's own backpressure signals, which were both ignored.

    `x-app-usage` reports how much of the rolling call quota this app has spent;
    Meta starts throttling near 100 and the numbers are the only warning before
    it does. `Retry-After` on a 429 is Meta telling us exactly how long to wait,
    which is strictly better information than our fixed ten-minute guess.

    Attached to the error rather than acted on here: this function does one
    request and knows nothing about scheduling. `handleFailure` in the worker is
    where a delay means something.
  */
  const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'))
  const appUsage = parseAppUsage(response.headers.get('x-app-usage'))

  let payload: unknown
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    throw new InstagramError(
      `Instagram returned a non-JSON response (HTTP ${response.status})`,
      undefined,
      undefined,
      response.status,
      response.status >= 500,
    )
  }

  if (!response.ok || (payload as { error?: unknown }).error) {
    const errorBody = ((payload as { error?: GraphErrorBody }).error ?? {})
    // Redact before classification so nothing downstream can log the raw
    // message — Graph errors echo request parameters, including the token.
    const safe: GraphErrorBody = { ...errorBody, message: redact(errorBody.message ?? '') }
    const classified = classifyGraphError(safe, response.status)

    // Meta's own answer to "how long should I wait" beats ours, so carry it.
    if (retryAfterSeconds !== null) classified.retryAfterSeconds = retryAfterSeconds
    throw classified
  }

  /*
    Near the quota ceiling, and still succeeding.

    Worth saying out loud precisely because the request worked: by the time
    calls start failing, the operator has already been throttled. This is the
    only warning that arrives while there is still time to slow down.
  */
  if (appUsage !== null && appUsage >= APP_USAGE_WARN_AT) {
    console.warn(
      `[instagram] app usage at ${appUsage}% of Meta's rolling call quota. ` +
        `Publishing is throttled at 100%.`,
    )
  }

  return payload as T
}

/** Percentage of Meta's rolling quota past which we start warning. */
const APP_USAGE_WARN_AT = 80

/**
 * `Retry-After`, which Meta sends as seconds or as an HTTP date.
 *
 * Returns null for anything unparseable rather than guessing — a wrong delay is
 * worse than falling back to the caller's own schedule.
 */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null

  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)

  const at = Date.parse(header)
  if (Number.isNaN(at)) return null

  return Math.max(0, Math.ceil((at - Date.now()) / 1000))
}

/**
 * The worst of the three percentages in `x-app-usage`.
 *
 * Meta reports call_count, total_cputime and total_time separately, and
 * throttles on whichever hits 100 first — so the maximum is the only number
 * that answers "how close am I".
 */
function parseAppUsage(header: string | null): number | null {
  if (!header) return null

  try {
    const parsed = JSON.parse(header) as Record<string, unknown>
    const values = Object.values(parsed).filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    )
    return values.length > 0 ? Math.max(...values) : null
  } catch {
    return null
  }
}
