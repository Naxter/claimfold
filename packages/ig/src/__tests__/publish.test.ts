import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { classifyGraphError, ContainerExpiredError, PublishLimitError } from '../errors.ts'
import { buildAuthorizeUrl } from '../oauth.ts'
import { publishCarousel } from '../publish.ts'

/**
 * The Graph API is mocked, because the real one cannot be exercised in CI and
 * because the failures that matter here happen at scheduled publish time with
 * nobody watching. What is asserted is the SEQUENCE and the CLASSIFICATION —
 * the two things that decide whether a failed post retries sensibly, retries
 * forever, or silently never goes out.
 */

interface MockCall {
  url: string
  method: string
  body: Record<string, string>
}

let calls: MockCall[] = []
let handlers: Array<(call: MockCall) => unknown> = []

function mockFetch() {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const body: Record<string, string> = {}
    if (init?.body instanceof URLSearchParams) {
      for (const [k, v] of init.body.entries()) body[k] = v
    }

    const call: MockCall = { url, method: init?.method ?? 'GET', body }
    calls.push(call)

    for (const handler of handlers) {
      const result = handler(call)
      if (result !== undefined) {
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
    }

    return new Response(JSON.stringify({}), { status: 200 })
  })
}

beforeEach(() => {
  calls = []
  handlers = []
  vi.stubGlobal('fetch', mockFetch())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const SLIDES = [
  { imageUrl: 'https://example.com/1.jpg', altText: 'one' },
  { imageUrl: 'https://example.com/2.jpg', altText: 'two' },
  { imageUrl: 'https://example.com/3.jpg', altText: 'three' },
]

/**
 * Deterministic container ids so the publish step can be checked against the
 * parent specifically — `creation_id` must be the CAROUSEL container, never a
 * child, and an off-by-one there would publish a single image instead of the
 * carousel.
 */
function happyPath() {
  let childIndex = 0
  handlers.push((call) => {
    if (call.url.includes('content_publishing_limit')) {
      return { data: [{ quota_usage: 3, config: { quota_total: 25 } }] }
    }
    if (call.url.includes('media_publish')) return { id: 'media_999' }
    if (call.method === 'POST' && call.url.includes('/media')) {
      if (call.body['media_type'] === 'CAROUSEL') return { id: 'parent_container' }
      return { id: `child_${childIndex++}` }
    }
    if (call.url.includes('permalink')) return { permalink: 'https://instagram.com/p/abc' }
    // Container status poll.
    return { status_code: 'FINISHED' }
  })
}

describe('publishCarousel', () => {
  it('checks quota before creating any container', async () => {
    happyPath()
    await publishCarousel({
      igUserId: '123',
      accessToken: 'tok',
      slides: SLIDES,
      caption: 'hello',
    })

    // Quota first, always. Creating containers and only then discovering the
    // account is out of quota wastes them — they cannot be reused later.
    expect(calls[0]!.url).toContain('content_publishing_limit')
  })

  it('creates one child container per slide, then the parent, then publishes', async () => {
    happyPath()
    await publishCarousel({
      igUserId: '123',
      accessToken: 'tok',
      slides: SLIDES,
      caption: 'hello',
    })

    const children = calls.filter((c) => c.body['is_carousel_item'] === 'true')
    expect(children).toHaveLength(3)
    // Children must carry no caption — the API rejects it there.
    for (const child of children) expect(child.body['caption']).toBeUndefined()

    const parent = calls.find((c) => c.body['media_type'] === 'CAROUSEL')
    expect(parent).toBeDefined()
    expect(parent!.body['children']).toBe('child_0,child_1,child_2')
    expect(parent!.body['caption']).toBe('hello')

    // Publishes the PARENT, not a child. Publishing a child id would post one
    // image and quietly drop the rest of the carousel.
    const publish = calls.find((c) => c.url.includes('media_publish'))
    expect(publish!.body['creation_id']).toBe('parent_container')
  })

  it('passes alt text through on each child', async () => {
    happyPath()
    await publishCarousel({
      igUserId: '123',
      accessToken: 'tok',
      slides: SLIDES,
      caption: 'hello',
    })

    const children = calls.filter((c) => c.body['is_carousel_item'] === 'true')
    expect(children.map((c) => c.body['alt_text'])).toEqual(['one', 'two', 'three'])
  })

  it('refuses to publish when quota is exhausted, without creating containers', async () => {
    handlers.push((call) =>
      call.url.includes('content_publishing_limit')
        ? { data: [{ quota_usage: 25, config: { quota_total: 25 } }] }
        : undefined,
    )

    await expect(
      publishCarousel({ igUserId: '1', accessToken: 't', slides: SLIDES, caption: 'x' }),
    ).rejects.toBeInstanceOf(PublishLimitError)

    expect(calls.filter((c) => c.body['is_carousel_item'])).toHaveLength(0)
  })

  it('rejects carousels outside 2–10 slides before any network call', async () => {
    const one = [SLIDES[0]!]
    await expect(
      publishCarousel({ igUserId: '1', accessToken: 't', slides: one, caption: 'x' }),
    ).rejects.toThrow(/2–10/)

    const eleven = Array.from({ length: 11 }, (_, i) => ({
      imageUrl: `https://example.com/${i}.jpg`,
    }))
    await expect(
      publishCarousel({ igUserId: '1', accessToken: 't', slides: eleven, caption: 'x' }),
    ).rejects.toThrow(/2–10/)

    expect(calls).toHaveLength(0)
  })

  it('rejects non-HTTPS image URLs', async () => {
    await expect(
      publishCarousel({
        igUserId: '1',
        accessToken: 't',
        slides: [
          { imageUrl: 'http://example.com/1.jpg' },
          { imageUrl: 'https://example.com/2.jpg' },
        ],
        caption: 'x',
      }),
    ).rejects.toThrow(/HTTPS/)
  })

  it('surfaces an expired container as non-retryable', async () => {
    handlers.push((call) => {
      if (call.url.includes('content_publishing_limit')) {
        return { data: [{ quota_usage: 0, config: { quota_total: 25 } }] }
      }
      if (call.method === 'POST') return { id: 'container_x' }
      return { status_code: 'EXPIRED' }
    })

    // Retrying with the same container ids can never succeed — the caller has
    // to rebuild. Marking this retryable would loop until max attempts.
    await expect(
      publishCarousel({ igUserId: '1', accessToken: 't', slides: SLIDES, caption: 'x' }),
    ).rejects.toBeInstanceOf(ContainerExpiredError)
  })

  it('still reports success when the first comment fails', async () => {
    happyPath()
    handlers.unshift((call) => {
      if (call.url.includes('/comments')) throw new Error('comment failed')
      return undefined
    })

    const result = await publishCarousel({
      igUserId: '1',
      accessToken: 't',
      slides: SLIDES,
      caption: 'x',
      firstComment: 'sources below',
    })

    // The carousel is live. Failing the job here would retry the whole publish
    // and produce a duplicate post.
    expect(result.mediaId).toBe('media_999')
  })
})

describe('error classification', () => {
  it('treats the publish rate limit as retryable', () => {
    const error = classifyGraphError({ code: 9, error_subcode: 2207042, message: 'limit' }, 400)
    expect(error).toBeInstanceOf(PublishLimitError)
    expect(error.retryable).toBe(true)
  })

  it('treats an expired token as requiring reconnection, not retry', () => {
    const error = classifyGraphError({ code: 190, error_subcode: 463, message: 'expired' }, 400)
    expect(error.requiresReconnect).toBe(true)
    expect(error.retryable).toBe(false)
  })

  it('treats 5xx as retryable', () => {
    expect(classifyGraphError({ message: 'oops' }, 503).retryable).toBe(true)
  })

  it('treats a malformed request as non-retryable', () => {
    // Retrying an identical bad request forever is worse than failing loudly.
    expect(classifyGraphError({ code: 100, message: 'bad param' }, 400).retryable).toBe(false)
  })
})

describe('OAuth', () => {
  it('requires a state parameter', () => {
    const config = { appId: 'a', appSecret: 's', redirectUri: 'https://x/cb' }
    // Without state the callback is open to login-CSRF: an attacker can walk a
    // victim through attaching the ATTACKER's Instagram account to the
    // victim's workspace.
    expect(() => buildAuthorizeUrl(config, '')).toThrow(/state/i)
  })

  it('requests only the scopes the product uses', () => {
    const url = buildAuthorizeUrl(
      { appId: 'a', appSecret: 's', redirectUri: 'https://x/cb' },
      'nonce',
    )
    const scope = new URL(url).searchParams.get('scope') ?? ''
    expect(scope).toContain('instagram_business_content_publish')
    // Never requested: messaging and comment management widen the blast radius
    // of a stolen token for no benefit.
    expect(scope).not.toContain('manage_messages')
    expect(scope).not.toContain('manage_comments')
  })
})
