import { describe, expect, it } from 'vitest'

import { TEXT_CONTRAST_FLOOR, checkAccent, contrastRatio, isHexColour, parseHex } from '../contrast.ts'
import { THEMES } from '../themes.ts'

/**
 * The save-time legibility check.
 *
 * The four built-in themes were designed against WCAG AA and the dashboard's own
 * palette is held to it by a test that reads the stylesheet. Neither of those can
 * see a colour someone types into a form, so this is the check that runs instead
 * — and the first thing it has to get right is not rejecting the themes it is
 * meant to protect.
 */

describe('parsing', () => {
  it('takes both hex forms, with or without the hash', () => {
    expect(parseHex('#B4472B')).toEqual([180, 71, 43])
    expect(parseHex('B4472B')).toEqual([180, 71, 43])
    // Shorthand expands by doubling each digit, so #f00 is pure red.
    expect(parseHex('#f00')).toEqual([255, 0, 0])
  })

  it('refuses anything that is not a hex colour', () => {
    // These matter because the value ends up interpolated into a stylesheet in
    // the rendered document.
    for (const value of ['red', 'rgb(1,2,3)', '#12345', '', 'B4472B;color:red', '#GGHHII']) {
      expect(isHexColour(value), value).toBe(false)
    }
  })
})

describe('the ratio', () => {
  it('is 21:1 for black on white, whichever way round', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
  })

  it('is 1:1 for a colour against itself', () => {
    expect(contrastRatio('#B4472B', '#B4472B')).toBeCloseTo(1, 5)
  })

  it('is null rather than a wrong number when a colour will not parse', () => {
    expect(contrastRatio('chartreuse', '#ffffff')).toBeNull()
  })
})

describe('every built-in theme passes its own check', () => {
  /*
    If this fails, either a theme changed or the floor did — and one of the two
    is wrong. Paper is the tight one at roughly 4.7:1 against its background, so
    it is the canary.
  */
  it.each(THEMES.map((theme) => [theme.id, theme] as const))(
    '%s keeps its own accent',
    (_id, theme) => {
      expect(checkAccent(theme, theme.colors.accent)).toEqual({ ok: true })
    },
  )
})

describe('checking a replacement accent', () => {
  const paper = THEMES.find((theme) => theme.id === 'paper')!

  it('accepts a colour dark enough for Paper’s light background', () => {
    expect(checkAccent(paper, '#7A2D18').ok).toBe(true)
  })

  it('names the background when the accent is too pale to read on it', () => {
    const verdict = checkAccent(paper, '#F5E7D8')
    expect(verdict.ok).toBe(false)
    if (verdict.ok || verdict.reason !== 'too_low') throw new Error('expected a low ratio')

    expect(verdict.against).toBe('background')
    expect(verdict.ratio).toBeLessThan(TEXT_CONTRAST_FLOOR)
  })

  /**
   * The failure mode worth having a test for.
   *
   * A very dark accent reads beautifully against Paper's cream background and
   * then swallows `onAccent` — which is the text colour inside the split
   * layout's tinted panel. One slide in the carousel comes out unreadable while
   * the rest look right, so it survives a glance at slide one.
   */
  it('catches an accent that ruins the tinted panel instead of the background', () => {
    const verdict = checkAccent(paper, '#FBF6EE')
    expect(verdict.ok).toBe(false)
  })

  it('reports an unusable value as unparseable rather than as low contrast', () => {
    expect(checkAccent(paper, 'not-a-colour')).toEqual({ ok: false, reason: 'unparseable' })
  })
})
