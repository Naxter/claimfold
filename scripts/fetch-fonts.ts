import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Refreshes the OFL fonts the themes use in packages/templates/assets/fonts.
 *
 * Run to pick up a new face: `npm run fonts:fetch`
 *
 * The fonts ARE committed — all six faces, about 350KB total. They are not
 * fetched at render time either: rendering must be deterministic and offline.
 * So this script is a refresh, not a setup step, and it is deliberately
 * non-fatal when a download fails but the face is already on disk. It used to
 * exit(1) on any failure, which meant a Google Fonts outage, a proxy, or an
 * air-gapped build host failed the Docker build over an artefact already in
 * the tree.
 *
 * A face that is missing AND undownloadable is still fatal — that is the case
 * where rendering would silently fall back to system faces.
 *
 * Licensing: every family here is under the SIL Open Font License, which
 * permits commercial use, embedding and redistribution with no attribution
 * required in the published artwork.
 */

const OUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages',
  'templates',
  'assets',
  'fonts',
)

/**
 * Google Fonts serves woff2 only when it believes the client supports it, so
 * the request needs a modern browser UA. Without this you get ttf and the
 * inlined payload roughly triples.
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

interface Family {
  /** Name as it appears in CSS and in the theme definitions. */
  name: string
  /** Google Fonts CSS2 spec, variable where the family offers one. */
  spec: string
  /** Weight range written into @font-face. */
  weightRange: string
}

const FAMILIES: Family[] = [
  { name: 'Newsreader', spec: 'Newsreader:opsz,wght@6..72,300..700', weightRange: '300 700' },
  { name: 'Instrument Sans', spec: 'Instrument+Sans:wght@400..700', weightRange: '400 700' },
  {
    name: 'Bricolage Grotesque',
    spec: 'Bricolage+Grotesque:opsz,wght@12..96,400..800',
    weightRange: '400 800',
  },
  { name: 'Archivo', spec: 'Archivo:wght@400..900', weightRange: '400 900' },
  { name: 'Space Grotesk', spec: 'Space+Grotesk:wght@400..700', weightRange: '400 700' },
  { name: 'Space Mono', spec: 'Space+Mono:wght@400', weightRange: '400' },
]

async function fetchCss(spec: string): Promise<string> {
  const url = `https://fonts.googleapis.com/css2?family=${spec}&display=block`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`CSS request failed (${res.status}) for ${spec}`)
  return res.text()
}

/**
 * Pick the latin subset. Google's CSS emits one @font-face per subset, each
 * preceded by a `/* latin *\/` style comment. Grabbing the last latin block
 * (rather than the first URL in the file) avoids accidentally shipping
 * cyrillic or vietnamese, which would double the payload for no benefit.
 */
function extractLatinWoff2(css: string): string | null {
  const blocks = css.split('@font-face').slice(1)
  let fallback: string | null = null

  for (const block of blocks) {
    const url = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1]
    if (!url) continue
    fallback ??= url

    // `unicode-range` starting at U+0000 is the plain latin subset.
    if (/unicode-range:\s*U\+0000/i.test(block)) return url
  }

  return fallback
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  /** Failed to download and no committed copy to fall back on. Fatal. */
  const missing: string[] = []
  /** Failed to download but the committed copy is present. Not fatal. */
  const kept: string[] = []

  for (const family of FAMILIES) {
    const filename = `${family.name}__${family.weightRange}__normal.woff2`
    const target = resolve(OUT_DIR, filename)

    process.stdout.write(`${family.name.padEnd(22)} `)
    try {
      const css = await fetchCss(family.spec)
      const url = extractLatinWoff2(css)
      if (!url) throw new Error('no woff2 url found in CSS response')

      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) throw new Error(`font download failed (${res.status})`)

      const bytes = Buffer.from(await res.arrayBuffer())
      writeFileSync(target, bytes)

      console.log(`ok  ${(bytes.length / 1024).toFixed(0)}KB`)
    } catch (error) {
      const message = (error as Error).message
      if (existsSync(target)) {
        kept.push(family.name)
        console.log(`kept committed copy  (${message})`)
      } else {
        missing.push(family.name)
        console.log(`MISSING  ${message}`)
      }
    }
  }

  if (kept.length > 0) {
    console.log(
      `\n${kept.length} face(s) could not be refreshed and kept the committed copy. ` +
        `Rendering is unaffected.`,
    )
  }

  if (missing.length > 0) {
    console.error(
      `\n${missing.length} face(s) are absent and could not be downloaded: ${missing.join(', ')}. ` +
        `Templates fall back to system faces, so rendering still works — but published slides ` +
        `will not match the intended design. Re-run when online.`,
    )
    process.exit(1)
  }

  console.log(`\nFonts up to date in ${OUT_DIR}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
