import { describe, expect, it } from 'vitest'

import { normaliseSlideContent } from '@claimfold/content'
import { computeRenderHash, type RenderSlideInput } from '@claimfold/render'
import { contentFieldsFor } from '@claimfold/templates'

import { isEditable, parseHashtags, readSlideContentForm } from '../slide-editing.ts'

/**
 * The seam between the form, the stored slide and the render cache.
 *
 * This lives in the dashboard rather than in a package because it is the only
 * place that depends on all three: @claimfold/templates decides which fields
 * exist, @claimfold/content validates and normalises them, and
 * @claimfold/render turns the result into a cache key. Each of those is tested
 * on its own; what is only testable here is that they agree.
 */

function form(entries: Array<[string, string]>): FormData {
  const data = new FormData()
  for (const [key, value] of entries) data.append(key, value)
  return data
}

const EDITORIAL = contentFieldsFor('evidence', 'editorial')
const SPLIT = contentFieldsFor('evidence', 'split')
const SOURCES = contentFieldsFor('sources', 'editorial')

describe('reading a slide form', () => {
  it('takes the fields the layout renders', () => {
    const result = readSlideContentForm(
      form([
        ['kicker', 'A kicker'],
        ['headline', 'A headline'],
        ['body', 'Some body copy.'],
        ['footnote', 'A footnote'],
      ]),
      EDITORIAL,
    )

    expect(result).toEqual({
      ok: true,
      content: {
        kicker: 'A kicker',
        headline: 'A headline',
        body: 'Some body copy.',
        footnote: 'A footnote',
      },
    })
  })

  it('ignores a field the layout does not render, however it got there', () => {
    /*
      The editorial layout never draws `figure`, so a hand-made POST carrying one
      must not plant it. A stored key no template reads is invisible in every
      preview and still part of the render hash — a slide that re-rasterises on
      every publish to produce a byte-identical JPEG, forever, with nothing
      anywhere looking wrong.
    */
    const result = readSlideContentForm(
      form([
        ['headline', 'A headline'],
        ['figure', '42%'],
      ]),
      EDITORIAL,
    )

    expect(result).toEqual({ ok: true, content: { headline: 'A headline' } })
  })

  it('drops blank fields rather than storing empty strings', () => {
    const result = readSlideContentForm(
      form([
        ['headline', 'Kept'],
        ['body', '   '],
        ['footnote', ''],
      ]),
      EDITORIAL,
    )

    expect(result).toEqual({ ok: true, content: { headline: 'Kept' } })
  })

  it('collects the split layout’s two panels as items', () => {
    const result = readSlideContentForm(
      form([
        ['headline', 'Belief and correction'],
        ['items', 'What people think'],
        ['items', 'What the evidence shows'],
      ]),
      SPLIT,
    )

    expect(result).toEqual({
      ok: true,
      content: {
        headline: 'Belief and correction',
        items: ['What people think', 'What the evidence shows'],
      },
    })
  })

  it('drops the trailing blank line the list editor always posts', () => {
    // The list editor renders one empty input after the last line so there is
    // somewhere to type. It arrives on every submit and must not become a line.
    const result = readSlideContentForm(
      form([
        ['headline', 'Sources'],
        ['items', 'Nature, 2024'],
        ['items', 'BMJ, 2023'],
        ['items', ''],
      ]),
      SOURCES,
    )

    expect(result.ok && result.content.items).toEqual(['Nature, 2024', 'BMJ, 2023'])
  })

  it('refuses a value that is over the cap instead of truncating it', () => {
    // Truncating would save something the person did not write.
    const result = readSlideContentForm(form([['body', 'x'.repeat(2_001)]]), EDITORIAL)
    expect(result.ok).toBe(false)
  })
})

describe('what the form produces is stable for the render cache', () => {
  const base: RenderSlideInput = {
    templateId: 'editorial',
    themeId: 'paper',
    role: 'evidence',
    content: {},
    page: 2,
    total: 6,
  }

  it('hashes a blank field the same as a field that was never there', () => {
    // The whole reason normalisation exists. Without it, saving a slide with an
    // empty footnote would give it a cache key nothing else can ever match.
    const typed = readSlideContentForm(
      form([
        ['headline', 'A headline'],
        ['body', 'Body copy.'],
        ['footnote', ''],
      ]),
      EDITORIAL,
    )
    if (!typed.ok) throw new Error('expected the form to parse')

    expect(computeRenderHash({ ...base, content: typed.content })).toBe(
      computeRenderHash({
        ...base,
        content: normaliseSlideContent({ headline: 'A headline', body: 'Body copy.' }),
      }),
    )
  })

  it('hashes the same copy the same however the fields were ordered in the post', () => {
    const first = readSlideContentForm(
      form([
        ['headline', 'A headline'],
        ['body', 'Body copy.'],
      ]),
      EDITORIAL,
    )
    const second = readSlideContentForm(
      form([
        ['body', 'Body copy.'],
        ['headline', 'A headline'],
      ]),
      EDITORIAL,
    )
    if (!first.ok || !second.ok) throw new Error('expected both forms to parse')

    expect(computeRenderHash({ ...base, content: first.content })).toBe(
      computeRenderHash({ ...base, content: second.content }),
    )
  })

  it('changes the hash when a word changes, so the slide re-renders', () => {
    const before = readSlideContentForm(form([['headline', 'Before']]), EDITORIAL)
    const after = readSlideContentForm(form([['headline', 'After']]), EDITORIAL)
    if (!before.ok || !after.ok) throw new Error('expected both forms to parse')

    expect(computeRenderHash({ ...base, content: before.content })).not.toBe(
      computeRenderHash({ ...base, content: after.content }),
    )
  })
})

describe('which posts may be edited', () => {
  it('allows the states a person actually reviews from', () => {
    for (const status of ['review', 'rejected', 'failed', 'drafted', 'checked', 'approved']) {
      expect(isEditable(status), status).toBe(true)
    }
  })

  it('refuses anything on its way out or already gone', () => {
    /*
      `scheduled` is in here because the publish worker may be seconds from
      claiming the post, and changing the copy underneath it would mean the
      reviewer approved one carousel and Instagram received another.
    */
    for (const status of ['scheduled', 'publishing', 'published']) {
      expect(isEditable(status), status).toBe(false)
    }
  })
})

describe('hashtags as people type them', () => {
  it('takes spaces, commas and stray hashes', () => {
    // The publish step adds the `#` back itself, so storing one would give
    // `##tag` on every post.
    expect(parseHashtags('#one, two  #three\nfour')).toEqual(['one', 'two', 'three', 'four'])
  })

  it('removes duplicates and keeps the first spelling', () => {
    expect(parseHashtags('one #one ONE')).toEqual(['one', 'ONE'])
  })

  it('stops at Instagram’s ceiling', () => {
    const many = Array.from({ length: 40 }, (_, i) => `tag${i}`).join(' ')
    expect(parseHashtags(many)).toHaveLength(30)
  })

  it('gives nothing back for nothing typed', () => {
    expect(parseHashtags('   ')).toEqual([])
  })
})
