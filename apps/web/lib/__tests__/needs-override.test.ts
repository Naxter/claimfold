import { describe, expect, it } from 'vitest'

import { needsOverride } from '../gate.ts'

/**
 * The claim-level escape hatch, and the case it used to miss.
 *
 * `claim_unsourced` blocks approval whenever a channel requires sources and a
 * core claim has none. The override form on the review screen is the only thing
 * that can clear it — nothing writes `claims.sources` after generation — and it
 * was shown only when the verdict was bad or the confidence low. A claim that was
 * `supported`, above the floor and sourceless therefore blocked the post with no
 * control anywhere to resolve it: a permanently unpublishable post, presented
 * with a green badge saying the sources agreed.
 */

const STRICT = { minConfidence: 0.75, requireSources: true }
const RELAXED = { minConfidence: 0.75, requireSources: false }

const sourced = { verdict: 'supported', confidence: 0.9, sources: [{ url: 'https://example.org' }] }

describe('needsOverride', () => {
  it('leaves a well-sourced, confident claim alone', () => {
    expect(needsOverride(sourced, STRICT)).toBe(false)
  })

  it('asks for one when the sources disagree or contradict', () => {
    for (const verdict of ['disputed', 'false', 'unverifiable']) {
      expect(needsOverride({ ...sourced, verdict }, STRICT), verdict).toBe(true)
    }
  })

  it('asks for one below the channel’s confidence floor', () => {
    expect(needsOverride({ ...sourced, confidence: 0.55 }, STRICT)).toBe(true)
  })

  it('asks for one when a required source is missing — the case that was a dead end', () => {
    expect(needsOverride({ ...sourced, sources: [] }, STRICT)).toBe(true)
  })

  it('does not ask when the channel never wanted sources', () => {
    // `claim_unsourced` cannot fire on that channel, so demanding an override
    // would be asking somebody to justify passing a check that never ran.
    expect(needsOverride({ ...sourced, sources: [] }, RELAXED)).toBe(false)
  })
})
