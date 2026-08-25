import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { REQUIRED_FAMILIES } from './font-stack.ts'

/**
 * Self-hosted fonts, inlined into the rendered document as base64 data URIs.
 *
 * NODE ONLY. This module reads files off disk, so it is reachable at
 * `@claimfold/templates/fonts` rather than from the package root — the same
 * arrangement as `@claimfold/templates/document`, for the same reason. The
 * dashboard renders slide previews in the browser, and a client component that
 * pulled `node:fs` in through the package root failed the build outright.
 * `fontStack`, which the templates need on both sides, lives in `font-stack.ts`.
 *
 * Why inline rather than link:
 *  - The render browser makes no network request, so rendering is deterministic
 *    and works offline. A CDN hiccup cannot silently swap a headline to a
 *    fallback face halfway through a carousel.
 *  - It removes an outbound request from inside the render browser, which is
 *    the surface T4 in docs/decisions/0001-security-posture.md exists to close.
 *
 * Cost is roughly 400KB of HTML per render. For a local browser that is free.
 *
 * All faces are OFL-licensed, which permits commercial use with no attribution
 * in the published artwork. Run `npm run fonts:fetch` to populate assets/fonts.
 */

const here = dirname(fileURLToPath(import.meta.url))
const FONT_DIR = resolve(here, '..', 'assets', 'fonts')

interface FontFile {
  family: string
  file: string
  weightRange: string
  style: 'normal' | 'italic'
}

/**
 * Font files are named `<Family>__<weightRange>__<style>.woff2`, e.g.
 * `Instrument Sans__400 700__normal.woff2`. Encoding the metadata in the
 * filename keeps the download script and the renderer from needing a manifest
 * that could drift out of sync with what is actually on disk.
 */
function parseFontFile(file: string): FontFile | null {
  if (!file.endsWith('.woff2')) return null
  const stem = file.slice(0, -'.woff2'.length)
  const parts = stem.split('__')
  if (parts.length !== 3) return null

  const [family, weightRange, style] = parts as [string, string, string]
  if (style !== 'normal' && style !== 'italic') return null

  return { family, file, weightRange, style }
}

let cachedCss: string | null = null

/** `@font-face` blocks for every font present on disk. Computed once per process. */
export function fontFaceCss(): string {
  if (cachedCss !== null) return cachedCss

  if (!existsSync(FONT_DIR)) {
    cachedCss = ''
    return cachedCss
  }

  const blocks: string[] = []
  for (const file of readdirSync(FONT_DIR).sort()) {
    const parsed = parseFontFile(file)
    if (!parsed) continue

    const data = readFileSync(join(FONT_DIR, file)).toString('base64')
    blocks.push(
      `@font-face{` +
        `font-family:"${parsed.family}";` +
        `font-style:${parsed.style};` +
        `font-weight:${parsed.weightRange};` +
        `font-display:block;` +
        `src:url(data:font/woff2;base64,${data}) format("woff2");` +
        `}`,
    )
  }

  cachedCss = blocks.join('\n')
  return cachedCss
}

/** Families actually available on disk. Used by the doctor command and tests. */
export function availableFamilies(): string[] {
  if (!existsSync(FONT_DIR)) return []
  const families = new Set<string>()
  for (const file of readdirSync(FONT_DIR)) {
    const parsed = parseFontFile(file)
    if (parsed) families.add(parsed.family)
  }
  return [...families].sort()
}

/** Families a theme wants but that are not installed. Empty means all good. */
export function missingFamilies(): string[] {
  const have = new Set(availableFamilies())
  return REQUIRED_FAMILIES.filter((f) => !have.has(f))
}

export { FONT_DIR }
export { REQUIRED_FAMILIES, fontStack } from './font-stack.ts'
