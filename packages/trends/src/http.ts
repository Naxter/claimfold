/**
 * The one way this package talks to the internet.
 *
 * Three rules, each learned from a published policy rather than invented:
 *
 * 1. **Identify yourself.** Wikimedia rejects requests with no `User-Agent`,
 *    and asks that the value name the tool and a way to contact its operator.
 *    An install that sets nothing still sends something honest.
 * 2. **Stay under 10 requests a minute.** Well below anything published, and
 *    deliberately so — discovery is a background nicety, not a hot path, and
 *    a free service being polite to is worth more than a fast run.
 * 3. **Back off rather than hammer.** 429 and 5xx are retried with growing
 *    delay; 4xx is not retried at all, because a bad request stays bad.
 *
 * Every URL is built here from a constant base plus encoded parameters. No
 * caller passes a whole URL, so nothing a search result says can redirect
 * these requests somewhere else — the same containment the verifier stage
 * uses, for the same reason.
 *
 * That paragraph was true of the *first* request and quietly false after it.
 * `redirect: 'follow'` handed the destination back to whatever answered, and
 * on a self-hosted product "wherever the upstream says" can mean a metadata
 * endpoint or an admin panel on the operator's own network. So redirects are
 * followed by hand now, and every hop has to land on a host this package
 * actually has business talking to. See `assertAllowedHost`.
 */

/**
 * The only hosts discovery may reach, matched as exact names or suffixes.
 *
 * Small and closed on purpose. An allowlist that has to be edited when a
 * source is added is an allowlist somebody reads; a denylist of private
 * ranges is one somebody forgets a range in.
 */
const ALLOWED_HOSTS = [
  'wikimedia.org',
  'wikipedia.org',
  'wikidata.org',
  'trends.google.com',
  'api.gdeltproject.org',
] as const

const MAX_REDIRECTS = 3

/**
 * Refuse anything that is not a known upstream reached over TLS.
 *
 * The IP-literal check is belt to the allowlist's braces: no entry above is a
 * number, so a numeric host can only arrive from a redirect, and the only
 * reason to redirect a public API to an address is to get it to fetch
 * something on the inside of a network.
 */
function assertAllowedHost(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new SourceError(`refusing ${url.protocol}//${url.host}: discovery is https-only`)
  }

  const host = url.hostname.toLowerCase()

  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    throw new SourceError(`refusing the address ${host}: sources are named hosts, not addresses`)
  }

  const allowed = ALLOWED_HOSTS.some(
    (entry) => host === entry || host.endsWith(`.${entry}`),
  )
  if (!allowed) {
    throw new SourceError(`refusing ${host}: not a discovery source`)
  }
}

const MAX_REQUESTS_PER_MINUTE = 10
const WINDOW_MS = 60_000

/** Timestamps of requests inside the current window. */
let recent: number[] = []

/**
 * Per process, not per install.
 *
 * The web app and the worker each hold their own bucket, so two processes
 * discovering at once can reach twice this. Accepted: discovery is operator-
 * triggered and single-flighted per org by the caller, and the alternative is
 * a shared counter in Postgres for a limit that is already an order of
 * magnitude below what the services allow.
 */
async function takeSlot(): Promise<void> {
  for (;;) {
    const now = Date.now()
    recent = recent.filter((t) => now - t < WINDOW_MS)
    if (recent.length < MAX_REQUESTS_PER_MINUTE) {
      recent.push(now)
      return
    }
    const oldest = recent[0]!
    await sleep(WINDOW_MS - (now - oldest) + 50)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function userAgent(): string {
  const contact = process.env.TRENDS_CONTACT ?? process.env.APP_URL ?? 'unset-contact'
  return `Claimfold/0.1 (topic discovery; ${contact})`
}

export class SourceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'SourceError'
  }
}

export interface FetchOptions {
  /** Retries for 429 and 5xx only. */
  retries?: number
  accept?: string
  timeoutMs?: number
}

/**
 * Follow redirects ourselves, checking where each one goes.
 *
 * `redirect: 'manual'` rather than `'follow'`, because `'follow'` resolves the
 * chain inside undici and only tells us where it ended up — by which point the
 * request to an internal address has already been made. Checking each `Location`
 * before acting on it is the whole point.
 *
 * Redirects do not take a fresh rate-limit slot: a 301 from Wikimedia to its
 * canonical host is one logical request, and charging it twice would halve an
 * already deliberately low budget.
 */
async function followRedirects(
  start: URL,
  accept: string,
  signal: AbortSignal,
): Promise<Response> {
  let url = start

  for (let hop = 0; ; hop += 1) {
    assertAllowedHost(url)

    const response = await fetch(url, {
      headers: { 'user-agent': userAgent(), accept },
      signal,
      redirect: 'manual',
    })

    const location = response.status >= 300 && response.status < 400
      ? response.headers.get('location')
      : null
    if (!location) return response

    if (hop >= MAX_REDIRECTS) {
      await discard(response)
      throw new SourceError(`${start.host} redirected more than ${MAX_REDIRECTS} times`)
    }

    // The 3xx body is never read, and under undici an unconsumed body keeps the
    // socket checked out until GC. Over a long run with redirects that
    // accumulates into connections nobody is using.
    await discard(response)

    // Resolved against the current URL so a relative `Location` — which is
    // legal and common — cannot be mistaken for an absolute one.
    url = new URL(location, url)
  }
}

/** Release a response whose body we will never read. */
async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined)
}

/**
 * Largest body we will read into memory.
 *
 * The module's own header explains that these upstreams are not trusted with
 * where they redirect us; the same reasoning applies to how much they send.
 * `response.text()` with no cap means an upstream answering with a
 * multi-gigabyte body — or a compromised one deciding to — takes the worker
 * down with an OOM. Wikimedia's largest realistic response here is a few
 * hundred kilobytes.
 */
const MAX_BODY_BYTES = 8 * 1024 * 1024

/**
 * Read a body, refusing one that is too large.
 *
 * `content-length` is checked first because it is free when present, but it is
 * advisory — a chunked response has none, and a hostile one can lie — so the
 * stream is counted as it arrives regardless.
 */
async function readCappedText(response: Response, host: string): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    await discard(response)
    throw new SourceError(`${host} offered ${declared} bytes, over the ${MAX_BODY_BYTES} cap`)
  }

  if (!response.body) return response.text()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new SourceError(`${host} sent more than ${MAX_BODY_BYTES} bytes`)
    }
    chunks.push(value)
  }

  return new TextDecoder().decode(await new Blob(chunks as BlobPart[]).arrayBuffer())
}

/** Rate-limited, identified, backing-off fetch returning the body as text. */
export async function fetchText(url: URL, options: FetchOptions = {}): Promise<string> {
  const { retries = 2, accept = 'application/json', timeoutMs = 15_000 } = options

  let attempt = 0
  for (;;) {
    await takeSlot()

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await followRedirects(url, accept, controller.signal)

      // `return await`, not `return` — this is what keeps the abort timer
      // covering the body read rather than only the headers.
      if (response.ok) return await readCappedText(response, url.host)

      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt >= retries) {
        await discard(response)
        throw new SourceError(
          `${url.host} answered ${response.status}`,
          response.status,
        )
      }

      // Retrying: the error body is never read, so release the socket rather
      // than leaving it checked out until GC.
      await discard(response)
    } catch (error) {
      if (error instanceof SourceError) throw error
      // Network failure or timeout. Retryable on the same budget as a 5xx.
      if (attempt >= retries) {
        throw new SourceError(`${url.host} did not answer: ${(error as Error).message}`)
      }
    } finally {
      clearTimeout(timer)
    }

    attempt += 1
    // Doubling from 1s: with the default `retries = 2` that is 1s then 2s. The
    // comment here used to promise "1s, 2s, 4s", which only happens if a caller
    // raises `retries` — worth saying accurately, because the backoff schedule
    // is how long a stalled discovery run appears to hang.
    await sleep(1000 * 2 ** (attempt - 1))
  }
}

export async function fetchJson<T>(url: URL, options?: FetchOptions): Promise<T> {
  const body = await fetchText(url, options)
  try {
    /*
      Still a cast, and deliberately still unvalidated — but now it is honest
      about what it is.

      Every caller reaches for named fields on the result, so a schema here
      would mean four schemas for four upstreams whose shapes we do not control
      and cannot keep in step. The actual defence is downstream: every consumer
      in this package reads optional fields and copes with them missing
      (`summariseHistory` handles an empty `months`, `articleFacts` handles an
      absent `extlinks`). What this cast must NOT do is claim more than JSON.parse
      knows, which `as T` alone quietly did.
    */
    // Annotated `unknown` first, so the cast is a deliberate widening of a
    // known-unknown rather than `any` slipping through unchallenged.
    const parsed: unknown = JSON.parse(body)
    return parsed as T
  } catch {
    throw new SourceError(`${url.host} returned a body that is not JSON`)
  }
}

/** Test seam: forget the rate-limit window. */
export function resetRateLimiter(): void {
  recent = []
}

export { MAX_REQUESTS_PER_MINUTE }
