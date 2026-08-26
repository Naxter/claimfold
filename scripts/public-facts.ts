import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `npm run facts` — write docs/public-facts.json.
 *
 * Every number the marketing site states about this product is a constant in
 * here somewhere. The two live in separate repositories, so nothing stopped a
 * limit from moving while the site went on quoting the old one, and a page
 * whose whole argument is about not saying things that are not so is a bad
 * place for a stale figure. It had already happened: the site claimed the
 * committed fonts weigh about 305 KB when they weigh 324.
 *
 * So the figures are derived from the source rather than typed twice. This
 * writes them out; `public-facts.test.ts` fails if the committed file has
 * drifted from what the source now says; and the site repository keeps a copy
 * it checks its own copy against.
 *
 * Deliberately narrow. Only facts the site actually states belong here — this
 * is not a metrics endpoint, and a fact nobody publishes is a fact nobody can
 * get wrong in public.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8')

/** Pull one capture group out of a file, or fail loudly naming the file. */
function grab(file: string, pattern: RegExp): string {
  const match = pattern.exec(read(file))
  if (!match?.[1]) {
    throw new Error(`public-facts: ${pattern} no longer matches ${file}`)
  }
  return match[1]
}

function fontTotals(): { count: number; bytes: number } {
  const dir = join(repoRoot, 'packages/templates/assets/fonts')
  const files = readdirSync(dir).filter((f) => f.endsWith('.woff2'))
  const bytes = files.reduce((sum, f) => sum + statSync(join(dir, f)).size, 0)
  return { count: files.length, bytes }
}

export function collectFacts(): Record<string, unknown> {
  const gate = 'packages/content/src/gate.ts'
  const fonts = fontTotals()

  return {
    /* The gate's hard limits. */
    maxCaptionCharacters: Number(grab(gate, /const MAX_CAPTION = ([\d_]+)/).replace(/_/g, '')),
    maxHashtags: Number(grab(gate, /const MAX_HASHTAGS = ([\d_]+)/).replace(/_/g, '')),
    slidesMin: Number(grab(gate, /draft\.slides\.length < (\d+)/)),
    slidesMax: Number(grab(gate, /draft\.slides\.length > (\d+)/)),

    /* The floor a channel may not go below. Not the default, the minimum:
       this is the number the site quotes as the thing that cannot be argued
       down, so it has to come from the validator rather than from a preset. */
    confidenceFloorMinimum: Number(
      grab('packages/niches/src/schema.ts', /minConfidence: z\s*\n\s*\.number\(\)\s*\n\s*\.min\(([\d.]+)/),
    ),

    /* Committed type. Counted and weighed rather than remembered. */
    fontsCommitted: fonts.count,
    fontsBytes: fonts.bytes,
    fontsKilobytesRounded: Math.round(fonts.bytes / 1024),

    /* Runtime floor, from the one place that enforces it. */
    nodeMinimumMajor: Number(
      grab('package.json', /"node"\s*:\s*">=\s*(\d+)/),
    ),

    licence: 'BUSL-1.1',
  }
}

const OUT = 'docs/public-facts.json'

if (process.argv[1] && process.argv[1].endsWith('public-facts.ts')) {
  const facts = collectFacts()
  writeFileSync(join(repoRoot, OUT), JSON.stringify(facts, null, 2) + '\n')
  console.log(`Wrote ${OUT}`)
  for (const [k, v] of Object.entries(facts)) console.log(`  ${k.padEnd(24)} ${String(v)}`)
}
