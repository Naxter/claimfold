import { NextResponse, type NextRequest } from 'next/server'

/**
 * Content Security Policy.
 *
 * `next.config.ts` already sets `nosniff`, `X-Frame-Options` and a referrer
 * policy, with a comment saying they make a mistake "non-exploitable rather
 * than merely unlikely". They do not. Those three headers stop MIME sniffing,
 * framing and referrer leakage; none of them stops a script from running. The
 * header that would actually contain an injection was the missing one — on a
 * dashboard whose whole job is rendering text a model wrote after reading
 * attacker-controllable web pages, plus links whose href came from the same
 * place.
 *
 * A CSP has to live in middleware rather than in `next.config.ts` because the
 * nonce has to be new on every request, and static header config is static.
 *
 * **Shape:** `'strict-dynamic'` with a per-request nonce. Next injects its own
 * bootstrap scripts and picks up the nonce from this header automatically;
 * `strict-dynamic` then lets those trusted scripts load the chunks they need
 * without an allowlist of paths that would rot. Host allowlists in `script-src`
 * are widely bypassable, which is why this does not use one.
 *
 * **`'unsafe-inline'` on `style-src`, deliberately.** React writes `style`
 * attributes for the slide previews, which are scaled with an inline transform
 * so the preview is pixel-identical to what gets published, and Tailwind
 * injects a `<style>` element in development. Style injection cannot execute
 * script; the trade is worth naming rather than hiding. Modern browsers ignore
 * `'unsafe-inline'` when a nonce is present for *scripts*, which is the half
 * that matters.
 *
 * **Development needs `'unsafe-eval'`.** Next's hot reload compiles with eval.
 * Shipping that to production would defeat most of the point, so it is added
 * only when `NODE_ENV` is not production — and that difference is exactly why
 * the policy is verified against a production build, not just against `dev`.
 */
function policy(nonce: string, isDev: boolean): string {
  const scriptSrc = [
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Fallbacks for browsers that understand neither, which then fall back to
    // the host list rather than to nothing.
    "'self'",
    'https:',
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(' ')

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // See above: inline styles are load-bearing for the slide previews.
    "style-src 'self' 'unsafe-inline'",
    // `data:` for inline SVG and the embedded fonts; `blob:` for rendered
    // previews. No remote images: slide art is generated locally and served
    // from this origin.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // The dashboard talks to its own origin only. Instagram is reached from
    // the server, never from the browser — if that ever changes, it changes
    // here first, visibly.
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    "form-action 'self'",
    // Complements X-Frame-Options, which older browsers use instead.
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    // A model-supplied link can only ever be http(s) — the review page already
    // allowlists the scheme, and this is the second lock on the same door.
    "worker-src 'self' blob:",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}

export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production'
  // `crypto` is the Web Crypto global in the edge runtime middleware runs in.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const headers = new Headers(request.headers)
  // Next reads this to stamp the nonce onto the scripts it injects itself.
  headers.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', policy(nonce, isDev))

  /*
    HSTS, but only when this install is actually served over TLS. Sending it
    from an http origin does nothing; sending it from a proxied https origin
    is what stops the next visit starting in plaintext. Two years with
    subdomains, which is the preload-eligible value — not preloaded here,
    because that is the operator's domain to commit, not ours.
  */
  if (request.nextUrl.protocol === 'https:') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains',
    )
  }

  // Nothing here uses a camera, a microphone or a location, so nothing here
  // should be able to start.
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  )

  return response
}

export const config = {
  /*
    Everything except Next's own static output and the image optimizer. Those
    are served from disk with no HTML in them, and running middleware on each
    one costs latency on every chunk for no security benefit.

    Prefetches are NOT excluded any more.

    They were, via a `missing:` clause on `next-router-prefetch` and
    `purpose: prefetch` — presumably to save the nonce generation on a request
    whose payload is RSC rather than HTML. The effect was the inverse of the
    intent: the three headers in next.config.ts still applied to those
    responses, while the CSP, HSTS and Permissions-Policy set here did not. So
    the responses that skipped the strict policy were exactly the ones nobody
    was looking at.

    The saving was a nonce and four `set` calls. Not worth a class of response
    that is served under a different policy from every other.
  */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
