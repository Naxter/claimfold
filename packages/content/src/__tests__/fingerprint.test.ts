import { describe, expect, it } from 'vitest'

import { ideaFingerprint } from '../fingerprint.ts'

describe('ideaFingerprint', () => {
  it('is stable for the same premise', () => {
    const premise = 'Die Kugelgestalt der Erde war im Mittelalter Lehrmeinung.'
    expect(ideaFingerprint({ premise })).toBe(ideaFingerprint({ premise }))
  })

  it('ignores punctuation, casing and spacing', () => {
    expect(ideaFingerprint({ premise: 'Die Erde ist rund!' })).toBe(
      ideaFingerprint({ premise: '  die   erde ist  rund  ' }),
    )
  })

  it('separates genuinely different premises', () => {
    expect(ideaFingerprint({ premise: 'Die Erde ist rund.' })).not.toBe(
      ideaFingerprint({ premise: 'Die Erde ist flach.' }),
    )
  })

  it('keeps umlauts as content rather than stripping them to nothing', () => {
    // NFKD decomposition splits "ä" into "a" + a combining diaeresis. If the
    // filter were Latin-only, that mark would survive or the letter would be
    // dropped; either way two different German premises could collide.
    expect(ideaFingerprint({ premise: 'Wärme steigt auf.' })).not.toBe(
      ideaFingerprint({ premise: 'Wrme steigt auf.' }),
    )
  })

  it('is short enough to index and long enough not to collide', () => {
    const hash = ideaFingerprint({ premise: 'Irgendeine Behauptung.' })
    expect(hash).toHaveLength(32)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })
})
