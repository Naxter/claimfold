import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { SlideContent } from '@claimfold/db'
import { runPipeline } from '@claimfold/content'
import { PRESET_NICHES, validateNichePack } from '@claimfold/niches'
import { closeBrowser } from '@claimfold/render'
import { renderPost } from '@claimfold/render'

/**
 * `npm run pipeline:dry -- --niche wissen-de --topic "Mittelalter"`
 *
 * Runs the whole chain — ideate, verify, gate, write, render — and writes JPEGs
 * to ./out. Touches no database and publishes nothing.
 *
 * This is the Phase 2 acceptance test. It also doubles as the fastest way to
 * evaluate a prompt change: run it, read the slides, adjust.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = resolve(repoRoot, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const outDir = resolve(repoRoot, 'out')

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const slug = arg('niche') ?? 'wissen-de'
  const topic = arg('topic')
  const slideCount = arg('slides') ? Number(arg('slides')) : undefined
  const skipRender = process.argv.includes('--no-render')

  const preset = PRESET_NICHES.find((p) => p.slug === slug)
  if (!preset) {
    console.error(
      `Unknown niche "${slug}". Available: ${PRESET_NICHES.map((p) => p.slug).join(', ')}`,
    )
    process.exit(1)
  }

  const validated = validateNichePack(preset)
  if (!validated.ok) {
    console.error('Niche is invalid:', validated.errors)
    process.exit(1)
  }
  const niche = validated.pack

  console.log(`niche:  ${niche.name}  (${niche.language})`)
  console.log(`topic:  ${topic ?? '(from seeds)'}\n`)

  const started = Date.now()
  const result = await runPipeline({ niche, topic, slideCount })

  /* ── Idea ───────────────────────────────────────────────────────────── */
  console.log('─'.repeat(76))
  console.log(`IDEA   ${result.idea.title}`)
  console.log(`       format: ${result.idea.format}   surprise: ${result.idea.surprise}`)
  console.log(`       ${result.idea.premise}`)
  if (result.rejectedIdeas.length) {
    console.log(`\n       also considered:`)
    for (const other of result.rejectedIdeas) console.log(`       · ${other.title}`)
  }

  /* ── Verification ───────────────────────────────────────────────────── */
  console.log(`\n${'─'.repeat(76)}`)
  console.log(`VERIFICATION   ${result.searched.length} pages consulted`)
  for (const v of result.verification.verdicts) {
    const mark = { supported: '+', disputed: '~', false: 'X', unverifiable: '?' }[v.verdict]
    console.log(
      `  ${mark} [${v.verdict.padEnd(12)} ${v.confidence.toFixed(2)}] ` +
        `${v.isCore ? 'CORE' : 'inc.'}  ${v.claim.slice(0, 76)}`,
    )
    for (const s of v.sources.slice(0, 2)) console.log(`        ${s.title.slice(0, 70)}`)
  }
  for (const caveat of result.verification.caveats) console.log(`  ! ${caveat}`)

  /* ── Gate ───────────────────────────────────────────────────────────── */
  console.log(`\n${'─'.repeat(76)}`)
  console.log(`GATE   ${result.gate.passed ? 'PASSED' : 'BLOCKED'}`)
  for (const block of result.gate.blocks) console.log(`  BLOCK    ${block.message}`)
  for (const warning of result.gate.warnings) console.log(`  warning  ${warning.message}`)

  if (result.stoppedAtGate) {
    console.log('\nStopped before writing — nothing was drafted, and that is the point.')
    report(result, started)
    return
  }

  /* ── Draft ──────────────────────────────────────────────────────────── */
  const draft = result.draft!
  console.log(`\n${'─'.repeat(76)}`)
  console.log(`DRAFT   ${draft.slides.length} slides`)
  draft.slides.forEach((slide, i) => {
    console.log(`\n  ${i + 1}. [${slide.role}] ${slide.headline ?? ''}`)
    if (slide.body) console.log(`     ${slide.body.slice(0, 150)}`)
    if (slide.items?.length) for (const item of slide.items) console.log(`     · ${item.slice(0, 130)}`)
  })
  console.log(`\n  caption (${draft.caption.length} chars):\n  ${draft.caption.slice(0, 400)}`)
  console.log(`\n  hashtags: ${draft.hashtags.join(' ')}`)

  /* ── Render ─────────────────────────────────────────────────────────── */
  if (!skipRender) {
    console.log(`\n${'─'.repeat(76)}`)
    console.log('RENDER')

    const format = niche.formats.find((f) => f.id === result.idea.format)
    mkdirSync(outDir, { recursive: true })

    const rendered = await renderPost(
      draft.slides.map((slide) => ({
        templateId: format?.templateId ?? 'editorial',
        themeId: niche.themeId,
        role: slide.role,
        content: {
          headline: slide.headline ?? undefined,
          body: slide.body ?? undefined,
          kicker: slide.kicker ?? undefined,
          footnote: slide.footnote ?? undefined,
          items: slide.items ?? undefined,
          figure: slide.figure ?? undefined,
          figureLabel: slide.figureLabel ?? undefined,
        } satisfies SlideContent,
      })),
      { watermark: '@your.handle', lang: niche.language },
    )

    rendered.forEach((slide, i) => {
      const name = `gen-${String(i + 1).padStart(2, '0')}-${draft.slides[i]!.role}.jpg`
      writeFileSync(resolve(outDir, name), slide.jpeg)
      console.log(`  ${name.padEnd(26)} ${(slide.bytes / 1024).toFixed(0)}KB  ${slide.durationMs}ms`)
    })
    console.log(`\n  written to ${outDir}`)
  }

  report(result, started)
  await closeBrowser()
}

function report(
  result: Awaited<ReturnType<typeof runPipeline>>,
  started: number,
): void {
  console.log(`\n${'─'.repeat(76)}`)
  for (const cost of result.costs) {
    const cached = cost.cachedTokens ? ` (${cost.cachedTokens} cached)` : ''
    console.log(
      `  ${cost.model.padEnd(16)} in ${String(cost.inputTokens).padStart(6)}${cached.padEnd(16)}` +
        `out ${String(cost.outputTokens).padStart(6)}  ` +
        (cost.costUsd === undefined ? 'cost n/a' : `$${cost.costUsd.toFixed(4)}`),
    )
  }
  const total =
    result.totalCostUsd === undefined ? 'unpriced model' : `$${result.totalCostUsd.toFixed(4)}`
  console.log(`  total: ${total}   ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

main().catch(async (error: unknown) => {
  console.error('\npipeline failed:', error)
  await closeBrowser()
  process.exit(1)
})
