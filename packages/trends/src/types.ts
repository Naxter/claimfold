/**
 * Topic discovery types.
 *
 * The product's premise is that a post is only worth making if its claims can
 * be sourced. Topic discovery is the same idea moved one stage earlier: pick
 * subjects that are *checkable* and will still be true next year, rather than
 * whatever is loudest today. Every signal below exists to serve that ordering.
 */

/** Where a candidate came from. A topic surfaced by several sources is stronger. */
export type SourceName = 'wikimedia' | 'google-trends' | 'gdelt' | 'seed'

/** Tier A is free and keyless. Tier B needs the operator's own API key. */
export type SourceTier = 'A' | 'B'

export interface WikipediaArticle {
  /** Wikimedia project, e.g. `de.wikipedia`. */
  project: string
  /** Canonical article title, underscores and all. */
  title: string
  url: string
}

/**
 * Everything measured about a candidate.
 *
 * All optional: a candidate that only ever appeared in a trends feed has no
 * Wikipedia article and therefore no pageview history, and that absence is
 * itself informative — the scorer treats a missing signal as its worst value
 * rather than skipping the component, so an unmeasurable topic cannot
 * outrank a measured one by default.
 */
export interface TopicSignals {
  /** Median views per month over the window. Robust to one viral month. */
  medianMonthlyViews?: number
  /** Views in the most recent complete month. */
  recentMonthlyViews?: number
  /**
   * Coefficient of variation of the monthly series (standard deviation over
   * mean). Near zero means steady interest; high means spiky.
   */
  viewsVariation?: number
  /** How many complete months of pageview history were returned. */
  monthsOfHistory?: number
  /** External links on the article, used as a proxy for citation density. */
  referenceCount?: number
  /** Age of the article in days, from its first revision. */
  ageDays?: number
  /** Set when one month dominates the series — the shape of a news event. */
  dominantSpike?: { month: string; share: number; ageDays: number }
  /** Currently in a Google Trends trending feed. */
  trending?: boolean
  /** Recent news articles matching the topic, per GDELT. */
  gdeltArticleCount?: number
}

export interface TopicCandidate {
  /** Stable identity across runs. Article title when there is one, else the phrase. */
  key: string
  /** Human-readable subject, sanitised for prompt use. */
  title: string
  sources: SourceName[]
  article?: WikipediaArticle
  signals: TopicSignals
}

export interface ScoreBreakdown {
  durability: number
  demand: number
  factCheckability: number
  nicheFit: number
  /** Weighted sum of the four components, 0 to 1. */
  base: number
  /** 1.0 to 1.3. Multiplies `base`; never subtracts and never rejects. */
  recencyMultiplier: number
  /** `base * recencyMultiplier`, so the range is 0 to 1.3. */
  score: number
}

export type RejectionReason =
  | 'too-few-references'
  | 'disputed-or-outdated'
  | 'living-person'
  | 'ymyl'
  | 'too-new'
  | 'single-recent-spike'
  | 'no-article'

export interface PrefilterVerdict {
  ok: boolean
  reasons: RejectionReason[]
  /** Human-readable, for showing the operator why something was dropped. */
  detail: string[]
}

export interface ScoredTopic extends TopicCandidate {
  score: ScoreBreakdown
  prefilter: PrefilterVerdict
}

/** Every distinct thing a run can report about itself. */
export type RunNoteCode =
  | 'sourceUnavailable'
  | 'trendingCapped'
  | 'seedsCapped'
  | 'forbiddenDropped'
  | 'livingCheckFailed'
  | 'livingDropped'
  | 'budgetCapped'
  | 'measureFailed'
  /** The caller cancelled part-way; the run returns what it had measured. */
  | 'runAborted'

/**
 * Something the run did that its ranked list cannot show.
 *
 * Shaped like a gate issue, and for the same reason: the dashboard is read in
 * four languages, so a note has to be a code and its numbers, not a finished
 * English sentence. The English prose is kept alongside because it is the
 * durable record — it is what a job payload still holds months later — and
 * because a language with no phrasing for a code must fall back to something
 * true rather than render nothing.
 */
export interface RunNote {
  code: RunNoteCode
  params: Record<string, string | number>
  /** English prose. Never discarded; only overridden for display. */
  message: string
}

/** What the niche contributes to scoring. Kept minimal so `packages/trends` never imports niches. */
export interface NicheProfile {
  /** BCP-47. Selects the Wikipedia project and the trends geographies. */
  language: string
  /** Existing topic areas, used for the fit component. */
  topicSeeds: string[]
  /** Free text describing the niche. Adds vocabulary to the fit component. */
  description: string
  /** Subjects the niche refuses outright. Matched candidates are dropped, not scored. */
  forbiddenTopics: string[]
}
