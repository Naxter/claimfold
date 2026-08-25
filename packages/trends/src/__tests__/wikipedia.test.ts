import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetRateLimiter } from '../http.ts'

type WikipediaModule = typeof import('../sources/wikipedia.ts')
let entityFacts: WikipediaModule['entityFacts']
let entityIdsForTitles: WikipediaModule['entityIdsForTitles']

/**
 * The alias walk-back, and the living-person check that depends on it.
 *
 * `entityIdsForTitles` had no tests, and its failure mode is the dangerous
 * kind: the MediaWiki API rewrites titles it normalised or redirected, so the
 * answer has to be walked back to the title the caller asked about. Get that
 * wrong and the function returns nothing for that title — which reads exactly
 * like "no Wikidata entity exists", so the living-person pre-check silently
 * stops working and the run spends its budget measuring people it should have
 * dropped for free.
 *
 * Nothing here touches the network.
 */

const realFetch = globalThis.fetch

/*
  A cache directory of its own.

  Both functions under test go through `withCache`, which is backed by disk. Left
  pointing at the real `data/trends-cache`, these tests would read whatever a
  previous run left there and — worse — each test would poison the next, because
  the cache key is derived from the titles and several tests use the same ones.
  A fixture that passes because of a stale file is not a test.
*/
const cacheDir = mkdtempSync(join(tmpdir(), 'claimfold-wikipedia-'))

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

beforeAll(async () => {
  process.env['TRENDS_CACHE_DIR'] = cacheDir
  const mod = await import('../sources/wikipedia.ts')
  entityFacts = mod.entityFacts
  entityIdsForTitles = mod.entityIdsForTitles
})

afterAll(() => {
  rmSync(cacheDir, { recursive: true, force: true })
  delete process.env['TRENDS_CACHE_DIR']
})

beforeEach(() => {
  resetRateLimiter()
})

afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

describe('entityIdsForTitles', () => {
  it('returns the entity id under the title that was asked for', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      json({
        query: {
          pages: [{ title: 'Mittelalter', pageprops: { wikibase_item: 'Q12554' } }],
        },
      }),
    )

    const ids = await entityIdsForTitles('de.wikipedia', ['Mittelalter'])
    expect(ids.get('mittelalter')).toBe('Q12554')
  })

  it('walks back a normalisation, so the caller finds its own title', async () => {
    // The API normalises `mittelalter` to `Mittelalter` and answers under the
    // normalised form. Without the walk-back the caller's key finds nothing.
    globalThis.fetch = vi.fn().mockResolvedValue(
      json({
        query: {
          normalized: [{ from: 'mittelalter', to: 'Mittelalter' }],
          pages: [{ title: 'Mittelalter', pageprops: { wikibase_item: 'Q12554' } }],
        },
      }),
    )

    const ids = await entityIdsForTitles('de.wikipedia', ['mittelalter'])
    expect(ids.get('mittelalter')).toBe('Q12554')
  })

  it('walks back a redirect', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      json({
        query: {
          redirects: [{ from: 'Dunkles Zeitalter', to: 'Mittelalter' }],
          pages: [{ title: 'Mittelalter', pageprops: { wikibase_item: 'Q12554' } }],
        },
      }),
    )

    const ids = await entityIdsForTitles('de.wikipedia', ['Dunkles Zeitalter'])
    expect(ids.get('dunkles zeitalter')).toBe('Q12554')
  })

  it('walks back a normalisation followed by a redirect', async () => {
    // Both hops in one response is the case the loop exists for, and the one a
    // single-step implementation gets wrong.
    globalThis.fetch = vi.fn().mockResolvedValue(
      json({
        query: {
          normalized: [{ from: 'dunkles zeitalter', to: 'Dunkles Zeitalter' }],
          redirects: [{ from: 'Dunkles Zeitalter', to: 'Mittelalter' }],
          pages: [{ title: 'Mittelalter', pageprops: { wikibase_item: 'Q12554' } }],
        },
      }),
    )

    const ids = await entityIdsForTitles('de.wikipedia', ['dunkles zeitalter'])
    expect(ids.get('dunkles zeitalter')).toBe('Q12554')
  })

  it('skips a page with no wikibase item rather than inventing one', async () => {
    // A title of its own. The cache key is derived from the batch, so reusing
    // 'Mittelalter' here served the previous test's cached answer and this
    // passed for the wrong reason — the same class of stale-fixture bug the
    // per-file cache directory above is guarding against.
    globalThis.fetch = vi.fn().mockResolvedValue(
      json({ query: { pages: [{ title: 'Barock' }] } }),
    )

    const ids = await entityIdsForTitles('de.wikipedia', ['Barock'])
    expect(ids.size).toBe(0)
  })

  it('returns empty for no titles without calling the API', async () => {
    const spy = vi.fn()
    globalThis.fetch = spy

    expect((await entityIdsForTitles('de.wikipedia', [])).size).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('entityFacts', () => {
  it('reports a person with no date of death as living', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      json({
        entities: {
          Q1: {
            claims: {
              // instance of: human
              P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
            },
          },
        },
      }),
    )

    const facts = await entityFacts(['Q1'])
    expect(facts.get('Q1')?.isLivingPerson).toBe(true)
  })

  it('does not treat a person with a date of death as living', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      json({
        entities: {
          Q2: {
            claims: {
              P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
              P570: [{ mainsnak: { datavalue: { value: { time: '+1980-01-01T00:00:00Z' } } } }],
            },
          },
        },
      }),
    )

    const facts = await entityFacts(['Q2'])
    expect(facts.get('Q2')?.isLivingPerson).toBe(false)
  })

  it('does not treat a non-person as living', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      json({
        entities: {
          Q3: { claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q3305213' } } } }] } },
        },
      }),
    )

    const facts = await entityFacts(['Q3'])
    expect(facts.get('Q3')?.isLivingPerson).toBe(false)
  })

  it('returns empty for no ids without calling the API', async () => {
    const spy = vi.fn()
    globalThis.fetch = spy

    expect((await entityFacts([])).size).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })
})
