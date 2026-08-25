/**
 * Instagram Graph API error handling.
 *
 * The API distinguishes poorly between "you did something wrong", "try again
 * later" and "this account is broken". Getting that classification right here
 * is what decides whether the worker retries, gives up, or asks the operator to
 * reconnect — and a wrong choice means either a hammering retry loop or a post
 * that silently never goes out.
 */

export interface GraphErrorBody {
  message?: string
  type?: string
  code?: number
  error_subcode?: number
  fbtrace_id?: string
}

export class InstagramError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
    readonly subcode: number | undefined,
    readonly httpStatus: number,
    /** Whether the worker should try this job again later. */
    readonly retryable: boolean,
    /** True when the operator must re-authorise; no retry will fix it. */
    readonly requiresReconnect: boolean = false,
  ) {
    super(message)
    this.name = 'InstagramError'
  }

  /**
   * How long Meta asked us to wait, from `Retry-After`, in seconds.
   *
   * Set by the client when the header is present. Mutable and optional because
   * it is metadata about this one response rather than part of what the error
   * IS — every other field here classifies the failure, this one only refines
   * the schedule. `handleFailure` prefers it over its own fixed delays, which
   * were guesses next to a number Meta was already telling us.
   */
  retryAfterSeconds?: number
}

/** Publishing quota exhausted for the rolling 24h window. */
export class PublishLimitError extends InstagramError {
  constructor(message: string) {
    super(message, 9, 2207042, 400, true)
    this.name = 'PublishLimitError'
  }
}

/**
 * A media container that no longer exists.
 *
 * Containers expire 24 hours after creation. This is NOT retryable with the
 * same id — the whole carousel must be rebuilt from scratch. Retrying the
 * publish call with a cached container id is the single most likely way to get
 * stuck in a loop that never succeeds.
 */
export class ContainerExpiredError extends InstagramError {
  constructor(message: string) {
    super(message, undefined, undefined, 400, false)
    this.name = 'ContainerExpiredError'
  }
}

/** Error codes that mean "the token is no longer usable". */
const AUTH_CODES = new Set([190, 102])
/** Subcodes under code 190 that specifically mean re-auth, not transient. */
const REAUTH_SUBCODES = new Set([458, 459, 460, 463, 464, 467, 492])

export function classifyGraphError(body: GraphErrorBody, httpStatus: number): InstagramError {
  const message = body.message ?? 'Instagram API request failed'
  const code = body.code
  const subcode = body.error_subcode

  // Publishing rate limit. Documented as code 9; the subcode is what actually
  // distinguishes it from other throttles.
  if (code === 9 || subcode === 2207042) {
    return new PublishLimitError(message)
  }

  // Expired or unknown container.
  if (subcode === 2207003 || /media.*(expired|not found)/i.test(message)) {
    return new ContainerExpiredError(message)
  }

  // Token problems. Distinguish "expired, reconnect" from "temporarily
  // rejected" — telling an operator to reconnect when they don't need to is
  // almost as bad as failing silently.
  if (code === 190 || AUTH_CODES.has(code ?? -1)) {
    const mustReconnect = subcode === undefined || REAUTH_SUBCODES.has(subcode)
    return new InstagramError(message, code, subcode, httpStatus, !mustReconnect, mustReconnect)
  }

  // Application-level throttling. Retryable with backoff.
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return new InstagramError(message, code, subcode, httpStatus, true)
  }

  // Transient server-side failures.
  if (code === 1 || code === 2 || httpStatus >= 500) {
    return new InstagramError(message, code, subcode, httpStatus, true)
  }

  // Everything else is a request we built wrong. Retrying an identical bad
  // request forever is worse than failing loudly.
  return new InstagramError(message, code, subcode, httpStatus, false)
}
