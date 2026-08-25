import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NicheProfile } from '../types.ts'

/**
 * The orchestration everything else feeds into, which had no tests.
 *
 * `discover.ts` decides what gets measured, what gets dropped for free, and in
 * what order — the dedup, the forbidden filter, the living-person pre-check,
 * the budget cut and the final sort. Every individual source was covered and
 * the thing that composes them was not, which is the wrong way round: a source
 * returning slightly wrong data costs one bad candidate, whereas the
 * orchestration getting it wrong costs the whole run.
 *
 * Every upstream is mocked at the module boundary, so nothing here touches the
 * network and the assertions are about decisions rather than data.
 */

const cacheDir = mkdtempSync(join(tmpdir(), 'claimfold-discover-'))

/** Mutable per test — each `vi.mock` factory closes over these. */
const upstream = {
  trending: [] as string[],
  topArticles: [] as string[],
  /** Titles that resolve; anything else resolves to null. */
  resolvable: new Set<string>(),
  entityIds: new Map<string, string>(),
  living: new Set<string>(),
  references: 40,
  months: 12,
}

/**
 * `topArticles` returns fully-formed candidates, not titles — it is the one
 * source that has already resolved its own articles. Getting that wrong made
 * every pool empty and every failure look like an unreachable upstream.
 */
function candidateFor(title: string) {
  return {
    key: `de.wikipedia:${title}`,
    title,
    sources: ['wikimedia-top'] as const,
    article: {
      project: 'de.wikipedia',
      title,
      url: `https://de.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    },
    signals: {},
  }
}

vi.mock('../sources/google-trends.ts', () => ({
  trendingForLanguage: vi.fn(() => Promise.resolve(new Set(upstream.trending))),
  geosForLanguage: vi.fn(() => ['DE']),
}))

vi.mock('../sources/wikimedia.ts', () => ({
  projectForLanguage: vi.fn(() => 'de.wikipedia'),
  topArticles: vi.fn(() => Promise.resolve(upstream.topArticles.map(candidateFor))),
  monthlyHistory: vi.fn(() => Promise.resolve({ months: [] })),
  summariseHistory: vi.fn(() => ({
    medianMonthlyViews: 50_000,
    recentMonthlyViews: 50_000,
    viewsVariation: 0.2,
    monthsOfHistory: upstream.months,
  })),
}))

vi.mock('../sources/wikipedia.ts', () => ({
  resolveArticle: vi.fn((_project: string, title: string) =>
    Promise.resolve(upstream.resolvable.has(title) ? title.replace(/ /g, '_') : null),
  ),
  articleFacts: vi.fn(() =>
    Promise.resolve({ externalLinkCount: upstream.references, ageDays: 3_000, templates: [] }),
  ),
  entityIdsForTitles: vi.fn((_project: string, titles: string[]) =>
    Promise.resolve(
      new Map(
        titles
          .map((t) => [t.toLowerCase(), upstream.entityIds.get(t.toLowerCase())] as const)
          .filter((pair): pair is readonly [string, string] => typeof pair[1] === 'string'),
      ),
    ),
  ),
  entityFacts: vi.fn((ids: string[]) =>
    Promise.resolve(
      new Map(
        ids.map((id) => [
          id,
          {
            isHuman: upstream.living.has(id),
            isLivingPerson: upstream.living.has(id),
            instanceOf: [],
          },
        ]),
      ),
    ),
  ),
}))

vi.mock('../sources/gdelt.ts', () => ({
  newsVolume: vi.fn(() => Promise.resolve({ articleCount: 10 })),
}))

type DiscoverModule = typeof import('../discover.ts')
let discoverTopics: DiscoverModule['discoverTopics']

beforeAll(async () => {
  process.env['TRENDS_CACHE_DIR'] = cacheDir
  ;({ discoverTopics } = await import('../discover.ts'))
})

afterAll(() => {
  rmSync(cacheDir, { recursive: true, force: true })
  delete process.env['TRENDS_CACHE_DIR']
})

beforeEach(() => {
  upstream.trending = []
  upstream.topArticles = []
  upstream.resolvable = new Set()
  upstream.entityIds = new Map()
  upstream.living = new Set()
  upstream.references = 40
  upstream.months = 12
})

afterEach(() => {
  vi.clearAllMocks()
})

const niche: NicheProfile = {
  language: 'de',
  topicSeeds: [],
  description: 'Geschichte und Irrtümer',
  forbiddenTopics: [],
}

function codes(run: { notes: { code: string }[] }): string[] {
  return run.notes.map((note) => note.code)
}

describe('pool assembly', () => {
  it('deduplicates the same article arriving from two sources', async () => {
    // The same subject is trending AND in the top-articles list. One candidate,
    // credited to both — not two rows competing for the same budget.
    upstream.trending = ['Mittelalter']
    upstream.topArticles = ['Mittelalter']
    upstream.resolvable = new Set(['Mittelalter'])

    const run = await discoverTopics({ niche })
    const matches = run.topics.filter((t) => t.title === 'Mittelalter')

    expect(matches).toHaveLength(1)
    expect(matches[0]!.sources.length).toBeGreaterThan(1)
  })

  it('keeps distinct subjects apart', async () => {
    upstream.topArticles = ['Mittelalter', 'Barock']
    upstream.resolvable = new Set(['Mittelalter', 'Barock'])

    const run = await discoverTopics({ niche })
    expect(run.topics.map((t) => t.title).sort()).toEqual(['Barock', 'Mittelalter'])
  })
})

describe('the free refusals, before anything is measured', () => {
  it('drops a forbidden subject and says how many went', async () => {
    upstream.topArticles = ['Homöopathie', 'Mittelalter']
    upstream.resolvable = new Set(['Homöopathie', 'Mittelalter'])

    const run = await discoverTopics({
      niche: { ...niche, forbiddenTopics: ['Homöopathie'] },
    })

    expect(run.topics.map((t) => t.title)).toEqual(['Mittelalter'])
    expect(codes(run)).toContain('forbiddenDropped')
  })

  it('does not drop a subject that merely contains a forbidden word', async () => {
    // The substring bug, asserted at the level that matters: a channel
    // forbidding "eu" must not lose "Neuseeland".
    upstream.topArticles = ['Neuseeland']
    upstream.resolvable = new Set(['Neuseeland'])

    const run = await discoverTopics({ niche: { ...niche, forbiddenTopics: ['eu'] } })
    expect(run.topics.map((t) => t.title)).toEqual(['Neuseeland'])
  })

  it('drops a living person before spending two requests on them', async () => {
    upstream.topArticles = ['Taylor Swift', 'Mittelalter']
    upstream.resolvable = new Set(['Taylor Swift', 'Mittelalter'])
    upstream.entityIds = new Map([['taylor swift', 'Q26876']])
    upstream.living = new Set(['Q26876'])

    const run = await discoverTopics({ niche })

    expect(run.topics.map((t) => t.title)).toEqual(['Mittelalter'])
    expect(codes(run)).toContain('livingDropped')
  })
})

describe('budget', () => {
  it('measures no more than the budget and says what it left', async () => {
    upstream.topArticles = ['A', 'B', 'C', 'D']
    upstream.resolvable = new Set(['A', 'B', 'C', 'D'])

    const run = await discoverTopics({ niche, budget: 2 })

    expect(run.topics).toHaveLength(2)
    expect(codes(run)).toContain('budgetCapped')
  })

  it('falls back to the default rather than measuring nothing on a zero budget', async () => {
    // `budget` is an exported option: 0 and NaN both silently produced an empty
    // run that looked exactly like "no good topics today".
    upstream.topArticles = ['A', 'B']
    upstream.resolvable = new Set(['A', 'B'])

    const run = await discoverTopics({ niche, budget: 0 })
    expect(run.topics.length).toBeGreaterThan(0)
  })
})

describe('cancellation', () => {
  it('returns what it measured rather than throwing, and says it stopped', async () => {
    upstream.topArticles = ['A', 'B', 'C']
    upstream.resolvable = new Set(['A', 'B', 'C'])

    const controller = new AbortController()
    controller.abort()

    const run = await discoverTopics({ niche, signal: controller.signal })

    // Twenty minutes of rate-limited measurement is worth keeping even when the
    // operator changed their mind about the next candidate.
    expect(codes(run)).toContain('runAborted')
  })
})

describe('ordering', () => {
  it('returns the highest-scoring subject first', async () => {
    upstream.topArticles = ['Strong', 'Weak']
    upstream.resolvable = new Set(['Strong', 'Weak'])

    const run = await discoverTopics({ niche })
    const scores = run.topics.map((t) => t.score.score)

    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })
})

describe('resilience', () => {
  it('carries on when a source is unreachable, and records which', async () => {
    const trends = await import('../sources/google-trends.ts')
    vi.mocked(trends.trendingForLanguage).mockRejectedValueOnce(new Error('gone'))

    upstream.topArticles = ['Mittelalter']
    upstream.resolvable = new Set(['Mittelalter'])

    const run = await discoverTopics({ niche })

    expect(run.topics.map((t) => t.title)).toEqual(['Mittelalter'])
    expect(codes(run)).toContain('sourceUnavailable')
  })
})
