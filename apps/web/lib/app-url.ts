/**
 * `APP_URL`, validated rather than trusted.
 *
 * This one string decides three things that fail far away from their cause:
 * the Better Auth `baseURL`, the Instagram OAuth redirect origin, and — through
 * `isSecureOrigin` — whether the session cookie carries `Secure`.
 *
 * Two silent failures happened here and both are guarded below.
 *
 * The first was cosmetic-looking and was not: `.env.example` shipped
 * `http://localhost:3000` while every other default in the repo was 3100. The
 * README says to copy that file verbatim, so a first-time self-hoster
 * registered a redirect URI Meta would never match, and the setup wizard showed
 * them one port while the connect route built the other. Nothing complained
 * until the OAuth round trip failed.
 *
 * The second is worse. `Secure` was inferred from the scheme of this URL alone,
 * so an operator behind a TLS-terminating proxy who left the shipped `http://`
 * default got session cookies without `Secure` — and nothing said so. A cookie
 * that silently stops being protected is not a configuration mistake you find
 * by reading the dashboard.
 *
 * Its own module, and every function takes `env`, so all of this is testable
 * without importing better-auth — which builds a database adapter at module
 * scope. Same reasoning as ./auth-secret.ts.
 */

/** Default matching `.env.example` and the compose `PORT` default. */
export const DEFAULT_APP_URL = 'http://localhost:3100'

type Env = Record<string, string | undefined>

/**
 * `next build` imports every route module to collect page data, and the
 * production image deliberately keeps `.env` out of the layer — so a hard throw
 * would break the documented `docker compose up`. No request is served during a
 * build. Same escape hatch as `readAuthSecret`.
 */
function isBuildPhase(env: Env): boolean {
  return env['NEXT_PHASE'] === 'phase-production-build'
}

export function readAppUrl(env: Env = process.env): string {
  return env['APP_URL'] ?? DEFAULT_APP_URL
}

/**
 * Whether the browser reaches this install over TLS.
 *
 * `TRUST_PROXY=true` covers the common self-host shape — Caddy or nginx
 * terminating TLS and forwarding plain http to the container. In that setup the
 * origin genuinely is https even though `APP_URL` may not say so, and the
 * cookie must still be marked `Secure`.
 */
export function isSecureOrigin(env: Env = process.env): boolean {
  if (env['TRUST_PROXY'] === 'true') return true
  return readAppUrl(env).startsWith('https://')
}

/**
 * Fails loudly on the two misconfigurations that otherwise surface as a broken
 * OAuth round trip or an unprotected cookie.
 *
 * Called once at module scope from ./auth.ts, so a bad install refuses to serve
 * instead of serving something subtly wrong.
 */
export function assertAppUrl(env: Env = process.env): void {
  if (isBuildPhase(env)) return

  const raw = readAppUrl(env)

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`APP_URL is not a valid URL: ${JSON.stringify(raw)}`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`APP_URL must be http or https, got ${url.protocol.replace(':', '')}`)
  }

  /*
    ── Asset origin agreement ──────────────────────────────────────────────

    Deliberately NOT a check of `PORT`. Inside the container the app listens on
    3000 while the operator publishes 3100, and those are supposed to differ —
    a naive comparison fails every Docker install.

    What is checkable is that the two public URLs agree with each other, which
    is the drift that actually shipped: `.env.example` carried :3000 for both
    while compose published :3100. A warning rather than a refusal, because
    serving assets from a separate origin is a legitimate (if unsupported)
    choice, and refusing to boot over it would be worse than saying so.
  */
  const assetUrl = env['PUBLIC_ASSET_URL']
  if (assetUrl) {
    try {
      if (new URL(assetUrl).origin !== url.origin) {
        console.warn(
          `[config] PUBLIC_ASSET_URL (${new URL(assetUrl).origin}) is on a different ` +
            `origin from APP_URL (${url.origin}). Instagram fetches slide images from ` +
            `the former and OAuth redirects go to the latter; if that is not deliberate, ` +
            `one of them is wrong.`,
        )
      }
    } catch {
      throw new Error(`PUBLIC_ASSET_URL is not a valid URL: ${JSON.stringify(assetUrl)}`)
    }
  }

  // ── Cookie protection ─────────────────────────────────────────────────────
  const isProduction = env['NODE_ENV'] === 'production'
  const insecureAllowed = env['ALLOW_INSECURE_APP_URL'] === 'true'

  if (isProduction && url.protocol === 'http:' && !isSecureOrigin(env) && !insecureAllowed) {
    throw new Error(
      `APP_URL is http:// in production, so session cookies would be sent without ` +
        `the Secure flag and any downgrade would leak them.\n` +
        `  • Terminating TLS at a proxy? Set TRUST_PROXY=true.\n` +
        `  • Serving TLS directly? Use an https:// APP_URL.\n` +
        `  • Genuinely on a trusted private network? Set ALLOW_INSECURE_APP_URL=true.`,
    )
  }
}
