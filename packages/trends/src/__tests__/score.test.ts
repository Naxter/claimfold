import { describe, expect, it } from 'vitest'

import {
  demandScore,
  durabilityScore,
  factCheckabilityScore,
  isForbidden,
  isRecommendedNicheFit,
  MAX_RECENCY_MULTIPLIER,
  MIN_RECOMMENDED_NICHE_FIT,
  nicheFitScore,
  recencyMultiplier,
  scoreCandidate,
  WEIGHTS,
} from '../score.ts'
import type { NicheProfile, TopicCandidate } from '../types.ts'

const niche: NicheProfile = {
  language: 'de',
  topicSeeds: ['Geschichte des Mittelalters', 'Astronomie und Raumfahrt'],
  description: 'Wissenschaft und Geschichte für neugierige Erwachsene',
  forbiddenTopics: ['Homöopathie'],
}

function candidate(overrides: Partial<TopicCandidate> = {}): TopicCandidate {
  return {
    key: 'de.wikipedia:Test',
    title: 'Test',
    sources: ['wikimedia'],
    signals: {},
    ...overrides,
  }
}

describe('weights', () => {
  it('sums to one, so the base score is on a 0-1 scale', () => {
    const total =
      WEIGHTS.durability + WEIGHTS.demand + WEIGHTS.factCheckability + WEIGHTS.nicheFit
    expect(total).toBeCloseTo(1, 10)
  })

  it('weights durability above everything else', () => {
    expect(WEIGHTS.durability).toBeGreaterThan(WEIGHTS.demand)
    expect(WEIGHTS.durability).toBeGreaterThan(WEIGHTS.factCheckability)
    expect(WEIGHTS.durability).toBeGreaterThan(WEIGHTS.nicheFit)
  })
})

describe('durability', () => {
  it('scores an unmeasured candidate zero rather than skipping the component', () => {
    // The failure this guards: treating "no evidence" as neutral lets a topic
    // nobody could measure outrank one that was measured and found spiky.
    expect(durabilityScore(candidate())).toBe(0)
  })

  it('prefers steady interest over the same total delivered in bursts', () => {
    const steady = candidate({
      signals: { viewsVariation: 0.1, monthsOfHistory: 12, ageDays: 3000 },
    })
    const spiky = candidate({
      signals: { viewsVariation: 1.5, monthsOfHistory: 12, ageDays: 3000 },
    })

    expect(durabilityScore(steady)).toBeGreaterThan(durabilityScore(spiky))
  })

  it('penalises a surviving dominant spike', () => {
    const base = { viewsVariation: 0.3, monthsOfHistory: 12, ageDays: 3000 }
    const withSpike = candidate({
      signals: { ...base, dominantSpike: { month: '2025-01', share: 0.6, ageDays: 400 } },
    })

    expect(durabilityScore(withSpike)).toBeLessThan(durabilityScore(candidate({ signals: base })))
  })

  it('never leaves the unit interval, even with nonsense input', () => {
    const absurd = candidate({
      signals: { viewsVariation: -5, monthsOfHistory: 500, ageDays: 10_000_000 },
    })
    const score = durabilityScore(absurd)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('does not reward an impossible variation as perfect steadiness', () => {
    /*
      The bug the test above hid.

      A coefficient of variation cannot be negative, so a negative one means the
      number was never measured. `unit()` clamped it to 0 — which is the value
      for a perfectly flat series — so nonsense scored better than any real
      topic could. Clamping kept it inside [0,1], which is all the test above
      asserted, so it passed throughout.

      Unmeasured must score like absent, not like ideal.
    */
    const signals = { monthsOfHistory: 12, ageDays: 4000 }

    const impossible = durabilityScore(candidate({ signals: { ...signals, viewsVariation: -5 } }))
    const absent = durabilityScore(candidate({ signals }))
    const flat = durabilityScore(candidate({ signals: { ...signals, viewsVariation: 0 } }))

    expect(impossible).toBe(absent)
    expect(impossible).toBeLessThan(flat)
  })
})

describe('demand', () => {
  it('grows with views but compresses the top end', () => {
    const small = demandScore(candidate({ signals: { medianMonthlyViews: 1_000 } }))
    const large = demandScore(candidate({ signals: { medianMonthlyViews: 100_000 } }))
    const huge = demandScore(candidate({ signals: { medianMonthlyViews: 10_000_000 } }))

    expect(large).toBeGreaterThan(small)
    expect(huge).toBeLessThanOrEqual(1)
    // Log scaling: a hundredfold jump must not be a hundredfold score jump, or
    // one enormous article flattens every other candidate to nearly zero.
    expect(large / small).toBeLessThan(10)
  })

  it('is zero when there is no measurement', () => {
    expect(demandScore(candidate())).toBe(0)
  })
})

describe('fact-checkability', () => {
  it('rises with the number of external links', () => {
    const thin = factCheckabilityScore(candidate({ signals: { referenceCount: 15 } }))
    const dense = factCheckabilityScore(candidate({ signals: { referenceCount: 150 } }))
    expect(dense).toBeGreaterThan(thin)
  })

  it('is zero with no links at all', () => {
    expect(factCheckabilityScore(candidate({ signals: { referenceCount: 0 } }))).toBe(0)
  })
})

describe('niche fit', () => {
  it('keeps zero-fit subjects available to explore but out of recommendations', () => {
    expect(isRecommendedNicheFit(0)).toBe(false)
    expect(isRecommendedNicheFit(undefined)).toBe(false)
    expect(isRecommendedNicheFit(MIN_RECOMMENDED_NICHE_FIT)).toBe(true)
  })

  it('rewards vocabulary the niche already uses', () => {
    const near = nicheFitScore(candidate({ title: 'Astronomie im Mittelalter' }), niche)
    const far = nicheFitScore(candidate({ title: 'Formel-1-Saison' }), niche)
    expect(near).toBeGreaterThan(far)
  })

  it('does not dominate: a perfect fit alone cannot reach the top of the scale', () => {
    // Fit is the smallest weight on purpose — an operator who only ever sees
    // topics they already thought of gets nothing from discovery.
    //
    // Asserted against the constants rather than a round number. `0.3` passed
    // while the reachable maximum was 0.195, so the nicheFit weight could have
    // been doubled without this noticing — which is exactly the change the test
    // exists to catch.
    const onlyFit = scoreCandidate(candidate({ title: 'Astronomie Raumfahrt' }), niche)
    expect(onlyFit.score).toBeLessThanOrEqual(WEIGHTS.nicheFit * MAX_RECENCY_MULTIPLIER)
  })
})

describe('recency multiplier', () => {
  it('is exactly 1 with no recency signal, so it cannot subtract', () => {
    expect(recencyMultiplier(candidate())).toBe(1)
  })

  it('never exceeds its stated ceiling', () => {
    const loud = candidate({ signals: { trending: true, gdeltArticleCount: 100_000 } })
    expect(recencyMultiplier(loud)).toBeLessThanOrEqual(MAX_RECENCY_MULTIPLIER)
  })

  /**
   * The invariant that actually holds, asserted as an invariant.
   *
   * The pair below is a useful smoke test but it does not prove the claim its
   * name used to make. The code guarantees nothing about "weak" versus
   * "strong" in general — verified: base scores of 0.6337 and 0.6667 can end at
   * 0.8238 and 0.6667, so the WEAKER base wins. The old test passed only
   * because it chose two candidates far enough apart.
   *
   * What the design does guarantee is bounded: the score is exactly
   * `base × multiplier` and the multiplier is capped, so recency cannot close a
   * gap wider than the cap. That is the real rule, and it is the one worth
   * failing on.
   */
  it('multiplies rather than replaces, so recency is bounded by its ceiling', () => {
    const loud = candidate({ signals: { trending: true, gdeltArticleCount: 100_000 } })
    const result = scoreCandidate(loud, niche)

    expect(result.score).toBeCloseTo(result.base * result.recencyMultiplier, 10)
    expect(result.recencyMultiplier).toBeLessThanOrEqual(MAX_RECENCY_MULTIPLIER)
    // Therefore: a base gap wider than the ceiling can never be closed.
    expect(result.score).toBeLessThanOrEqual(result.base * MAX_RECENCY_MULTIPLIER)
  })

  it('does not rescue a much weaker topic', () => {
    // Kept as a concrete case of the bound above, with a name that claims only
    // what it checks.
    const strongAndQuiet = candidate({
      signals: {
        viewsVariation: 0.1,
        monthsOfHistory: 12,
        ageDays: 4000,
        medianMonthlyViews: 150_000,
        referenceCount: 200,
      },
    })
    const weakAndLoud = candidate({
      signals: {
        viewsVariation: 1.2,
        monthsOfHistory: 2,
        ageDays: 200,
        medianMonthlyViews: 500,
        referenceCount: 16,
        trending: true,
        gdeltArticleCount: 500,
      },
    })

    expect(scoreCandidate(strongAndQuiet, niche).score).toBeGreaterThan(
      scoreCandidate(weakAndLoud, niche).score,
    )
  })
})

describe('forbidden topics', () => {
  it('matches regardless of case and punctuation', () => {
    expect(isForbidden('Homöopathie und Placebo', niche)).toBe(true)
    expect(isForbidden('homoopathie', niche)).toBe(true)
    expect(isForbidden('Astronomie', niche)).toBe(false)
  })

  it('matches whole words, not substrings', () => {
    /*
      The bug this pins: `key.includes(forbidden)` dropped anything CONTAINING
      the term. A channel forbidding "eu" lost "Neuseeland"; "bar" lost
      "Barcelona". It happens before measurement, so the only trace was a count
      in a note — the operator saw "3 dropped" and could not learn which.

      The existing test above passes either way, because it only ever tried a
      full-word match.
    */
    const short: NicheProfile = { ...niche, forbiddenTopics: ['eu', 'bar'] }

    expect(isForbidden('Neuseeland', short)).toBe(false)
    expect(isForbidden('Barcelona', short)).toBe(false)
    expect(isForbidden('Die EU und der Handel', short)).toBe(true)
    expect(isForbidden('Eine Bar in Berlin', short)).toBe(true)
  })

  it('still matches a multi-word forbidden entry inside a longer title', () => {
    const phrase: NicheProfile = { ...niche, forbiddenTopics: ['berlin marathon'] }
    expect(isForbidden('Der Berlin-Marathon 2026', phrase)).toBe(true)
  })
})

describe('breakdown', () => {
  it('reports the components alongside the total', () => {
    const result = scoreCandidate(
      candidate({
        title: 'Astronomie',
        signals: {
          viewsVariation: 0.2,
          monthsOfHistory: 12,
          ageDays: 3000,
          medianMonthlyViews: 50_000,
          referenceCount: 80,
        },
      }),
      niche,
    )

    expect(result.base).toBeGreaterThan(0)
    expect(result.base).toBeLessThanOrEqual(1)
    expect(result.score).toBeCloseTo(result.base * result.recencyMultiplier, 10)
  })
})
