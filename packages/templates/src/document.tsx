/** @jsxImportSource react */
import { renderToStaticMarkup } from 'react-dom/server'

import { fontFaceCss } from './fonts.ts'
import { autoFitScript } from './layout.tsx'
import { SlideView, type RenderSlideProps } from './templates.tsx'
import { CANVAS } from './themes.ts'

/**
 * Turns one slide into a complete, self-contained HTML document.
 *
 * Self-contained is the operative word: fonts are inlined, styles are inline,
 * and there is not a single external reference. The render browser therefore
 * makes zero network requests, which makes output deterministic and closes the
 * SSRF surface described in docs/decisions/0001-security-posture.md (T4).
 *
 * The same component tree also renders inside the dashboard for live preview,
 * so what a reviewer approves is what gets published — not an approximation.
 */

export interface SlideDocumentOptions extends RenderSlideProps {
  /** Draw the profile-grid crop boundary. Preview only. */
  showSafeZone?: boolean
  /**
   * BCP-47 language of the copy, e.g. 'de'.
   *
   * Load-bearing, not metadata: `hyphens: auto` selects its dictionary from
   * this. A German headline in a document marked `lang="en"` gets no
   * hyphenation, so long compounds either overflow or break in the wrong place.
   */
  lang?: string
}

const RESET = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:#000}
body{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{max-width:100%;display:block}
.slide{position:relative}
`.trim()

export function renderSlideDocument(options: SlideDocumentOptions): string {
  const markup = renderToStaticMarkup(<SlideView {...options} />)

  return `<!doctype html>
<html lang="${escapeAttribute(options.lang ?? 'en')}" data-role="${escapeAttribute(options.role)}">
<head>
<meta charset="utf-8">
<title>slide</title>
<style>
${fontFaceCss()}
${RESET}
</style>
</head>
<body>
${markup}
<script>${autoFitScript()}</script>
</body>
</html>`
}

/**
 * Renders every slide of a post into one scrollable document.
 *
 * Used by the dashboard preview and by `capture` for build-log screenshots.
 * Never used for publishing — each published slide is screenshotted from its
 * own document so one slide's layout cannot influence another's.
 */
export function renderContactSheet(
  slides: RenderSlideProps[],
  options: { showSafeZone?: boolean; gap?: number } = {},
): string {
  const gap = options.gap ?? 32
  const body = slides
    .map((slide) =>
      renderToStaticMarkup(<SlideView {...slide} showSafeZone={options.showSafeZone} />),
    )
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>contact sheet</title>
<style>
${fontFaceCss()}
${RESET}
body{display:flex;flex-wrap:wrap;gap:${gap}px;padding:${gap}px;background:#101010}
.slide{flex:0 0 ${CANVAS.width}px}
</style>
</head>
<body>
${body}
<script>${autoFitScript()}</script>
</body>
</html>`
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
