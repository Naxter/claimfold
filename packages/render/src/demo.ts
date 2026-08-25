import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { SlideContent } from '@claimfold/db'
import { missingFamilies } from '@claimfold/templates/fonts'

import { closeBrowser } from './browser.ts'
import { renderPost } from './render.ts'

/**
 * `npm run render:demo`
 *
 * Fixture JSON in, finished JPEGs out, with no database, no web server and no
 * network. This is the Phase 1 acceptance test: if these files look good, the
 * hardest quality problem in the product is solved.
 */

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..', '..')
const fixturePath = resolve(here, '..', 'fixtures', 'demo-post.json')
const outDir = resolve(repoRoot, 'out')

interface Fixture {
  themeId: string
  templateId: string
  watermark?: string
  slides: Array<{ role: string; content: SlideContent }>
}

async function main() {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture

  const missing = missingFamilies()
  if (missing.length > 0) {
    console.warn(
      `\n  Missing fonts: ${missing.join(', ')}\n` +
        `  Slides will render with fallback faces and will NOT match the design.\n` +
        `  Fix with: npm run fonts:fetch\n`,
    )
  }

  mkdirSync(outDir, { recursive: true })

  console.log(`Rendering ${fixture.slides.length} slides (theme "${fixture.themeId}")…\n`)

  const rendered = await renderPost(
    fixture.slides.map((slide) => ({
      templateId: fixture.templateId,
      themeId: fixture.themeId,
      role: slide.role,
      content: slide.content,
    })),
    { watermark: fixture.watermark },
  )

  let totalBytes = 0
  let totalMs = 0

  rendered.forEach((slide, i) => {
    const role = fixture.slides[i]!.role
    const name = `${String(i + 1).padStart(2, '0')}-${role}.jpg`
    writeFileSync(resolve(outDir, name), slide.jpeg)

    totalBytes += slide.bytes
    totalMs += slide.durationMs

    console.log(
      `  ${name.padEnd(18)} ${slide.width}x${slide.height}  ` +
        `${(slide.bytes / 1024).toFixed(0).padStart(4)}KB  ${slide.durationMs}ms`,
    )
  })

  console.log(
    `\n${rendered.length} slides · ${(totalBytes / 1024 / 1024).toFixed(2)}MB total · ` +
      `${totalMs}ms · ${Math.round(totalMs / rendered.length)}ms per slide`,
  )
  console.log(`\nWritten to ${outDir}`)

  await closeBrowser()
}

main().catch(async (error: unknown) => {
  console.error('\nRender failed:', error)
  await closeBrowser()
  process.exit(1)
})
