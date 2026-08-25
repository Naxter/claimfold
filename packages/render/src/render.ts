import { createHash } from 'node:crypto'

import type { SlideContent } from '@claimfold/db'
import { CANVAS, applyAccent, getTheme } from '@claimfold/templates'
// Separate entry point: pulls in react-dom/server, which must not leak into
// consumers that only render components (the dashboard). See templates/index.ts.
import { renderSlideDocument } from '@claimfold/templates/document'
import sharp from 'sharp'

import { acquirePage, releasePage } from './browser.ts'

/**
 * Slide → JPEG.
 *
 * Every constraint enforced here comes from Instagram's Content Publishing API
 * and is a hard failure at publish time, not a warning. Catching them at render
 * means a reviewer never approves a post that cannot physically be published.
 */

/** JPEG only — the API rejects PNG outright. */
export const OUTPUT_MIME = 'image/jpeg'
/** Hard API ceiling per image. */
export const MAX_BYTES = 8 * 1024 * 1024
/** The API downscales anything wider; 1080 is the sweet spot for 4:5. */
export const MAX_WIDTH = 1440
export const MIN_WIDTH = 320

export interface RenderSlideInput {
  templateId: string
  themeId: string
  role: string
  content: SlideContent
  /** 1-based position in the carousel. */
  page: number
  total: number
  watermark?: string
  /**
   * BCP-47 language of the copy. Drives hyphenation — a German headline in a
   * document declared as English gets none, and long compounds overflow.
   */
  lang?: string
  /** Replaces the theme's accent. Validated by the caller, hashed here. */
  accentColor?: string
  /**
   * The picture for `content.imageAssetId`, as a `data:` URI.
   *
   * Resolved by the caller because it needs the database and the disk, and
   * inlined rather than linked because the render browser makes no network
   * requests at all — the property that closes the SSRF surface described in
   * docs/decisions/0001-security-posture.md. Roughly the same cost as the fonts
   * already embedded in every document.
   *
   * Deliberately NOT part of the render hash: it is derived from
   * `content.imageAssetId`, which is hashed, and asset ids are minted per
   * content hash — so a different picture is already a different hash. Hashing
   * half a megabyte of base64 per slide would only make the cache key slow.
   */
  imageSrc?: string
}

export interface RenderedSlide {
  jpeg: Buffer
  width: number
  height: number
  bytes: number
  sha256: string
  /** Milliseconds spent in the browser, for the worker's timing logs. */
  durationMs: number
}

/**
 * Stable identity for a rendered slide.
 *
 * Anything that changes the pixels must change this hash, and nothing else may.
 * It is what lets an editor fix a typo on slide 4 without re-rasterising the
 * other nine — which matters because on a small server, re-rendering a whole
 * carousel on every keystroke is the difference between a responsive editor
 * and an unusable one.
 */
/**
 * Bumped whenever anything in @claimfold/templates changes the pixels —
 * a template, a theme value, the type scale, a font.
 *
 * The hash records template and theme by ID, not by content, so without this
 * a design update would leave every cached slide with an unchanged hash. The
 * worker would skip re-rendering and publish stale images: a live upgrade
 * hazard for software sold with updates.
 */
export const RENDER_VERSION = 1

export function computeRenderHash(input: RenderSlideInput): string {
  const canonical = JSON.stringify({
    v: RENDER_VERSION,
    t: input.templateId,
    th: input.themeId,
    r: input.role,
    // Object key order is not guaranteed across writers, so sort it — otherwise
    // semantically identical content produces two different hashes and the
    // cache never hits.
    c: sortKeys(input.content),
    p: input.page,
    n: input.total,
    w: input.watermark ?? '',
    // Part of the key: language changes hyphenation, which changes the pixels.
    l: input.lang ?? '',
    // The theme is recorded by id, so an accent override would otherwise be
    // invisible here — every slide would keep its old cached image and the
    // colour someone chose would never reach a published carousel.
    a: input.accentColor ?? '',
  })
  return createHash('sha256').update(canonical).digest('hex')
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        // Codepoint order, not localeCompare: the latter is ICU- and
        // locale-dependent, so web and worker containers with different LANG
        // settings would order keys differently and produce different hashes
        // for identical content — a permanent cache miss.
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    )
  }
  return value
}

export async function renderSlide(input: RenderSlideInput): Promise<RenderedSlide> {
  const started = Date.now()
  const theme = applyAccent(getTheme(input.themeId), input.accentColor)

  const html = renderSlideDocument({
    templateId: input.templateId,
    theme,
    role: input.role,
    content: input.content,
    page: input.page,
    total: input.total,
    watermark: input.watermark,
    lang: input.lang,
    imageSrc: input.imageSrc,
  })

  const page = await acquirePage()
  let png: Buffer
  try {
    // setContent, never goto: the document is fully self-contained and no URL
    // derived from user input is ever navigated to.
    await page.setContent(html, { waitUntil: 'load' })

    // The auto-fit pass runs after document.fonts.ready and flags completion.
    // Screenshotting before it finishes captures text at its unfitted size —
    // which looks fine on short copy and badly overflows on long copy, so it
    // would ship intermittently rather than fail loudly.
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-autofit-done') === 'true',
      undefined,
      { timeout: 15_000 },
    )

    png = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: CANVAS.width, height: CANVAS.height },
    })
  } finally {
    releasePage(page)
  }

  // PNG out of Chromium, JPEG for Instagram. mozjpeg buys roughly 15% at equal
  // quality; 4:4:4 chroma keeps coloured text edges from smearing, which is
  // very visible on the accent-coloured headlines these templates use.
  // `resolveWithObject` returns the output dimensions from the encode that just
  // happened. Reading them with a second `sharp(jpeg).metadata()` decoded the
  // image again — a full JPEG decode per slide, ten per carousel, purely to
  // learn two numbers the encoder already had.
  const { data: jpeg, info } = await sharp(png)
    .toColorspace('srgb')
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  const width = info.width || CANVAS.width
  const height = info.height || CANVAS.height

  assertPublishable({ width, height, bytes: jpeg.byteLength })

  return {
    jpeg,
    width,
    height,
    bytes: jpeg.byteLength,
    sha256: createHash('sha256').update(jpeg).digest('hex'),
    durationMs: Date.now() - started,
  }
}

/**
 * Fail loudly on anything Instagram would reject.
 *
 * These are all silent-at-render, loud-at-publish failures otherwise, and the
 * publish happens on a schedule when nobody is watching.
 */
export function assertPublishable(image: { width: number; height: number; bytes: number }): void {
  const { width, height, bytes } = image

  if (bytes > MAX_BYTES) {
    throw new Error(
      `Slide is ${(bytes / 1024 / 1024).toFixed(2)}MB, over Instagram's 8MB limit.`,
    )
  }
  if (width < MIN_WIDTH || width > MAX_WIDTH) {
    throw new Error(`Slide width ${width}px is outside Instagram's ${MIN_WIDTH}–${MAX_WIDTH}px.`)
  }

  // Accepted range is 4:5 (0.8) through 1.91:1. Anything taller than 4:5 is
  // rejected; the templates target exactly 0.8.
  //
  // The tolerance rounds INWARD. A guard that accepted 0.79 let an image the
  // API rejects through the one check meant to catch it — and the failure then
  // surfaced at scheduled publish time with nobody watching.
  const aspect = width / height
  if (aspect < 0.8 - 1e-6 || aspect > 1.91 + 1e-6) {
    throw new Error(
      `Slide aspect ratio ${aspect.toFixed(3)} is outside Instagram's 0.8–1.91 range.`,
    )
  }
}

/**
 * Render a whole carousel.
 *
 * Sequential on purpose. The page pool already bounds parallelism, and a
 * carousel is at most ten slides — fanning out here would mainly increase peak
 * memory on the smallest machine anyone runs this on.
 */
export async function renderPost(
  slides: Omit<RenderSlideInput, 'page' | 'total'>[],
  options: { watermark?: string; lang?: string; accentColor?: string } = {},
): Promise<RenderedSlide[]> {
  const total = slides.length
  const out: RenderedSlide[] = []

  for (let i = 0; i < slides.length; i += 1) {
    out.push(
      await renderSlide({
        ...slides[i]!,
        page: i + 1,
        total,
        watermark: options.watermark ?? slides[i]!.watermark,
        lang: options.lang ?? slides[i]!.lang,
        accentColor: options.accentColor ?? slides[i]!.accentColor,
      }),
    )
  }

  return out
}
