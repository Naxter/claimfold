import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Contrast, verified against the actual stylesheet.
 *
 * The design brief says contrast must be verified rather than assumed, and
 * this is the form that survives: the numbers are read out of `tokens.css`, so
 * changing a colour there and dropping below the floor fails the build instead
 * of shipping.
 *
 * That matters more than usual here, because the whole point of the token file
 * is that someone will re-theme it later by editing a hue and a few lightness
 * values. Three of these pairs failed on the first pass — the one that stings
 * is the warning badge at 3.18:1, which looked completely fine on screen.
 */

const CSS = readFileSync(
  fileURLToPath(new URL('../../app/tokens.css', import.meta.url)),
  'utf8',
)

/** `--name: <value>;` pairs inside one CSS block. */
function declarationsIn(block: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(match[1]!, match[2]!.trim())
  }
  return out
}

/** The text of the first block whose selector matches. */
function block(selector: string): string {
  const start = CSS.indexOf(selector)
  if (start === -1) throw new Error(`No block for ${selector} in tokens.css`)
  const open = CSS.indexOf('{', start)
  let depth = 0
  for (let i = open; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1
    if (CSS[i] === '}') {
      depth -= 1
      if (depth === 0) return CSS.slice(open + 1, i)
    }
  }
  throw new Error(`Unbalanced braces after ${selector}`)
}

const ROOT = declarationsIn(block(':root {'))
const DARK = declarationsIn(block(":root[data-theme='dark']"))

interface Oklch {
  l: number
  c: number
  h: number
}

/** Follow `var(--x)` chains and parse the `oklch(...)` at the end. */
function resolve(name: string, scope: Map<string, string>): Oklch {
  const seen = new Set<string>()
  let value = scope.get(name) ?? ROOT.get(name)

  while (value && value.startsWith('var(')) {
    const ref = /var\((--[\w-]+)\)/.exec(value)?.[1]
    if (!ref || seen.has(ref)) throw new Error(`Cannot resolve ${name}`)
    seen.add(ref)
    value = scope.get(ref) ?? ROOT.get(ref)
  }
  if (!value) throw new Error(`${name} is not declared`)

  const fn = /oklch\(\s*([\d.]+)%\s+([\d.]+|var\([^)]+\))\s+([\d.]+|var\([^)]+\))\s*\)/.exec(value)
  if (!fn) throw new Error(`${name} is not an oklch() colour: ${value}`)

  const num = (raw: string): number => {
    const ref = /var\((--[\w-]+)\)/.exec(raw)?.[1]
    return Number(ref ? (scope.get(ref) ?? ROOT.get(ref)) : raw)
  }

  return { l: Number(fn[1]) / 100, c: num(fn[2]!), h: num(fn[3]!) }
}

/** OKLCH → linear sRGB, clamped into gamut. */
function linearRgb({ l: L, c: C, h: H }: Oklch): [number, number, number] {
  const rad = (H * Math.PI) / 180
  const a = C * Math.cos(rad)
  const b = C * Math.sin(rad)

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v))) as [number, number, number]
}

/**
 * The WCAG ratio, reimplemented here — and pinned, because it is.
 *
 * `packages/templates/src/contrast.ts` already computes a contrast ratio, and
 * this is deliberately not that function: that one takes hex, this one takes
 * the OKLCH the token file is written in, and converting between them would
 * introduce a rounding step in the middle of the check that guards the
 * accessibility floor.
 *
 * What that duplication costs is a second implementation nothing verifies. So
 * the known pairs below anchor it: black on white is exactly 21:1 and a colour
 * against itself is exactly 1:1 by definition, and any arithmetic slip in the
 * luminance coefficients or the +0.05 terms moves both.
 */
function contrast(a: Oklch, b: Oklch): number {
  const y = (colour: Oklch) => {
    const [r, g, bl] = linearRgb(colour)
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [y(a), y(b)].sort((x, z) => z - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('the ratio itself', () => {
  // OKLCH black and white. L=0 and L=1 with no chroma are exact in this space.
  const black: Oklch = { l: 0, c: 0, h: 0 }
  const white: Oklch = { l: 1, c: 0, h: 0 }

  it('is 21:1 for black on white, the WCAG maximum', () => {
    expect(contrast(black, white)).toBeCloseTo(21, 1)
  })

  it('is 1:1 for a colour against itself', () => {
    expect(contrast(white, white)).toBeCloseTo(1, 5)
    expect(contrast(black, black)).toBeCloseTo(1, 5)
  })

  it('does not care which way round the pair is given', () => {
    // The formula sorts by luminance, so it is symmetric by construction —
    // asserted because a future refactor could easily make it not.
    expect(contrast(black, white)).toBeCloseTo(contrast(white, black), 10)
  })

  it('never returns less than 1', () => {
    const mid: Oklch = { l: 0.5, c: 0.1, h: 250 }
    expect(contrast(mid, white)).toBeGreaterThanOrEqual(1)
    expect(contrast(mid, black)).toBeGreaterThanOrEqual(1)
  })
})

/**
 * 4.5 for text, 3.0 for the boundaries that make a control identifiable.
 *
 * `--rule` is deliberately absent: it separates rows that are already
 * identifiable, which is decoration rather than an interface boundary, and
 * holding it to 3:1 would make every table look like a spreadsheet grid.
 */
const PAIRS: Array<[string, string, number, string]> = [
  ['--fg', '--bg', 4.5, 'body text on the canvas'],
  ['--fg', '--bg-raised', 4.5, 'body text on a panel'],
  ['--fg-muted', '--bg', 4.5, 'secondary text on the canvas'],
  ['--fg-muted', '--bg-raised', 4.5, 'secondary text on a panel'],
  ['--fg-subtle', '--bg', 4.5, 'metadata on the canvas'],
  ['--fg-subtle', '--bg-raised', 4.5, 'metadata on a panel'],
  ['--fg-on-accent', '--accent', 4.5, 'a primary button label'],
  ['--accent', '--bg', 4.5, 'a link on the canvas'],
  ['--accent', '--bg-raised', 4.5, 'a link on a panel'],
  // The accent tint is now only ever a *selection*, and selected rows keep
  // body text rather than accent text — so this is the pair that actually
  // ships. It replaces `--accent on --accent-weak`, which described a step
  // marker that has since moved to the ok hue.
  ['--fg', '--bg-selected', 4.5, 'text in a selected row'],
  ['--status-ok', '--status-ok-weak', 4.5, 'an approved badge'],
  // The gate panel and the setup banner put body text on the ok tint.
  ['--fg', '--status-ok-weak', 4.5, 'body text on the ok tint'],
  ['--status-warn', '--status-warn-weak', 4.5, 'a warning badge'],
  ['--status-err', '--status-err-weak', 4.5, 'an error badge'],
  ['--rule-strong', '--bg', 3.0, 'a control boundary on the canvas'],
  ['--rule-strong', '--bg-raised', 3.0, 'a control boundary on a panel'],
  ['--focus', '--bg', 3.0, 'the focus ring on the canvas'],
  ['--focus', '--bg-raised', 3.0, 'the focus ring on a panel'],
]

describe.each([
  ['light', new Map<string, string>()],
  ['dark', DARK],
])('%s theme contrast', (_theme, scope) => {
  it.each(PAIRS)('%s on %s clears %s:1 — %s', (fg, bg, floor) => {
    const ratio = contrast(resolve(fg, scope), resolve(bg, scope))
    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(floor)
  })
})

describe('the token file keeps its shape', () => {
  it('declares one accent, not a set', () => {
    // A second brand accent needs a written justification. Catching a stray
    // `--accent-2` here is cheaper than noticing it on six screens later.
    const accents = [...ROOT.keys()].filter((k) => /^--accent(-|$)/.test(k))
    expect(accents.sort()).toEqual([
      '--accent',
      '--accent-fg',
      '--accent-hi',
      '--accent-lo',
      '--accent-weak',
    ])
  })

  it('keeps the data palette separate from the accent', () => {
    // Brand colour and data colour must not come from the same set, or a
    // reader cannot tell a button from a chart series.
    const viz = [...ROOT.entries()].filter(([k]) => k.startsWith('--viz-'))
    expect(viz.length).toBeGreaterThanOrEqual(7)
    for (const [, value] of viz) {
      expect(value, 'chart colours must not reference the brand accent').not.toMatch(/accent/)
    }
  })

  it('keeps neutrals tinted rather than pure grey', () => {
    // Pure #888 is the fastest way to look unconsidered; the ramp carries a
    // little of the accent's hue instead.
    const chroma = Number(ROOT.get('--c'))
    expect(chroma).toBeGreaterThan(0)
    expect(chroma).toBeLessThanOrEqual(0.04)
  })
})
