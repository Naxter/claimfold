/**
 * Topic discovery.
 *
 * Scored candidates from live, free sources, in place of a hand-written list
 * of topic areas that goes stale and never learns anything.
 *
 * **What this uses, and what it refuses to.** Tier A is the default and needs
 * no keys: Wikimedia Pageviews (CC0), Google Trends' published RSS, and
 * GDELT's open DOC API. Tier B — DataForSEO, or YouTube's `videos.list`
 * against the `mostPopular` chart at one quota unit per call rather than
 * `search.list` at a hundred — is opt-in with the operator's own key and is
 * not implemented here.
 *
 * Deliberately absent, and each for a specific reason rather than squeamishness:
 *
 * - **Reddit.** Its API terms do not permit this use.
 * - **TikTok Research API.** Restricted to accredited research.
 * - **NewsAPI free tier.** Development use only; a self-hosted product a
 *   buyer runs is not development use.
 * - **pytrends and other unofficial clients.** They work by impersonating a
 *   browser against an endpoint that is not published. Shipping one means
 *   every install makes unauthorised requests on its operator's behalf.
 * - **Scrapers generally.** robots.txt and terms of service are the licence
 *   this product itself relies on being respected.
 *
 * The distinction that matters: everything here is either explicitly open
 * data or a feed published for programmatic consumption.
 */

export { discoverTopics, type DiscoverOptions, type DiscoveryRun } from './discover.ts'
export {
  prefilter,
  maintenanceTemplatesForLanguage,
  THRESHOLDS,
  YMYL_ENTITY_CLASSES,
} from './prefilter.ts'
export {
  scoreCandidate,
  durabilityScore,
  demandScore,
  factCheckabilityScore,
  nicheFitScore,
  recencyMultiplier,
  isRecommendedNicheFit,
  isForbidden,
  WEIGHTS,
  MAX_RECENCY_MULTIPLIER,
  MIN_RECOMMENDED_NICHE_FIT,
} from './score.ts'
export { sanitiseTitle, normaliseKey, MAX_TITLE_LENGTH } from './sanitise.ts'
export { projectForLanguage, summariseHistory } from './sources/wikimedia.ts'
export { geosForLanguage, parseTrendingRss } from './sources/google-trends.ts'
export { TRENDS_CACHE_ROOT, TTL, pruneTrendsCache } from './cache.ts'
export { userAgent, resetRateLimiter, MAX_REQUESTS_PER_MINUTE, SourceError } from './http.ts'
export type {
  NicheProfile,
  PrefilterVerdict,
  RejectionReason,
  RunNote,
  RunNoteCode,
  ScoreBreakdown,
  ScoredTopic,
  SourceName,
  SourceTier,
  TopicCandidate,
  TopicSignals,
  WikipediaArticle,
} from './types.ts'
