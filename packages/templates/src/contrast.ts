import type { Theme } from './themes.ts'

/**
 * Legibility, checked rather than assumed.
 *
 * The four built-in themes were designed so every foreground/background pair
 * clears WCAG AA, and `apps/web/lib/__tests__/contrast.test.ts` holds the
 * dashboard's own palette to the same bar by reading it out of the stylesheet.
 * A build-time test cannot do that for a colour someone types into a form, so
 * the same check has to exist at save time — which is what this module is for.
 *
 * It does not share code with that test on purpose: the dashboard's tokens are
 * `oklch()` and convert straight to linear RGB, while slide themes are hex and
 * need the sRGB gamma expansion below. Same ratio, different colour space, and
 * pretending otherwise would mean one of the two being subtly wrong.
 */

/** `#rgb` or `#rrggbb` → 0–255 channels. Null for anything else. */
export function parseHex(value: string): [number, number, number] | null {
  const hex = value.trim().replace(/^#/, '')

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const [r, g, b] = [...hex].map((ch) => parseInt(ch + ch, 16))
    return [r!, g!, b!]
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ]
  }
  return null
}

/** True for a value safe to interpolate into a stylesheet as a colour. */
export function isHexColour(value: string): boolean {
  return parseHex(value) !== null
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((channel) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]

  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/** WCAG 2.1 contrast ratio, 1–21. Null if either colour is unparseable. */
export function contrastRatio(a: string, b: string): number | null {
  const [first, second] = [parseHex(a), parseHex(b)]
  if (!first || !second) return null

  const [hi, lo] = [relativeLuminance(first), relativeLuminance(second)].sort((x, y) => y - x) as [
    number,
    number,
  ]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * AA for normal text.
 *
 * Not the 3:1 large-text floor, even though accent copy is set at 22px and up
 * on the canvas. The canvas is 1080px wide and gets looked at inside a feed
 * roughly 400px across, so a 26px kicker lands near 10px on the glass — well
 * inside "normal text" once it reaches an actual eye. All four built-in themes
 * clear this bar; Paper sits closest at 4.69:1, which is a useful reminder that
 * the margin is real but not generous.
 */
export const TEXT_CONTRAST_FLOOR = 4.5

export type AccentCheck =
  | { ok: true }
  | { ok: false; reason: 'unparseable' }
  | {
      ok: false
      reason: 'too_low'
      /** Which of the theme's colours it failed against. */
      against: 'background' | 'onAccent'
      ratio: number
      floor: number
    }

/**
 * Whether a replacement accent is usable with this theme.
 *
 * Two pairs, because the accent is used two ways. It is the colour of text on
 * the background — kickers, the source numbers, the big figure — and it is the
 * background of text in `onAccent` — the tinted panel in the split layout. An
 * accent that clears one and fails the other produces a carousel where half the
 * slides are fine and one is unreadable, which is the worst of the three
 * outcomes because it survives a quick look at slide one.
 *
 * The theme's own `onAccent` is held fixed rather than derived. Auto-picking
 * black or white would always pass and would quietly stop the result being the
 * theme the person chose.
 */
export function checkAccent(theme: Theme, accent: string): AccentCheck {
  if (!isHexColour(accent)) return { ok: false, reason: 'unparseable' }

  const onBackground = contrastRatio(accent, theme.colors.background)
  if (onBackground !== null && onBackground < TEXT_CONTRAST_FLOOR) {
    return {
      ok: false,
      reason: 'too_low',
      against: 'background',
      ratio: onBackground,
      floor: TEXT_CONTRAST_FLOOR,
    }
  }

  const withOnAccent = contrastRatio(accent, theme.colors.onAccent)
  if (withOnAccent !== null && withOnAccent < TEXT_CONTRAST_FLOOR) {
    return {
      ok: false,
      reason: 'too_low',
      against: 'onAccent',
      ratio: withOnAccent,
      floor: TEXT_CONTRAST_FLOOR,
    }
  }

  return { ok: true }
}
