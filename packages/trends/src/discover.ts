import { maintenanceTemplatesForLanguage, prefilter } from './prefilter.ts'
import { normaliseKey, sanitiseTitle } from './sanitise.ts'
import { isForbidden, scoreCandidate } from './score.ts'
import { newsVolume } from './sources/gdelt.ts'
import { trendingForLanguage } from './sources/google-trends.ts'
import {
  monthlyHistory,
  projectForLanguage,
  summariseHistory,
  topArticles,
} from './sources/wikimedia.ts'
import {
  articleFacts,
  entityFacts,
  entityIdsForTitles,
  resolveArticle,
  type EntityFacts,
} from './sources/wikipedia.ts'
import type {
  NicheProfile,
  RunNote,
  RunNoteCode,
  ScoredTopic,
  TopicCandidate,
} from './types.ts'

/**
 * One discovery run.
 *
 * The order is chosen to spend the request budget where it changes an answer.
 * Free, broad sources gather a pool; the pool is deduplicated and cut to a
 * budget; only then is per-candidate measurement done; and the recency
 * lookup — which can only ever adjust a multiplier — runs last, for survivors
 * only. Measuring a candidate that the prefilter will reject is the one waste
 * worth engineering around, because at ten requests a minute each wasted call
 * is six seconds of an operator's afternoon.
 */

export interface DiscoverOptions {
  niche: NicheProfile
  /**
   * How many candidates get measured. Every one costs two requests, and the
   * rate limit is ten a minute, so this is the dial that sets how long a cold
   * run takes: 20 candidates is roughly four minutes.
   */
  budget?: number
  /** Progress for a long-running call. */
  onProgress?: (message: string) => void
  /**
   * Stop the run early.
   *
   * A discovery run is four or more minutes of rate-limited requests and there
   * was no way to end one. Checked between candidates rather than mid-request:
   * the remaining work is a loop of measurements, and abandoning a request
   * in flight would waste the rate-limit slot it already spent.
   *
   * An aborted run RETURNS what it has, with a note, rather than throwing.
   * Twenty minutes of measurement is worth keeping even when the operator
   * changed their mind about the twenty-first candidate.
   */
  signal?: AbortSignal
}

export interface DiscoveryRun {
  topics: ScoredTopic[]
  /**
   * What happened that the ranked list does not show — including every cap
   * applied. A run that quietly dropped half its pool reads exactly like a
   * thorough one, which is how a discovery tool starts lying by omission.
   */
  notes: RunNote[]
}

const DEFAULT_BUDGET = 20

/** Trending phrases resolved to articles. Each costs a request, so few. */
const MAX_TRENDING = 8

/** Niche seeds resolved to articles. Same cost, and they change rarely. */
const MAX_SEEDS = 12

export async function discoverTopics(options: DiscoverOptions): Promise<DiscoveryRun> {
  const { niche, signal } = options

  /*
    Validated, not trusted. `budget` is an exported option and was used as
    given: `0` measured nothing and returned an empty run that looked like "no
    good topics today", and `NaN` did the same via a silently false comparison.
    Both are configuration mistakes that should not be indistinguishable from an
    honest empty result.
  */
  const requested = options.budget ?? DEFAULT_BUDGET
  const budget =
    Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : DEFAULT_BUDGET
  const log = options.onProgress ?? (() => {})
  const notes: RunNote[] = []
  const note = (code: RunNoteCode, params: RunNote['params'], message: string) => {
    notes.push({ code, params, message })
  }

  const project = projectForLanguage(niche.language)
  const pool = new Map<string, TopicCandidate>()

  const add = (candidate: TopicCandidate) => {
    const key = normaliseKey(candidate.title)
    if (!key) return
    const existing = pool.get(key)
    if (existing) {
      // Same subject from a second source. Union the provenance rather than
      // keeping two rows: appearing in both places is a fact about the topic.
      for (const source of candidate.sources) {
        if (!existing.sources.includes(source)) existing.sources.push(source)
      }
      existing.article ??= candidate.article
      return
    }
    pool.set(key, candidate)
  }

  // ── Gather ────────────────────────────────────────────────────────────
  log('Reading the most-viewed Wikipedia articles')
  try {
    // Two days back: the aggregation lands a day or so behind, and asking for
    // a date that is not ready yet answers 404 rather than an empty list.
    for (const candidate of await topArticles(project, 2, 60)) add(candidate)
  } catch (error) {
    note(
      'sourceUnavailable',
      { source: 'Wikimedia top articles', reason: (error as Error).message },
      `Wikimedia top articles unavailable: ${(error as Error).message}`,
    )
  }

  log('Reading trending searches')
  let trending = new Set<string>()
  try {
    trending = await trendingForLanguage(niche.language)
  } catch (error) {
    note(
      'sourceUnavailable',
      { source: 'Google Trends', reason: (error as Error).message },
      `Google Trends unavailable: ${(error as Error).message}`,
    )
  }

  /*
    The trending phrases, keyed the same way candidate titles are.

    Comparing a raw search phrase against a resolved article title never
    matched; both sides go through `normaliseKey` so "Berlin Marathon" and
    "Berlin-Marathon" are the same key. See where this is read, further down.
  */
  const trendingKeys = new Set([...trending].map((phrase) => normaliseKey(phrase)))

  const trendingList = [...trending]
  if (trendingList.length > MAX_TRENDING) {
    note(
      'trendingCapped',
      { available: trendingList.length, used: MAX_TRENDING },
      `${trendingList.length} trending phrases were available; the first ${MAX_TRENDING} were ` +
        'looked up, because each costs a request against the rate limit.',
    )
  }

  for (const phrase of trendingList.slice(0, MAX_TRENDING)) {
    await addResolved(phrase, 'google-trends')
  }

  // The niche's own seeds go through the same resolution and the same scoring
  // as everything else, so the operator can see how their configured areas
  // actually measure up rather than taking them on faith. Resolving them costs
  // a request each — worth it, because a seed left unresolved would be refused
  // for "no article found", which says nothing about the seed and reads as the
  // tool rejecting the operator's own configuration.
  log('Measuring the niche’s own topic areas')
  for (const seed of niche.topicSeeds.slice(0, MAX_SEEDS)) {
    await addResolved(seed, 'seed')
  }
  if (niche.topicSeeds.length > MAX_SEEDS) {
    note(
      'seedsCapped',
      { available: niche.topicSeeds.length, used: MAX_SEEDS },
      `The niche lists ${niche.topicSeeds.length} topic areas; the first ${MAX_SEEDS} were ` +
        'looked up. Each costs a request against the rate limit.',
    )
  }

  /** Resolve a free-text phrase to an article so it can be measured like the rest. */
  async function addResolved(phrase: string, source: TopicCandidate['sources'][number]) {
    const title = sanitiseTitle(phrase)
    if (!title) return

    try {
      const resolved = await resolveArticle(project, title)
      add({
        key: resolved ? `${project}:${resolved}` : title,
        title: resolved ? resolved.replace(/_/g, ' ') : title,
        sources: [source],
        ...(resolved
          ? {
              article: {
                project,
                title: resolved,
                url: `https://${project.replace('.wikipedia', '.wikipedia.org')}/wiki/${encodeURIComponent(resolved)}`,
              },
            }
          : {}),
        signals: {},
      })
    } catch {
      // A phrase that will not resolve is normal, not an incident.
    }
  }

  // ── Cut to budget ─────────────────────────────────────────────────────
  const forbidden = [...pool.values()].filter((c) => isForbidden(c.title, niche))
  for (const c of forbidden) pool.delete(normaliseKey(c.title))
  if (forbidden.length) {
    note(
      'forbiddenDropped',
      { count: forbidden.length },
      `${forbidden.length} candidate(s) matched the niche's forbidden topics and were dropped ` +
        'before measurement.',
    )
  }

  // ── The free refusal, before the budget is spent ──────────────────────
  //
  // Two batched requests, and they change the character of the whole run. The
  // most-viewed list on any given day is dominated by people who were in the
  // news yesterday; without this, a budget of twenty is twenty measurements of
  // politicians and footballers, every one of them refused afterwards for
  // being a living person. Checking first turns that budget into twenty
  // subjects that could actually be written about.
  log('Checking which candidates are living people')
  const withArticles = [...pool.values()].filter((c) => c.article)
  let livingDropped = 0

  if (withArticles.length > 0) {
    try {
      const ids = await entityIdsForTitles(
        project,
        withArticles.map((c) => c.article!.title),
      )
      const claims = await entityFacts([...new Set(ids.values())])

      for (const candidate of withArticles) {
        const id = ids.get(candidate.article!.title.replace(/_/g, ' ').trim().toLowerCase())
        if (id && claims.get(id)?.isLivingPerson) {
          pool.delete(normaliseKey(candidate.title))
          livingDropped += 1
        }
      }
    } catch (error) {
      note(
        'livingCheckFailed',
        { reason: (error as Error).message },
        `The free living-person check could not run (${(error as Error).message}), so those ` +
          'candidates were measured and refused afterwards instead.',
      )
    }
  }

  if (livingDropped > 0) {
    note(
      'livingDropped',
      { count: livingDropped },
      `${livingDropped} candidate(s) were dropped before measurement because they are living ` +
        'people. This costs two requests and saves one per candidate, which is why the most-' +
        'viewed list does not simply fill the budget with whoever was in the news yesterday.',
    )
  }

  const all = [...pool.values()]
  // Candidates already carrying an article are measurable; the rest would
  // spend two requests to learn nothing. Ordering by that is not a quality
  // judgement, so it is stated in the notes rather than left implicit.
  const ordered = all.sort((a, b) => Number(Boolean(b.article)) - Number(Boolean(a.article)))
  const measured = ordered.slice(0, budget)

  if (all.length > measured.length) {
    note(
      'budgetCapped',
      { gathered: all.length, measured: measured.length },
      `${all.length} candidates were gathered and ${measured.length} were measured, the rest ` +
        `left for a later run. The budget exists because the rate limit is deliberately low; ` +
        `raise it and the run takes proportionally longer.`,
    )
  }

  // ── Measure ───────────────────────────────────────────────────────────
  const maintenanceNames = maintenanceTemplatesForLanguage(niche.language)
  const facts = new Map<string, Awaited<ReturnType<typeof articleFacts>>>()

  /** Set when the caller gave up; the run returns what it has. */
  let aborted = false

  for (const [index, candidate] of measured.entries()) {
    /*
      Checked between candidates, not mid-request. The remaining work is a loop
      of paced measurements, and abandoning one in flight would waste the
      rate-limit slot it already spent without finishing sooner.
    */
    if (signal?.aborted) {
      aborted = true
      note(
        'runAborted',
        { measured: index, planned: measured.length },
        `Stopped after ${index} of ${measured.length} candidates because the run was ` +
          `cancelled. What had already been measured is kept.`,
      )
      break
    }

    log(`Measuring ${index + 1} of ${measured.length}: ${candidate.title}`)
    if (!candidate.article) continue

    try {
      // Both go through the same rate limiter, which paces them; issuing them
      // together just avoids an idle round trip between the two.
      const [history, articleInfo] = await Promise.all([
        monthlyHistory(candidate.article.project, candidate.article.title),
        articleFacts(candidate.article.project, candidate.article.title),
      ])

      Object.assign(candidate.signals, summariseHistory(history))
      if (articleInfo) {
        facts.set(candidate.key, articleInfo)
        candidate.signals.referenceCount = articleInfo.externalLinkCount
        if (articleInfo.ageDays !== undefined) candidate.signals.ageDays = articleInfo.ageDays
      }
    } catch (error) {
      note(
        'measureFailed',
        { title: candidate.title, reason: (error as Error).message },
        `Could not measure "${candidate.title}": ${(error as Error).message}`,
      )
    }
  }

  /*
    One batched call covers every entity, so this is cheap regardless of budget.

    Wrapped, like every other source call in this file. It was the one that was
    not — so a single 5xx from wikidata.org that outlived the retry budget threw
    `SourceError` straight out of `discoverTopics`, the caller marked the job
    failed, and roughly twenty candidates' worth of rate-limited measurement was
    discarded. At ten requests a minute that is several minutes of an operator's
    wall clock, thrown away at the very last step, for a signal the prefilter
    already treats as optional.

    Explicitly typed. `new Map()` inferred `Map<any, any>`, and the ternary's
    union made `entities.get(...)` return `any` — which was then handed to
    `prefilter({ entity })` unchecked.
  */
  let entities = new Map<string, EntityFacts>()
  const entityIds = [...facts.values()]
    .map((f) => f?.entityId)
    .filter((id): id is string => typeof id === 'string')

  if (entityIds.length) {
    try {
      entities = await entityFacts(entityIds)
    } catch (error) {
      note(
        'sourceUnavailable',
        { source: 'wikidata', reason: (error as Error).message },
        `Could not reach Wikidata, so the living-person check was skipped: ${(error as Error).message}`,
      )
    }
  }

  // ── Judge ─────────────────────────────────────────────────────────────
  const results: ScoredTopic[] = []

  for (const candidate of measured) {
    const info = facts.get(candidate.key)
    const entity = info?.entityId ? entities.get(info.entityId) : undefined
    const flagged = (info?.templates ?? []).filter((template) =>
      maintenanceNames.some((name) => template.includes(name)),
    )

    const verdict = prefilter({
      title: candidate.title,
      signals: candidate.signals,
      hasArticle: Boolean(candidate.article),
      ...(entity ? { entity } : {}),
      maintenanceTemplates: flagged,
    })

    // Recency is a multiplier on a score, never a reason to keep something.
    // Looking it up for a rejected candidate would spend a request to change
    // a number nobody will read.
    if (verdict.ok && !aborted) {
      /*
        Matched on the normalised key, and on where the candidate came from.

        `trending` holds the raw search PHRASES from the RSS feed, lowercased.
        `candidate.title` is the resolved Wikipedia ARTICLE title — the phrase
        "berlin marathon" resolves to the article "Berlin-Marathon", so
        `trending.has('berlin-marathon')` was false and the flag almost never
        fired. Candidates from the Wikimedia top-articles list never matched
        either; only phrases whose article title happened to be
        character-identical landed.

        The flag is worth +0.2 of the +0.3 maximum boost, so in practice
        `recencyMultiplier` topped out at 1.1 while the constant, the type doc
        and the tests all describe 1.3.

        A candidate sourced from google-trends is trending by definition, which
        is cheaper and more reliable than matching strings at all.
      */
      candidate.signals.trending =
        candidate.sources.includes('google-trends') || trendingKeys.has(normaliseKey(candidate.title))
      const news = await newsVolume(candidate.title, niche.language)
      candidate.signals.gdeltArticleCount = news.articleCount
    }

    results.push({
      ...candidate,
      prefilter: verdict,
      score: scoreCandidate(candidate, niche),
    })
  }

  // Accepted first, then by score. A rejected candidate keeps its score so the
  // operator can see a good subject that was refused on one specific ground —
  // which is exactly the case worth a human overriding.
  results.sort((a, b) => {
    if (a.prefilter.ok !== b.prefilter.ok) return a.prefilter.ok ? -1 : 1
    return b.score.score - a.score.score
  })

  log('Done')
  return { topics: results, notes }
}
