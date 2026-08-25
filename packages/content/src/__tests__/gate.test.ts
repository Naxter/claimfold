import { describe, expect, it } from 'vitest'

import { PRESET_NICHES, validateNichePack, type NichePack } from '@claimfold/niches'

import { evaluateGate, type GateVerdict } from '../gate.ts'
import type { Draft } from '../schemas.ts'

/**
 * The gate decides whether something reaches a real audience. Until now it had
 * no tests at all — which is how it came to ship enforced only by a `disabled`
 * attribute on a button.
 */

const parsed = validateNichePack(PRESET_NICHES[0]!)
if (!parsed.ok) throw new Error('preset niche is invalid')
const NICHE: NichePack = parsed.pack // requireSources: true, minConfidence: 0.75

function verdict(overrides: Partial<GateVerdict> = {}): GateVerdict {
  return {
    claim: 'A checkable assertion.',
    verdict: 'supported',
    confidence: 0.9,
    reasoning: 'Two independent sources agree.',
    isCore: true,
    sources: [{ url: 'https://example.org/a', title: 'A Source' }],
    ...overrides,
  }
}

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    hook: 'A hook',
    caption: 'A caption',
    hashtags: ['one', 'two'],
    slides: [
      { role: 'hook', headline: 'A hook', altText: 'hook slide' },
      { role: 'pair', headline: 'Body', altText: 'body slide' },
      { role: 'sources', headline: 'Sources', altText: 'sources slide' },
      { role: 'cta', headline: 'Save it', altText: 'cta slide' },
    ],
    ...overrides,
  }
}

const ROLES = ['hook', 'pair', 'sources', 'cta']

describe('evaluateGate — factual integrity', () => {
  it('passes a well-sourced post', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft(),
      roles: ROLES,
    })
    expect(result.passed).toBe(true)
    expect(result.blocks).toHaveLength(0)
  })

  it('blocks a false core claim', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict({ verdict: 'false' })], caveats: [] },
      draft: draft(),
      roles: ROLES,
    })
    expect(result.passed).toBe(false)
    expect(result.blocks.some((b) => b.code === 'claim_false')).toBe(true)
  })

  it('only warns about a false INCIDENTAL claim', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: {
        verdicts: [verdict(), verdict({ verdict: 'false', isCore: false })],
        caveats: [],
      },
      draft: draft(),
      roles: ROLES,
    })
    expect(result.passed).toBe(true)
    expect(result.warnings.some((w) => w.code === 'claim_false')).toBe(true)
  })

  it('blocks a core claim below the niche confidence floor', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict({ confidence: 0.6 })], caveats: [] },
      draft: draft(),
      roles: ROLES,
    })
    expect(result.blocks.some((b) => b.code === 'claim_low_confidence')).toBe(true)
  })

  it('blocks an unverifiable core claim', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict({ verdict: 'unverifiable' })], caveats: [] },
      draft: draft(),
      roles: ROLES,
    })
    expect(result.blocks.some((b) => b.code === 'claim_unverifiable')).toBe(true)
  })

  it('blocks a core claim with no sources when the niche requires them', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict({ sources: [] })], caveats: [] },
      draft: draft(),
      roles: ROLES,
    })
    expect(result.blocks.some((b) => b.code === 'claim_unsourced')).toBe(true)
  })

  it('blocks a post that never went through verification', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [], caveats: [] },
      draft: draft(),
      roles: ROLES,
    })
    expect(result.blocks.some((b) => b.code === 'not_verified')).toBe(true)
  })
})

describe('evaluateGate — human override', () => {
  it('unblocks a claim a reviewer has resolved', () => {
    // Without a legitimate override, a true-but-unverifiable claim makes a post
    // permanently unpublishable, and the only way out is to bypass the gate.
    const result = evaluateGate({
      niche: NICHE,
      verification: {
        verdicts: [verdict({ verdict: 'false', resolvedBy: 'user_123' })],
        caveats: [],
      },
      draft: draft(),
      roles: ROLES,
    })
    expect(result.passed).toBe(true)
  })

  it('still surfaces the override as a warning', () => {
    // An invisible override is indistinguishable from having no gate at all.
    const result = evaluateGate({
      niche: NICHE,
      verification: {
        verdicts: [verdict({ verdict: 'unverifiable', resolvedBy: 'user_123' })],
        caveats: [],
      },
      draft: draft(),
      roles: ROLES,
    })
    expect(result.warnings.some((w) => w.code === 'claim_resolved_by_human')).toBe(true)
  })
})

describe('evaluateGate — publishability', () => {
  it('blocks a missing alt text', () => {
    const d = draft()
    d.slides[1]!.altText = ''
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: d,
      roles: ROLES,
    })
    expect(result.blocks.some((b) => b.code === 'missing_alt_text')).toBe(true)
  })

  it('blocks an over-length caption', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft({ caption: 'x'.repeat(2_201) }),
      roles: ROLES,
    })
    expect(result.blocks.some((b) => b.code === 'caption_too_long')).toBe(true)
  })

  it('blocks a carousel outside 2–10 slides', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft({ slides: [{ role: 'hook', altText: 'only one' }] }),
      roles: ['hook'],
    })
    expect(result.blocks.some((b) => b.code === 'slide_count')).toBe(true)
  })

  it('blocks a missing sources slide when the niche requires sources', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft({
        slides: [
          { role: 'hook', altText: 'a' },
          { role: 'pair', altText: 'b' },
          { role: 'cta', altText: 'c' },
        ],
      }),
      roles: ['hook', 'pair', 'cta'],
    })
    expect(result.blocks.some((b) => b.code === 'missing_sources_slide')).toBe(true)
  })

  it('blocks too many hashtags', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft({ hashtags: Array.from({ length: 31 }, (_, i) => `tag${i}`) }),
      roles: ROLES,
    })
    expect(result.blocks.some((b) => b.code === 'too_many_hashtags')).toBe(true)
  })
})

/**
 * Hand edits.
 *
 * The gate cannot tell whether a rewritten slide is now wrong — only that its
 * words changed after its claims were looked up. That is a warning rather than a
 * block on purpose: a named person taking editorial responsibility is a
 * legitimate outcome, and it is the same answer this gate already gives an
 * overridden verdict. What matters is that the warning appears when it should
 * and stays quiet when it should not, because a finding that cries wolf is worse
 * than no finding at all.
 */
describe('evaluateGate — hand edits', () => {
  const CHECKED = new Date('2026-07-26T10:00:00Z')

  it('warns about a slide edited after its claims were looked up', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft(),
      roles: ROLES,
      verifiedAt: CHECKED,
      edits: [{ slideIndex: 1, editedAt: new Date('2026-07-26T11:00:00Z') }],
    })

    const found = result.warnings.find((w) => w.code === 'slide_edited_after_check')
    expect(found).toBeDefined()
    // Carries the index so the review screen can link straight to that editor.
    expect(found?.slideIndex).toBe(1)
    // A warning, so the post is still approvable by a person who accepts it.
    expect(result.passed).toBe(true)
  })

  it('says nothing about an edit made before the claims were looked up', () => {
    // Re-checking a post after editing it is the intended way to clear this, so
    // an edit that predates the check must not keep warning forever.
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft(),
      roles: ROLES,
      verifiedAt: CHECKED,
      edits: [{ slideIndex: 1, editedAt: new Date('2026-07-26T09:00:00Z') }],
    })

    expect(result.warnings.some((w) => w.code === 'slide_edited_after_check')).toBe(false)
  })

  it('says nothing when no slide was edited', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft(),
      roles: ROLES,
      verifiedAt: CHECKED,
    })

    expect(result.warnings.some((w) => w.code === 'slide_edited_after_check')).toBe(false)
  })

  it('stays quiet on a post that was never verified, which already blocks', () => {
    // `not_verified` is the finding that matters there. A second one about edits
    // would add noise to a screen with one important sentence on it.
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [], caveats: [] },
      draft: draft(),
      roles: ROLES,
      edits: [{ slideIndex: 0, editedAt: new Date('2026-07-26T11:00:00Z') }],
    })

    expect(result.blocks.some((b) => b.code === 'not_verified')).toBe(true)
    expect(result.warnings.some((w) => w.code === 'slide_edited_after_check')).toBe(false)
  })
})

/**
 * Reordering.
 *
 * Slide one is the only slide most people ever see, and every format opens with
 * a hook. Rearranging by hand can undo that — but it is the operator's carousel,
 * so this warns rather than refusing.
 */
describe('evaluateGate — hand-built structure', () => {
  it('warns when the carousel no longer opens with the hook', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft({
        slides: [
          { role: 'pair', headline: 'Body', altText: 'body slide' },
          { role: 'hook', headline: 'A hook', altText: 'hook slide' },
          { role: 'sources', headline: 'Sources', altText: 'sources slide' },
          { role: 'cta', headline: 'Save it', altText: 'cta slide' },
        ],
      }),
      roles: ['pair', 'hook', 'sources', 'cta'],
    })

    expect(result.warnings.some((w) => w.code === 'hook_not_first')).toBe(true)
    expect(result.passed).toBe(true)
  })

  it('does not warn about a normal carousel', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft(),
      roles: ROLES,
    })

    expect(result.warnings.some((w) => w.code === 'hook_not_first')).toBe(false)
  })
})

/**
 * Whether the post can physically be published.
 *
 * The only findings here that are not an editorial judgement. Every other block
 * describes something a person could take responsibility for; a post with no
 * account cannot be published by anybody, so it blocks and there is no override.
 */
describe('evaluateGate — somewhere to publish', () => {
  it('blocks when no account is resolved', () => {
    // The bug this closes: approving was allowed, the worker then failed without
    // writing anything, and the post was retried every tick forever in silence.
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft(),
      roles: ROLES,
      account: null,
    })

    expect(result.blocks.some((b) => b.code === 'no_account')).toBe(true)
    expect(result.passed).toBe(false)
  })

  it('blocks when the account exists but is not connected', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft(),
      roles: ROLES,
      account: { username: 'wissen', status: 'token_expired' },
    })

    const found = result.blocks.find((b) => b.code === 'account_not_connected')
    expect(found).toBeDefined()
    // Names the handle, because an operator with several accounts needs to know
    // which one to reconnect.
    expect(found?.params?.['username']).toBe('wissen')
  })

  it('passes with a connected account', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft(),
      roles: ROLES,
      account: { username: 'wissen', status: 'connected' },
    })

    expect(result.passed).toBe(true)
  })

  it('says nothing when the caller is not asking about publishability', () => {
    /*
      `undefined` rather than `null` — the pipeline evaluates this gate before an
      account is part of the question, and a block it cannot act on would stop
      generation itself. The distinction between "did not ask" and "asked and
      found none" is the whole reason this is not a boolean.
    */
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft(),
      roles: ROLES,
    })

    expect(result.blocks.some((b) => b.code.startsWith('account') || b.code === 'no_account')).toBe(
      false,
    )
    expect(result.passed).toBe(true)
  })
})

/**
 * The advertising label, a rule nothing could ever trigger.
 *
 * Every channel carries `requireAdLabel` and this gate has always checked it, but
 * `hasCommercialLink` was never set by anything — so `ad_label_required` could
 * not fire, and a German operator relying on that § 5a UWG safeguard had one that
 * never went off. The dashboard now looks for a link in the caption, the first
 * comment and the slides.
 */
describe('evaluateGate — advertising label', () => {
  it('warns when a post carries a link and the channel wants it labelled', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft(),
      roles: ROLES,
      hasCommercialLink: true,
    })

    expect(result.warnings.some((w) => w.code === 'ad_label_required')).toBe(true)
    // A warning: labelling is the operator's legal duty, not something software
    // can verify has been done.
    expect(result.passed).toBe(true)
  })

  it('stays quiet on a post with no link', () => {
    const result = evaluateGate({
      niche: NICHE,
      verification: { verdicts: [verdict()], caveats: [] },
      draft: draft(),
      roles: ROLES,
      hasCommercialLink: false,
    })

    expect(result.warnings.some((w) => w.code === 'ad_label_required')).toBe(false)
  })
})
