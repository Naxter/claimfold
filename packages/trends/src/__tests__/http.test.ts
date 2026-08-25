import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchJson, fetchText, resetRateLimiter, SourceError, userAgent } from '../http.ts'

/**
 * The containment boundary, tested.
 *
 * This module's own comments describe it as the package's SSRF defence — the
 * host allowlist, the https-only rule, the IP-literal refusal and the per-hop
 * redirect check — and it had no tests at all. Every one of those is a control
 * that fails open if it regresses: a discovery run would keep working and would
 * simply stop refusing.
 *
 * `fetch` is a global and `resetRateLimiter` is already exported as a seam, so
 * none of this needs the network.
 */

const realFetch = globalThis.fetch

/** A `Response` that records nothing and satisfies the body-drain path. */
function ok(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, ...init })
}

function redirectTo(location: string): Response {
  return new Response('', { status: 302, headers: { location } })
}

beforeEach(() => {
  resetRateLimiter()
})

afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

describe('host allowlist', () => {
  it('refuses a host that is not a known upstream, without making a request', async () => {
    const spy = vi.fn()
    globalThis.fetch = spy

    await expect(fetchText(new URL('https://evil.example/data'))).rejects.toThrow(SourceError)
    // The point of an allowlist is that the request never leaves.
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses http even for an allowed host', async () => {
    const spy = vi.fn()
    globalThis.fetch = spy

    await expect(fetchText(new URL('http://wikipedia.org/x'))).rejects.toThrow(/https-only/)
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses an IP literal', async () => {
    const spy = vi.fn()
    globalThis.fetch = spy

    // The shape that reaches a metadata endpoint or something on the LAN.
    await expect(fetchText(new URL('https://169.254.169.254/latest/meta-data/'))).rejects.toThrow(
      SourceError,
    )
    expect(spy).not.toHaveBeenCalled()
  })

  it('accepts a subdomain of an allowed host', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok('{"ok":true}'))

    await expect(fetchJson(new URL('https://en.wikipedia.org/api'))).resolves.toEqual({ ok: true })
  })

  it('does not treat a lookalike suffix as allowed', async () => {
    const spy = vi.fn()
    globalThis.fetch = spy

    // `notwikipedia.org` ends with `wikipedia.org` as a string but is a
    // different registrable domain. A naive `endsWith` check would pass it.
    await expect(fetchText(new URL('https://notwikipedia.org/x'))).rejects.toThrow(SourceError)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('redirects', () => {
  it('re-checks the allowlist on every hop', async () => {
    globalThis.fetch = vi
      .fn()
      // An allowed host redirecting somewhere it should not be able to send us.
      .mockResolvedValueOnce(redirectTo('https://evil.example/steal'))

    await expect(fetchText(new URL('https://wikipedia.org/start'))).rejects.toThrow(SourceError)
  })

  it('follows an allowed redirect and returns the destination body', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(redirectTo('https://wikidata.org/final'))
      .mockResolvedValueOnce(ok('arrived'))

    await expect(fetchText(new URL('https://wikipedia.org/start'))).resolves.toBe('arrived')
  })

  it('gives up after too many hops rather than looping', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(redirectTo('https://wikipedia.org/again'))

    await expect(fetchText(new URL('https://wikipedia.org/start'))).rejects.toThrow(/redirected/)
  })

  it('resolves a relative Location against the current URL', async () => {
    const calls: string[] = []
    globalThis.fetch = vi.fn().mockImplementation((url: URL) => {
      calls.push(url.toString())
      return Promise.resolve(calls.length === 1 ? redirectTo('/moved') : ok('done'))
    })

    await expect(fetchText(new URL('https://wikipedia.org/a/b'))).resolves.toBe('done')
    expect(calls[1]).toBe('https://wikipedia.org/moved')
  })
})

describe('retries', () => {
  it('retries a 5xx within the budget and returns the eventual body', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(ok('recovered'))

    await expect(
      // `retries: 1` with no real backoff wait would still sleep 1s; the value
      // is small enough to keep the suite fast.
      fetchText(new URL('https://wikipedia.org/x'), { retries: 1 }),
    ).resolves.toBe('recovered')
  })

  it('does not retry a 404', async () => {
    const spy = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    globalThis.fetch = spy

    await expect(fetchText(new URL('https://wikipedia.org/x'))).rejects.toThrow(/404/)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('carries the status on the error so callers can classify it', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }))

    await expect(fetchText(new URL('https://wikipedia.org/x'))).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('body handling', () => {
  it('refuses a body that declares itself over the cap', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('small', {
        status: 200,
        headers: { 'content-length': String(64 * 1024 * 1024) },
      }),
    )

    await expect(fetchText(new URL('https://wikipedia.org/x'))).rejects.toThrow(/cap/)
  })

  it('refuses a body that exceeds the cap while streaming, despite a truthful-looking header', async () => {
    // No content-length at all — the chunked case a hostile upstream would use.
    const chunk = new Uint8Array(1024 * 1024)
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(chunk)
      },
    })

    globalThis.fetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))

    await expect(fetchText(new URL('https://wikipedia.org/x'))).rejects.toThrow(/bytes/)
  })

  it('rejects a non-JSON body as a source error rather than a parse crash', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok('<html>nope</html>'))

    await expect(fetchJson(new URL('https://wikipedia.org/x'))).rejects.toThrow(/not JSON/)
  })
})

describe('identification', () => {
  it('names the product and carries a contact', () => {
    // Wikimedia's etiquette asks for a way to reach the operator before they
    // rate-limit. A UA that does not identify the install is the thing that
    // gets a self-hoster blocked.
    expect(userAgent()).toMatch(/^Claimfold\//)
    expect(userAgent()).toContain('(')
  })
})
