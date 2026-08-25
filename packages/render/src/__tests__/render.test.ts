import { describe, expect, it } from 'vitest'

import { MAX_BYTES, assertPublishable, computeRenderHash } from '../render.ts'
import type { RenderSlideInput } from '../render.ts'

/**
 * Pure-function tests only — the browser round trip is exercised by
 * `npm run render:demo`, which is a visual check rather than an assertion.
 * What is worth asserting automatically is the cache key (a wrong hash means
 * either stale slides get published or nothing ever caches) and the publish
 * guard (a wrong guard means a scheduled post fails at 18:00 unattended).
 */

const base: RenderSlideInput = {
  templateId: 'editorial',
  themeId: 'paper',
  role: 'body',
  content: { headline: 'A headline', body: 'Some body copy.' },
  page: 2,
  total: 8,
}

describe('computeRenderHash', () => {
  it('is stable across calls', () => {
    expect(computeRenderHash(base)).toBe(computeRenderHash(base))
  })

  it('ignores key order in content', () => {
    // Content arrives as jsonb from Postgres and as an object literal from the
    // editor. If key order changed the hash, the cache would never hit and
    // every edit would re-render the whole carousel.
    const reordered: RenderSlideInput = {
      ...base,
      content: { body: 'Some body copy.', headline: 'A headline' },
    }
    expect(computeRenderHash(reordered)).toBe(computeRenderHash(base))
  })

  it('changes when any visible property changes', () => {
    const original = computeRenderHash(base)

    const mutations: Array<Partial<RenderSlideInput>> = [
      { templateId: 'list' },
      { themeId: 'ink' },
      { role: 'hook' },
      { content: { headline: 'Different', body: 'Some body copy.' } },
      { page: 3 },
      { total: 9 },
      { watermark: '@handle' },
      // The theme is recorded by id, so without this in the key an accent
      // override would leave every slide holding its old cached image and the
      // colour someone chose would never reach a published carousel.
      { accentColor: '#7A2D18' },
      // A different picture is a different asset id, which lives in `content`.
      { content: { headline: 'A headline', body: 'Some body copy.', imageAssetId: 'abc' } },
    ]

    for (const mutation of mutations) {
      expect(
        computeRenderHash({ ...base, ...mutation }),
        `mutation ${JSON.stringify(mutation)} did not change the hash`,
      ).not.toBe(original)
    }
  })

  it('distinguishes nested content differences', () => {
    const a = computeRenderHash({ ...base, content: { items: ['one', 'two'] } })
    const b = computeRenderHash({ ...base, content: { items: ['one', 'three'] } })
    expect(a).not.toBe(b)
  })

  it('ignores the resolved picture, which is derived from the id already in content', () => {
    // `imageSrc` is half a megabyte of base64. Hashing it would make the cache
    // key expensive to compute and tell us nothing the asset id does not.
    expect(computeRenderHash({ ...base, imageSrc: 'data:image/jpeg;base64,AAAA' })).toBe(
      computeRenderHash(base),
    )
  })

  it('treats an empty string and a missing key as different, which is why edits are normalised', () => {
    /*
      Not a bug — a documented sharp edge. A form posts an empty string for every
      field somebody left blank, so `{headline:'x', body:''}` and `{headline:'x'}`
      describe the same slide and would each keep their own cached image forever.
      `normaliseSlideContent` in @claimfold/content is what stops that reaching
      here, and this asserts why it has to.
    */
    expect(computeRenderHash({ ...base, content: { headline: 'x', body: '' } })).not.toBe(
      computeRenderHash({ ...base, content: { headline: 'x' } }),
    )
  })
})

describe('assertPublishable', () => {
  it('accepts the canvas the templates produce', () => {
    expect(() => assertPublishable({ width: 1080, height: 1350, bytes: 200_000 })).not.toThrow()
  })

  it('rejects images over Instagram’s 8MB ceiling', () => {
    expect(() => assertPublishable({ width: 1080, height: 1350, bytes: MAX_BYTES + 1 })).toThrow(
      /8MB/,
    )
  })

  it('rejects images wider than the API accepts', () => {
    expect(() => assertPublishable({ width: 2000, height: 2500, bytes: 100 })).toThrow(/width/)
    expect(() => assertPublishable({ width: 100, height: 125, bytes: 100 })).toThrow(/width/)
  })

  it('rejects anything taller than 4:5', () => {
    // Portrait beyond 4:5 is the easy mistake — it looks better in a feed and
    // the API refuses it outright.
    expect(() => assertPublishable({ width: 1080, height: 1920, bytes: 100 })).toThrow(/aspect/)
  })

  it('rejects anything wider than 1.91:1', () => {
    expect(() => assertPublishable({ width: 1080, height: 400, bytes: 100 })).toThrow(/aspect/)
  })

  it('accepts square and landscape within range', () => {
    expect(() => assertPublishable({ width: 1080, height: 1080, bytes: 100 })).not.toThrow()
    expect(() => assertPublishable({ width: 1080, height: 600, bytes: 100 })).not.toThrow()
  })
})
