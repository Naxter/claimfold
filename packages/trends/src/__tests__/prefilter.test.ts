import { describe, expect, it } from 'vitest'

import { prefilter, THRESHOLDS } from '../prefilter.ts'
import { summariseHistory } from '../sources/wikimedia.ts'
import type { TopicSignals } from '../types.ts'

const healthy: TopicSignals = {
  referenceCount: 60,
  ageDays: 2000,
  monthsOfHistory: 12,
  viewsVariation: 0.2,
  medianMonthlyViews: 40_000,
}

describe('prefilter', () => {
  it('accepts a well-established, densely sourced article', () => {
    const verdict = prefilter({ title: 'Mittelalter', signals: healthy, hasArticle: true })
    expect(verdict.ok).toBe(true)
    expect(verdict.reasons).toEqual([])
  })

  it('refuses a thinly sourced article', () => {
    const verdict = prefilter({
      title: 'Obskur',
      signals: { ...healthy, referenceCount: THRESHOLDS.minExternalLinks - 1 },
      hasArticle: true,
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons).toContain('too-few-references')
  })

  it('refuses a living person', () => {
    const verdict = prefilter({
      title: 'Eine lebende Person',
      signals: healthy,
      hasArticle: true,
      entity: { isHuman: true, isLivingPerson: true, instanceOf: ['Q5'] },
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons).toContain('living-person')
  })

  it('accepts a historical person, who is not a living one', () => {
    const verdict = prefilter({
      title: 'Johannes Kepler',
      signals: healthy,
      hasArticle: true,
      entity: { isHuman: true, isLivingPerson: false, instanceOf: ['Q5'] },
    })
    expect(verdict.ok).toBe(true)
  })

  it('refuses YMYL subjects by entity class and by wording', () => {
    const byClass = prefilter({
      title: 'Etwas Medizinisches',
      signals: healthy,
      hasArticle: true,
      entity: { isHuman: false, isLivingPerson: false, instanceOf: ['Q12136'] },
    })
    const byWord = prefilter({
      title: 'Diabetes Typ 2',
      signals: healthy,
      hasArticle: true,
    })

    expect(byClass.reasons).toContain('ymyl')
    expect(byWord.reasons).toContain('ymyl')
  })

  it('refuses an article younger than the floor', () => {
    const verdict = prefilter({
      title: 'Frisch angelegt',
      signals: { ...healthy, ageDays: THRESHOLDS.minAgeDays - 1 },
      hasArticle: true,
    })
    expect(verdict.reasons).toContain('too-new')
  })

  it('refuses a recent one-month spike but forgives an old one', () => {
    const recent = prefilter({
      title: 'Nachrichtenereignis',
      signals: { ...healthy, dominantSpike: { month: '2026-06', share: 0.7, ageDays: 40 } },
      hasArticle: true,
    })
    const old = prefilter({
      title: 'Altes Ereignis',
      signals: { ...healthy, dominantSpike: { month: '2024-01', share: 0.7, ageDays: 900 } },
      hasArticle: true,
    })

    expect(recent.reasons).toContain('single-recent-spike')
    expect(old.reasons).not.toContain('single-recent-spike')
  })

  it('refuses a candidate with no article, since nothing could be checked for free', () => {
    const verdict = prefilter({ title: 'Eine Suchphrase', signals: {}, hasArticle: false })
    expect(verdict.reasons).toContain('no-article')
  })

  it('reports every reason rather than stopping at the first', () => {
    // A topic refused on one marginal ground deserves a human look; one
    // refused on four does not. That difference is only visible if the check
    // does not short-circuit.
    const verdict = prefilter({
      title: 'Krebs bei einer lebenden Person',
      signals: { referenceCount: 2, ageDays: 10 },
      hasArticle: true,
      entity: { isHuman: true, isLivingPerson: true, instanceOf: ['Q5'] },
    })

    expect(verdict.reasons.length).toBeGreaterThanOrEqual(4)
    expect(verdict.detail.length).toBe(verdict.reasons.length)
  })

  it('flags an article its own editors marked as disputed', () => {
    const verdict = prefilter({
      title: 'Umstritten',
      signals: healthy,
      hasArticle: true,
      maintenanceTemplates: ['vorlage:belege fehlen'],
    })
    expect(verdict.reasons).toContain('disputed-or-outdated')
  })
})

describe('summariseHistory', () => {
  it('detects a single dominant month', () => {
    const months = [
      { month: '2025-08', views: 100 },
      { month: '2025-09', views: 100 },
      { month: '2025-10', views: 5_000 },
      { month: '2025-11', views: 120 },
    ]

    const summary = summariseHistory({ months })
    expect(summary.dominantSpike?.month).toBe('2025-10')
    expect(summary.dominantSpike!.share).toBeGreaterThan(0.5)
  })

  it('leaves a flat series unflagged', () => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: `2025-${String(i + 1).padStart(2, '0')}`,
      views: 1_000,
    }))

    const summary = summariseHistory({ months })
    expect(summary.dominantSpike).toBeUndefined()
    expect(summary.viewsVariation).toBeCloseTo(0, 5)
    expect(summary.medianMonthlyViews).toBe(1_000)
  })

  it('survives an empty series without dividing by zero', () => {
    const summary = summariseHistory({ months: [] })
    expect(summary.monthsOfHistory).toBe(0)
    // The exact value, not merely "a number". `Number.isFinite` passes for
    // anything at all, including a 0 that would read as a perfectly steady
    // series — the opposite of what an empty one should score.
    expect(summary.viewsVariation).toBe(1)
    expect(summary.medianMonthlyViews).toBe(0)
    expect(summary.recentMonthlyViews).toBe(0)
  })
})
