import { describe, expect, it } from 'vitest'

import { normaliseSlideContent, slideContentEditSchema } from '../slide-edit.ts'

/**
 * The write side of hand-editing a slide.
 *
 * Both halves here exist because of the same defect, approached from two
 * directions: a key that no template reads still changes the render hash, so it
 * produces a slide that re-rasterises on every publish to make a byte-identical
 * JPEG, forever, with nothing anywhere looking wrong.
 */

describe('the edit schema', () => {
  it('accepts the keys the pipeline writes', () => {
    const parsed = slideContentEditSchema.safeParse({
      headline: 'A headline',
      body: 'Some body copy.',
      kicker: 'Kicker',
      footnote: 'Footnote',
      figure: '42%',
      figureLabel: 'of something',
      items: ['one', 'two'],
      imageAssetId: '3f0f3d1e-1b3a-4c5d-8e7f-0a1b2c3d4e5f',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an unknown key rather than dropping it', () => {
    // Stripping would be worse than failing: the value disappears silently, and
    // whoever typed it has no way to tell it did not save.
    const parsed = slideContentEditSchema.safeParse({ headline: 'ok', headlien: 'typo' })
    expect(parsed.success).toBe(false)
  })

  it('rejects an image reference that is not an id', () => {
    // A path or a URL here would be a slide naming a file on disk or a page on
    // the internet, and the renderer resolves ids against this org's own rows.
    expect(slideContentEditSchema.safeParse({ imageAssetId: '../../etc/passwd' }).success).toBe(
      false,
    )
    expect(slideContentEditSchema.safeParse({ imageAssetId: 'https://x/y.jpg' }).success).toBe(false)
  })

  it('caps the lengths', () => {
    expect(slideContentEditSchema.safeParse({ body: 'x'.repeat(2_001) }).success).toBe(false)
    expect(slideContentEditSchema.safeParse({ items: Array(13).fill('x') }).success).toBe(false)
  })
})

describe('normalising', () => {
  it('deletes keys a form left empty instead of storing empty strings', () => {
    // The load-bearing case. A form posts an empty string for every field
    // someone left blank, and `{headline:'x', body:''}` hashes differently from
    // `{headline:'x'}` while describing the same slide.
    expect(normaliseSlideContent({ headline: 'Kept', body: '', kicker: '   ' })).toEqual({
      headline: 'Kept',
    })
  })

  it('trims, so trailing whitespace does not become a new render', () => {
    expect(normaliseSlideContent({ headline: '  Kept  ' })).toEqual({ headline: 'Kept' })
  })

  it('drops blank lines from a list, and the list when nothing is left', () => {
    expect(normaliseSlideContent({ items: ['one', '', '  ', 'two'] })).toEqual({
      items: ['one', 'two'],
    })
    expect(normaliseSlideContent({ items: ['', ' '] })).toEqual({})
  })

  it('produces the same object whatever order the fields arrived in', () => {
    // Not about key order in the result — `computeRenderHash` sorts — but about
    // the same input never producing two different shapes.
    expect(normaliseSlideContent({ body: 'b', headline: 'h' })).toEqual(
      normaliseSlideContent({ headline: 'h', body: 'b' }),
    )
  })
})
