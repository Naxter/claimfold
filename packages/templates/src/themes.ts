/**
 * Design tokens.
 *
 * Slides live or die on the first 400ms of a thumbnail, so these are chosen,
 * not defaulted. Two rules behind every value here:
 *
 *  1. No generic-AI tells. No Inter, no Roboto, no system-ui, no purple
 *     gradient on white. Those read as machine-made before a word is read,
 *     and the whole point of this product is content that does not.
 *  2. Contrast that survives a phone at arm's length in daylight. Every
 *     foreground/background pair below clears WCAG AA for large text; the
 *     body pairs clear AA for normal text.
 *
 * Every font is OFL-licensed and self-hosted — no CDN at render time, which
 * makes rendering deterministic, offline-capable, and free of a third-party
 * request from inside the render browser.
 */

export interface ThemeFonts {
  /** Headlines. Carries the personality. */
  display: string
  /** Body copy. Must stay legible at 34–44px on a 1080px canvas. */
  body: string
  /** Small caps, numbers, labels. */
  mono?: string
}

export interface Theme {
  id: string
  name: string
  /** One line on when to reach for it. Shown in the niche editor. */
  useWhen: string
  colors: {
    background: string
    /** Cards, quote blocks, list rows. */
    surface: string
    text: string
    /** Secondary text: kickers, footnotes, source lines. */
    muted: string
    accent: string
    /** Text placed on top of `accent`. */
    onAccent: string
    rule: string
  }
  fonts: ThemeFonts
  /** Subtle full-bleed texture. Kept optional — most posts are better without. */
  texture?: 'none' | 'grain' | 'grid'
  /** Display headings in sentence case vs upper. */
  headingCase: 'sentence' | 'upper'
}

export const THEMES: Theme[] = [
  {
    id: 'paper',
    name: 'Paper',
    useWhen:
      'Knowledge, history, explanatory writing. Reads as considered and edited rather than posted.',
    colors: {
      background: '#F2EDE4',
      surface: '#E7DFD1',
      text: '#191512',
      muted: '#6B6157',
      accent: '#B4472B',
      onAccent: '#FDF9F3',
      rule: '#CFC4B2',
    },
    fonts: { display: 'Newsreader', body: 'Instrument Sans', mono: 'Space Mono' },
    texture: 'grain',
    headingCase: 'sentence',
  },
  {
    id: 'ink',
    name: 'Ink',
    useWhen:
      'Science, technology, anything where a dark field makes a single figure or diagram sing.',
    colors: {
      background: '#0F1216',
      surface: '#1A1F26',
      text: '#E9E7E2',
      muted: '#9AA3AD',
      accent: '#5CC8E8',
      onAccent: '#08131A',
      rule: '#2A313A',
    },
    fonts: { display: 'Bricolage Grotesque', body: 'Instrument Sans', mono: 'Space Mono' },
    texture: 'none',
    headingCase: 'sentence',
  },
  {
    id: 'bold',
    name: 'Bold',
    useWhen:
      'Practical and instructional posts that need to stop a fast scroll. Loud on purpose.',
    colors: {
      background: '#FFD230',
      surface: '#F5C31A',
      text: '#15120B',
      muted: '#4A421F',
      accent: '#15120B',
      onAccent: '#FFD230',
      rule: '#D9AC12',
    },
    fonts: { display: 'Archivo', body: 'Archivo', mono: 'Space Mono' },
    texture: 'none',
    headingCase: 'upper',
  },
  {
    id: 'slate',
    name: 'Slate',
    useWhen: 'Calm, technical, comparison-heavy content. Quieter than Ink, still dark.',
    colors: {
      background: '#1D2A31',
      surface: '#26353E',
      text: '#E4EDF1',
      muted: '#93A5AF',
      accent: '#7FD1AE',
      onAccent: '#10201A',
      rule: '#37474F',
    },
    fonts: { display: 'Space Grotesk', body: 'Instrument Sans', mono: 'Space Mono' },
    texture: 'grid',
    headingCase: 'sentence',
  },
]

export const DEFAULT_THEME_ID = 'paper'

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)!
}

/**
 * A theme with a different accent.
 *
 * One colour, not a palette. The accent is what carries a channel's identity
 * across a feed — it is the rule, the kicker, the position badge, the tinted
 * panel — while the background, the text and the type pairing are what make a
 * theme coherent. Letting someone replace the accent keeps a recognisable
 * channel; letting them replace everything mostly produces worse slides, which
 * is why that is a separate argument and not a bigger form.
 *
 * Null or empty means "leave the theme alone", so the pipeline's existing rows
 * need no migration. Validate with `checkAccent` before calling this — nothing
 * here checks legibility, because a renderer that silently corrected a colour
 * would hide the mistake instead of refusing it.
 */
export function applyAccent(theme: Theme, accent: string | null | undefined): Theme {
  if (!accent) return theme
  return { ...theme, colors: { ...theme.colors, accent } }
}

/**
 * Canvas geometry.
 *
 * 1080×1350 is 4:5 — the tallest ratio Instagram accepts, so it occupies the
 * most vertical space in a feed. Every slide in a carousel MUST use it: the
 * API crops every later slide to slide 1's aspect ratio, so a mismatch silently
 * mangles the rest of the post.
 */
export const CANVAS = {
  width: 1080,
  height: 1350,

  /**
   * The profile grid displays posts at 3:4, cropping a 4:5 image on the sides.
   * 1350 × (3/4) = 1012.5px of visible width, so ~34px is lost from each edge.
   * Padding below is far larger than that, but the preview draws this boundary
   * so nobody has to remember the arithmetic.
   */
  gridSafeInsetX: 34,

  padding: 88,
  /** Extra bottom room so text never collides with the swipe affordance. */
  paddingBottom: 104,
} as const

/**
 * Type scale, in px against the 1080px canvas.
 *
 * Deliberately coarse. Fine-grained scales invite fiddling, and at this size
 * the only decisions that matter are "hook", "heading", "body", "small".
 */
export const TYPE = {
  hook: { min: 62, max: 108, lineHeight: 1.06, weight: 700, tracking: '-0.03em' },
  heading: { min: 44, max: 76, lineHeight: 1.1, weight: 650, tracking: '-0.02em' },
  body: { min: 30, max: 44, lineHeight: 1.4, weight: 400, tracking: '0' },
  kicker: { min: 22, max: 26, lineHeight: 1.2, weight: 600, tracking: '0.12em' },
  small: { min: 20, max: 26, lineHeight: 1.35, weight: 400, tracking: '0' },
  figure: { min: 120, max: 260, lineHeight: 0.92, weight: 700, tracking: '-0.04em' },
} as const

export type TypeScale = keyof typeof TYPE
