// `prefilter` imports nothing from this module, so this is not a cycle. The
// threshold is editorial policy and belongs in one place — see `spikeShare`,
// which was copied into wikimedia.ts and drifted.
import { THRESHOLDS } from './prefilter.ts'
import { normaliseKey } from './sanitise.ts'
import type { NicheProfile, ScoreBreakdown, TopicCandidate } from './types.ts'

/**
 * Ranking candidates.
 *
 * The weights encode an editorial position, so they are stated once and
 * commented rather than tuned quietly:
 *
 * - **Durability, 0.40.** The largest weight, because the product's cost
 *   structure demands it. A post costs about $0.43 to produce and takes a
 *   human review to publish; a subject that is uninteresting in a month wastes
 *   both. This is also the component that separates this from a trend chaser.
 * - **Demand, 0.25.** Someone has to want to read it. Second, not first.
 * - **Fact-checkability, 0.20.** Whether the verifier will find anything to
 *   cite. A topic that cannot be sourced fails the gate later at full price.
 * - **Niche fit, 0.15.** The smallest, deliberately: an operator who only
 *   ever sees topics they have already thought of gets no value from
 *   discovery at all.
 *
 * The recency multiplier sits outside the sum and can only multiply upward,
 * between 1.0 and 1.3. Something newly in the news gets a nudge up the list;
 * nothing is ever rejected for being old, and nothing reaches the top on
 * recency alone.
 */

export const WEIGHTS = {
  durability: 0.4,
  demand: 0.25,
  factCheckability: 0.2,
  nicheFit: 0.15,
} as const

export const MAX_RECENCY_MULTIPLIER = 1.3

/**
 * A topic is recommended only when it shares at least one meaningful channel
 * term. Zero-fit subjects remain useful discovery material, but labelling them
 * as recommendations makes the score's intentionally small fit weight read as
 * a product promise it never made.
 *
 * **What this threshold does in practice, measured rather than assumed.**
 * Scoring twenty realistic German Wikipedia titles against the shipped
 * `Wissen & Irrtümer` preset put sixteen of them at exactly 0.00. The four
 * that scored were the four whose titles literally repeat a seed word —
 * Kartografie, Astronomie, Etymologie, Mythologie. Every proper noun, which is
 * what a pageview ranking is mostly made of, scored zero: Neuschwanstein,
 * Bernsteinzimmer, Bismarck, Sonnenfinsternis. That matches what two real
 * discovery runs produced, where the component came back 0 on all twenty
 * candidates and the recommendation list would have been empty.
 *
 * So the split below is honest about what the number means, and it is NOT a
 * fix for the number. `nicheFitScore` needs a whole-word match against a
 * vocabulary drawn from the seeds and description, and the subjects worth
 * posting about are named after people and places rather than after their
 * field. Anything that changes this — stemming, substring matching on the
 * longer tokens, or the embedding model the function's own comment points at —
 * belongs in `nicheFitScore`, and this constant should not be lowered to
 * compensate. A threshold tuned until the list looks full is a threshold that
 * has stopped meaning anything.
 */
export const MIN_RECOMMENDED_NICHE_FIT = 0.25

export function isRecommendedNicheFit(nicheFit: number | undefined): boolean {
  return (nicheFit ?? 0) >= MIN_RECOMMENDED_NICHE_FIT
}

/** Clamp to the unit interval. Every component is defined on 0..1. */
function unit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/**
 * Map a count onto 0..1 logarithmically.
 *
 * Linear normalisation would let one enormous article flatten every other
 * candidate to nearly zero. Attention is distributed by power law; the scale
 * that measures it should be too.
 */
function logScore(value: number, full: number): number {
  if (value <= 0) return 0
  return unit(Math.log10(1 + value) / Math.log10(1 + full))
}

/**
 * Will this still be worth reading next year?
 *
 * Three ingredients: how steady the interest is, how much history exists to
 * judge that from, and how long the article has been around. A missing series
 * scores zero rather than being skipped — an unmeasurable topic should not
 * float up the list by having no evidence against it.
 */
export function durabilityScore(candidate: TopicCandidate): number {
  const { viewsVariation, monthsOfHistory, ageDays, dominantSpike } = candidate.signals

  if (monthsOfHistory === undefined || monthsOfHistory === 0) return 0

  /*
    Coefficient of variation: 0 is perfectly flat, 1 is as spread as its own
    mean. Anything above 1 is noise, so it bottoms out there.

    A NEGATIVE value is not possible from a real series — it is a standard
    deviation over a mean, both non-negative — so it means the number did not
    come from a measurement. `unit()` alone clamped it to 0, which then read as
    *perfectly steady*: the single best possible durability signal, awarded for
    nonsense. Unmeasured is treated as worst-case, the same as absent.
  */
  const variation = viewsVariation === undefined || viewsVariation < 0 ? 1 : viewsVariation
  const steadiness = 1 - unit(variation)
  const depth = unit(monthsOfHistory / 12)
  // Two years old is treated as fully established. Beyond that, more age says
  // nothing extra about whether the subject holds up.
  const age = unit((ageDays ?? 0) / 730)

  // A spike that survived the prefilter — older than 90 days — still says the
  // subject's interest was concentrated rather than sustained.
  const spikePenalty = dominantSpike ? 0.8 : 1

  return unit((0.5 * steadiness + 0.3 * depth + 0.2 * age) * spikePenalty)
}

/**
 * Does anyone want to read it?
 *
 * Median monthly views, not the most recent month: the question is whether
 * this is normally of interest, not whether it happened to be last month.
 * 200k monthly views is treated as the top of the scale — well above what a
 * typical solid article gets, so genuinely major subjects separate from the
 * merely popular.
 */
export function demandScore(candidate: TopicCandidate): number {
  return logScore(candidate.signals.medianMonthlyViews ?? 0, 200_000)
}

/**
 * Will the verifier find anything to cite?
 *
 * External links are the proxy (see `ArticleFacts.externalLinkCount`). The
 * prefilter already refused anything under `THRESHOLDS.minExternalLinks`, so
 * this component grades what is left.
 *
 * The scale starts at that floor rather than at zero. It used to run
 * `logScore(links, 150)` straight from zero while the comment claimed "15 links
 * is a bare pass" — but `logScore(15, 150)` is 0.553, so an article scraping
 * through the prefilter was scored as better than average. Rebasing means a
 * bare pass really is near the bottom of this component, which is what the
 * sentence always said.
 */
export function factCheckabilityScore(candidate: TopicCandidate): number {
  const links = candidate.signals.referenceCount ?? 0
  const floor = THRESHOLDS.minExternalLinks
  if (links <= floor) return 0
  return logScore(links - floor, 150 - floor)
}

/**
 * How close is this to what the channel is about?
 *
 * Word overlap against the niche's own seeds and description. Crude, and
 * knowingly so: the alternative is an embedding model or an LLM call per
 * candidate, which turns a free discovery run into a paid one. It carries the
 * smallest weight for exactly this reason, and it is the component most worth
 * replacing later.
 */
export function nicheFitScore(candidate: TopicCandidate, niche: NicheProfile): number {
  const vocabulary = vocabularyFor(niche)
  if (vocabulary.size === 0) return 0.5

  const words = normaliseKey(candidate.title)
    .split(' ')
    .filter((word) => word.length > 3)
  if (words.length === 0) return 0

  const hits = words.filter((word) => vocabulary.has(word)).length
  /*
    One matching word out of a two-word title is a strong signal; requiring
    full overlap would score almost everything at zero.

    The denominator saturates at 2, which is deliberate but worth naming: a
    ten-word title sharing two words with the channel scores a perfect 1.0, the
    same as a two-word title that matches both. Long titles therefore get full
    marks cheaply. Acceptable while this carries the smallest weight and is
    explicitly the crudest component; it would not be if the weight went up.
  */
  return unit(hits / Math.min(words.length, 2))
}

/**
 * The channel's vocabulary, cached per profile object.
 *
 * Rebuilt for every candidate before — same Set, same inputs, once per topic in
 * the pool. A `WeakMap` keyed on the profile keeps it to once per run without
 * changing any call site or holding the profile alive.
 */
const vocabularyCache = new WeakMap<NicheProfile, Set<string>>()

function vocabularyFor(niche: NicheProfile): Set<string> {
  const cached = vocabularyCache.get(niche)
  if (cached) return cached

  const vocabulary = new Set(
    [...niche.topicSeeds, niche.description]
      .flatMap((text) => normaliseKey(text).split(' '))
      .filter((word) => word.length > 3),
  )
  vocabularyCache.set(niche, vocabulary)
  return vocabulary
}

/**
 * The boost, never a gate.
 *
 * Trending presence is worth more than news volume because it measures what
 * people are actively looking up rather than what publishers are writing.
 * Both together cap at 1.3.
 */
export function recencyMultiplier(candidate: TopicCandidate): number {
  let bonus = 0
  if (candidate.signals.trending) bonus += 0.2
  bonus += 0.1 * logScore(candidate.signals.gdeltArticleCount ?? 0, 50)
  return Math.min(MAX_RECENCY_MULTIPLIER, 1 + bonus)
}

export function scoreCandidate(
  candidate: TopicCandidate,
  niche: NicheProfile,
): ScoreBreakdown {
  const durability = durabilityScore(candidate)
  const demand = demandScore(candidate)
  const factCheckability = factCheckabilityScore(candidate)
  const nicheFit = nicheFitScore(candidate, niche)

  const base =
    WEIGHTS.durability * durability +
    WEIGHTS.demand * demand +
    WEIGHTS.factCheckability * factCheckability +
    WEIGHTS.nicheFit * nicheFit

  const multiplier = recencyMultiplier(candidate)

  return {
    durability,
    demand,
    factCheckability,
    nicheFit,
    base,
    recencyMultiplier: multiplier,
    // Not clamped to 1. Clamping would flatten the ordering of everything that
    // scores well AND is topical, which is precisely the set worth ranking.
    score: base * multiplier,
  }
}

/**
 * True when the niche has said, in its own words, not to go there.
 *
 * Matches whole words, not substrings.
 *
 * `key.includes(forbidden)` looked reasonable and quietly destroyed unrelated
 * candidates: a channel forbidding `eu` dropped "Neuseeland"; `bar` dropped
 * "Barcelona"; `kunst` dropped "Kunststoff". And it happens BEFORE anything is
 * measured, so the only trace is a count in the `forbiddenDropped` note — the
 * operator sees "3 candidates dropped" with no way to learn which three or why.
 *
 * `normaliseKey` already collapses everything to space-separated tokens, so
 * padding both sides is all a word-boundary test needs. Multi-word forbidden
 * entries still work: " berlin marathon " is a substring of " the berlin
 * marathon route ".
 */
export function isForbidden(title: string, niche: NicheProfile): boolean {
  const key = ` ${normaliseKey(title)} `
  return niche.forbiddenTopics.some((topic) => {
    const forbidden = normaliseKey(topic)
    return forbidden.length > 0 && key.includes(` ${forbidden} `)
  })
}
