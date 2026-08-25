import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { closeBrowser } from '@claimfold/render'
import { renderSlide } from '@claimfold/render'

/**
 * Typography stress test.
 *
 * Renders the copy that has actually broken the layout before, so a regression
 * is caught by looking at three files rather than by noticing it in a published
 * post. German compounds are the worst case: they are long, unbreakable without
 * hyphenation rules, and routine in this niche.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(resolve(repoRoot, '.env'))) process.loadEnvFile(resolve(repoRoot, '.env'))
const outDir = resolve(repoRoot, 'out', 'check')

const CASES = [
  { name: 'long-compound', lang: 'de', headline: '„Hexenverbrennungen? Das war doch Mittelalter."', body: 'Die vertraute Zeitachse ist unvollständig.' },
  { name: 'extreme-compound', lang: 'de', headline: 'Donaudampfschifffahrtsgesellschaftskapitän', body: 'Ein Extremfall, der nicht brechen darf.' },
  { name: 'short', lang: 'de', headline: 'Kurz', body: 'Kurzer Text.' },
]

async function main() {
  mkdirSync(outDir, { recursive: true })
  for (const c of CASES) {
    const r = await renderSlide({
      templateId: 'editorial', themeId: 'paper', role: 'hook',
      content: { kicker: 'TEST', headline: c.headline, body: c.body },
      page: 1, total: 1, lang: c.lang,
    })
    writeFileSync(resolve(outDir, `${c.name}.jpg`), r.jpeg)
    console.log(`  ${c.name.padEnd(20)} ${(r.bytes / 1024).toFixed(0)}KB`)
  }
  console.log(`\nwritten to ${outDir}`)
  await closeBrowser()
}
main().catch(async (e) => { console.error(e); await closeBrowser(); process.exit(1) })
