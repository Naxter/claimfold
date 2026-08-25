/**
 * Hit each discovery source once and report what came back.
 *
 * Exists because every one of these is an HTTP contract with somebody else's
 * service, and a package that compiles proves nothing about whether the URLs
 * are right. This repo has already shipped one tool that was declared,
 * referenced in comments and never actually run; a source layer that has never
 * made a request would be the same mistake in a new place.
 *
 *   npm run trends:probe
 *
 * Writes to the cache like a real run, so a second probe is nearly free.
 */

import {
  articleFacts,
  entityFacts,
  monthlyHistory,
  newsVolume,
  projectForLanguage,
  resolveArticle,
  summariseHistory,
  topArticles,
  trendingNow,
} from '@claimfold/trends/sources'
import { userAgent } from '@claimfold/trends'

const LANGUAGE = process.argv[2] ?? 'de'
const project = projectForLanguage(LANGUAGE)

let failures = 0

async function probe(name: string, run: () => Promise<string>): Promise<void> {
  process.stdout.write(`${name.padEnd(28)} `)
  try {
    console.log(`ok — ${await run()}`)
  } catch (error) {
    failures += 1
    console.log(`FAILED — ${(error as Error).message}`)
  }
}

console.log(`Probing topic-discovery sources for ${LANGUAGE} (${project})`)
console.log(`User-Agent: ${userAgent()}\n`)

const top = await topArticles(project, 2, 5).catch(() => [])

await probe('wikimedia top articles', async () => {
  const articles = await topArticles(project, 2, 5)
  if (articles.length === 0) throw new Error('no articles returned')
  return `${articles.length} articles, first: ${articles[0]!.title}`
})

const sample = top[0]?.article?.title ?? 'Mittelalter'

await probe('wikimedia monthly history', async () => {
  const history = await monthlyHistory(project, sample)
  const summary = summariseHistory(history)
  if (history.months.length === 0) throw new Error(`no months for ${sample}`)
  return `${sample}: ${history.months.length} months, median ${Math.round(
    summary.medianMonthlyViews,
  ).toLocaleString()}/mo, variation ${summary.viewsVariation.toFixed(2)}`
})

await probe('wikipedia article facts', async () => {
  const facts = await articleFacts(project, sample)
  if (!facts) throw new Error(`article ${sample} not found`)
  return `${facts.externalLinkCount} external links, ${facts.templates.length} templates, age ${facts.ageDays ?? '?'}d, entity ${facts.entityId ?? 'none'}`
})

await probe('wikidata entity claims', async () => {
  // Q9711 is Johannes Kepler: a human, and definitively not a living one.
  const entities = await entityFacts(['Q9711'])
  const kepler = entities.get('Q9711')
  if (!kepler) throw new Error('no entity returned')
  if (!kepler.isHuman) throw new Error('Q9711 did not come back as a human')
  if (kepler.isLivingPerson) throw new Error('Kepler was reported as still alive')
  return `Q9711 human=${kepler.isHuman} living=${kepler.isLivingPerson}`
})

await probe('wikipedia search resolve', async () => {
  const resolved = await resolveArticle(project, 'Halleyscher Komet')
  if (!resolved) throw new Error('nothing resolved')
  return `resolved to ${resolved}`
})

await probe('google trends rss', async () => {
  const geo = LANGUAGE.startsWith('de') ? 'DE' : 'US'
  const titles = await trendingNow(geo)
  if (titles.length === 0) throw new Error(`empty feed for ${geo}`)
  return `${titles.length} trending in ${geo}, first: ${titles[0]}`
})

await probe('gdelt news volume', async () => {
  const volume = await newsVolume(sample, LANGUAGE)
  // Zero is a legitimate answer, so this only fails on a thrown error.
  return `${volume.articleCount} articles in 7d for "${sample}"`
})

console.log(
  failures === 0
    ? '\nEvery source answered.'
    : `\n${failures} source(s) failed. Discovery still runs — each source degrades on its own — but the ranking loses whatever they contribute.`,
)

process.exit(failures === 0 ? 0 : 1)
