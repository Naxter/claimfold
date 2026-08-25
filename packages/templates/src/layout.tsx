/** @jsxImportSource react */
// The pragma is deliberate: these components are compiled by four different
// toolchains (tsx, vitest, Next.js, tsc), each resolving tsconfig from its own
// working directory. Pinning the JSX runtime here means none of them can pick
// the classic runtime and fail with "React is not defined".
import type { CSSProperties, ReactNode } from 'react'

import { fontStack } from './font-stack.ts'
import { CANVAS, TYPE, type Theme, type TypeScale } from './themes.ts'

/**
 * Layout primitives shared by every template.
 *
 * Two constraints shape all of this:
 *
 *  1. The canvas is exactly 1080×1350 and every slide in a carousel must match,
 *     because Instagram crops later slides to slide 1's aspect ratio.
 *  2. Copy length is not knowable in advance. A model writing German will
 *     produce compound nouns twice the width of the English equivalent, so
 *     nothing here may assume text fits. Hence AutoFit.
 */

export interface SlideProps {
  theme: Theme
  children: ReactNode
  /** Draw the profile-grid crop boundary. Preview only, never in a render. */
  showSafeZone?: boolean
  /** 1-based, for the page indicator. Hidden when total is 1. */
  page?: number
  total?: number
  /** Small persistent mark, usually the account handle. */
  watermark?: string
}

function textureStyle(theme: Theme): CSSProperties {
  switch (theme.texture) {
    case 'grain':
      return {
        // An inline SVG turbulence rather than an image file: no extra asset to
        // ship, no second request from the render browser.
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat',
      }
    case 'grid':
      return {
        backgroundImage: `linear-gradient(${theme.colors.rule} 1px, transparent 1px), linear-gradient(90deg, ${theme.colors.rule} 1px, transparent 1px)`,
        backgroundSize: '54px 54px',
        backgroundPosition: '-1px -1px',
        opacity: 1,
      }
    default:
      return {}
  }
}

export function Slide({
  theme,
  children,
  showSafeZone = false,
  page,
  total,
  watermark,
}: SlideProps) {
  return (
    <div
      className="slide"
      style={{
        position: 'relative',
        width: CANVAS.width,
        height: CANVAS.height,
        background: theme.colors.background,
        color: theme.colors.text,
        fontFamily: fontStack(theme.fonts.body),
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      {theme.texture && theme.texture !== 'none' ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            ...(theme.texture === 'grid' ? { opacity: 0.35 } : {}),
            ...textureStyle(theme),
          }}
        />
      ) : null}

      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: `${CANVAS.padding}px ${CANVAS.padding}px ${CANVAS.paddingBottom}px`,
          boxSizing: 'border-box',
          minHeight: 0,
        }}
      >
        {children}
      </div>

      {(watermark || (page && total && total > 1)) && (
        <div
          style={{
            position: 'absolute',
            left: CANVAS.padding,
            right: CANVAS.padding,
            bottom: 40,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: fontStack(theme.fonts.mono ?? theme.fonts.body),
            fontSize: 22,
            letterSpacing: '0.08em',
            color: theme.colors.muted,
          }}
        >
          <span>{watermark ?? ''}</span>
          {page && total && total > 1 ? (
            <span>
              {page} / {total}
            </span>
          ) : null}
        </div>
      )}

      {showSafeZone ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: CANVAS.gridSafeInsetX,
            right: CANVAS.gridSafeInsetX,
            border: '2px dashed rgba(255,0,80,0.55)',
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  )
}

export interface AutoFitProps {
  scale: TypeScale
  theme: Theme
  children: ReactNode
  /** Use the display face instead of the body face. */
  display?: boolean
  color?: string
  align?: 'left' | 'center'
  /** Cap growth below the scale's natural maximum. */
  maxSize?: number
  style?: CSSProperties
}

/**
 * Text that shrinks until it fits its box.
 *
 * The element is emitted with min/max bounds as data attributes; the script in
 * `autoFitScript()` binary-searches the font size in the render browser before
 * the screenshot is taken. Doing the measurement in the browser is what makes
 * this correct rather than approximate — character-count heuristics fall apart
 * the moment the copy contains a long word, a different language, or a number.
 */
export function AutoFit({
  scale,
  theme,
  children,
  display = false,
  color,
  align = 'left',
  maxSize,
  style,
}: AutoFitProps) {
  const spec = TYPE[scale]
  const max = Math.min(spec.max, maxSize ?? spec.max)
  const isDisplay = scale === 'hook' || scale === 'heading' || scale === 'figure'

  return (
    <div
      data-autofit=""
      data-autofit-min={spec.min}
      data-autofit-max={max}
      style={{
        fontFamily: fontStack(display ? theme.fonts.display : theme.fonts.body),
        fontSize: max,
        fontWeight: spec.weight,
        lineHeight: spec.lineHeight,
        letterSpacing: spec.tracking,
        color: color ?? theme.colors.text,
        textAlign: align,
        // `balance` evens out ragged line lengths on headlines; `pretty`
        // prevents orphans in body copy. Both are free in Chromium and are a
        // large part of why these read as typeset rather than dumped.
        textWrap: isDisplay ? 'balance' : 'pretty',

        /**
         * Display text must NOT break inside a word.
         *
         * With `break-word`, an over-long word shatters mid-syllable
         * ("Hexenverbrennu / ngen") instead of overflowing — so auto-fit never
         * measures an overflow and never shrinks, and the ugly break ships.
         * Leaving it `normal` makes the word overflow, which auto-fit sees and
         * fixes by reducing the size. German compounds make this routine, not
         * an edge case.
         *
         * Body copy keeps `break-word` as a last-resort guard: a stray URL or
         * long identifier should wrap rather than push the layout out.
         */
        overflowWrap: isDisplay ? 'normal' : 'break-word',
        // Only effective when the document's `lang` matches the copy —
        // see renderSlideDocument.
        hyphens: 'auto',
        minHeight: 0,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Small uppercase label above a headline. */
export function Kicker({ theme, children }: { theme: Theme; children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: fontStack(theme.fonts.mono ?? theme.fonts.body),
        fontSize: TYPE.kicker.max,
        fontWeight: TYPE.kicker.weight,
        letterSpacing: TYPE.kicker.tracking,
        textTransform: 'uppercase',
        color: theme.colors.accent,
        marginBottom: 24,
      }}
    >
      {children}
    </div>
  )
}

export function Rule({ theme, width = 120 }: { theme: Theme; width?: number }) {
  return (
    <div
      style={{
        width,
        height: 6,
        background: theme.colors.accent,
        borderRadius: 3,
        margin: '32px 0',
        flexShrink: 0,
      }}
    />
  )
}

export function Spacer() {
  return <div style={{ flex: 1, minHeight: 0 }} />
}

/**
 * The shrink-to-fit pass, injected into the rendered document.
 *
 * Binary search rather than a decrementing loop: a headline may need to drop
 * 40px, and stepping one pixel at a time across ten slides is the difference
 * between a fast render and a slow one. Twelve iterations resolves any range
 * we use to sub-pixel precision.
 *
 * Exposed as a string because it executes inside the page, not in Node.
 */
export function autoFitScript(): string {
  return `
(function () {
  function fits(el) {
    // 1px of tolerance: sub-pixel line-height rounding otherwise reports a
    // perfectly fitting block as overflowing, and every headline comes out
    // one step smaller than it should be.
    return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
  }

  function fitAll() {
    var nodes = document.querySelectorAll('[data-autofit]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var min = parseFloat(el.getAttribute('data-autofit-min')) || 16;
      var max = parseFloat(el.getAttribute('data-autofit-max')) || 64;

      el.style.fontSize = max + 'px';
      if (fits(el)) continue;

      var lo = min, hi = max, best = min;
      for (var step = 0; step < 12; step++) {
        var mid = (lo + hi) / 2;
        el.style.fontSize = mid + 'px';
        if (fits(el)) { best = mid; lo = mid; } else { hi = mid; }
      }
      el.style.fontSize = best + 'px';
    }

    document.documentElement.setAttribute('data-autofit-done', 'true');
  }

  // MUST wait for webfonts. Measuring against fallback metrics picks a size for
  // the wrong typeface, and the real font then overflows or leaves a gap — a
  // failure that only shows up on the slides with the longest headlines, which
  // are exactly the ones that needed fitting.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitAll).catch(fitAll);
  } else {
    fitAll();
  }
})();
`.trim()
}
