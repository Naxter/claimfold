import { describe, expect, it } from 'vitest'

import { BUILT_IN_FORMATS, MAX_CAROUSEL_SLIDES, planSlides } from '../formats.ts'
import { PRESET_NICHES } from '../presets.ts'
import { validateNichePack } from '../schema.ts'

describe('built-in formats', () => {
  it('every preset validates', () => {
    for (const preset of PRESET_NICHES) {
      const result = validateNichePack(preset)
      if (!result.ok) {
        throw new Error(
          `Preset "${preset.slug}" is invalid:\n` +
            result.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n'),
        )
      }
      expect(result.ok).toBe(true)
    }
  })

  it('never exceeds the Instagram carousel cap', () => {
    // Ten is a hard API limit, not a style choice. A format that plans eleven
    // slides fails at publish time, after the reviewer has already approved it.
    for (const format of BUILT_IN_FORMATS) {
      expect(format.maxSlides).toBeLessThanOrEqual(MAX_CAROUSEL_SLIDES)
    }
  })

  it('opens every format with a hook', () => {
    for (const format of BUILT_IN_FORMATS) {
      expect(format.roles[0]?.id).toBe('hook')
    }
  })

  it('contains no topic-specific vocabulary', () => {
    // The guard rail for the whole product. If a format starts talking about
    // myths, recipes or portfolios, it has stopped being a shape and started
    // being a subject — and the app quietly stops working for other topics.
    const forbidden = [
      'myth',
      'recipe',
      'workout',
      'stock',
      'portfolio',
      'pet',
      'history',
      'germany',
      'crypto',
    ]
    const corpus = JSON.stringify(BUILT_IN_FORMATS).toLowerCase()

    for (const word of forbidden) {
      expect(corpus, `built-in formats mention "${word}"`).not.toContain(word)
    }
  })
})

describe('planSlides', () => {
  const ranking = BUILT_IN_FORMATS.find((f) => f.id === 'ranking')!

  it('expands repeatable roles to fill the requested length', () => {
    const result = planSlides(ranking, 8)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.roles).toHaveLength(8)
    expect(result.roles[0]).toBe('hook')
    expect(result.roles.at(-1)).toBe('cta')
    expect(result.roles.filter((r) => r === 'entry').length).toBeGreaterThan(1)
  })

  it('keeps fixed roles exactly once', () => {
    const result = planSlides(ranking, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    for (const fixed of ['hook', 'payoff', 'sources', 'cta']) {
      expect(result.roles.filter((r) => r === fixed)).toHaveLength(1)
    }
  })

  it('rejects counts outside the format bounds', () => {
    expect(planSlides(ranking, 2).ok).toBe(false)
    expect(planSlides(ranking, 11).ok).toBe(false)
  })

  it('produces a valid plan at every length the format allows', () => {
    for (const format of BUILT_IN_FORMATS) {
      for (let n = format.minSlides; n <= format.maxSlides; n += 1) {
        const result = planSlides(format, n)
        expect(result.ok, `${format.id} @ ${n} slides: ${result.ok ? '' : result.error}`).toBe(
          true,
        )
        if (result.ok) expect(result.roles).toHaveLength(n)
      }
    }
  })
})

describe('niche validation', () => {
  const base = PRESET_NICHES[0]!

  it('refuses to let a niche disable the fact-check gate', () => {
    // The floor exists so a shared or imported niche pack cannot quietly turn
    // the product into a slop generator.
    const result = validateNichePack({
      ...base,
      rules: { ...base.rules, minConfidence: 0.1 },
    })
    expect(result.ok).toBe(false)
  })

  it('catches requireSources without a sources slide', () => {
    const result = validateNichePack({
      ...base,
      rules: { ...base.rules, requireSources: true },
      formats: [
        {
          id: 'sourceless',
          name: 'Sourceless',
          description: 'A format with nowhere to put citations.',
          templateId: 'editorial',
          minSlides: 2,
          maxSlides: 4,
          roles: [
            { id: 'hook', purpose: 'Open the post with a hook line.' },
            { id: 'cta', purpose: 'Ask for the save.' },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => /sources/i.test(e.message))).toBe(true)
  })

  it('rejects malformed posting times', () => {
    const result = validateNichePack({
      ...base,
      cadence: { ...base.cadence, preferredTimes: ['6pm'] },
    })
    expect(result.ok).toBe(false)
  })

  it('reports every problem at once rather than the first', () => {
    const result = validateNichePack({ ...base, slug: 'NOT VALID', name: '' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThan(1)
  })
})
