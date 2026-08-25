/**
 * The individual upstreams, for diagnostics.
 *
 * A supported subpath rather than a traversal. `scripts/trends-probe.ts` needs
 * to call one source at a time — that is the whole point of a probe: when
 * discovery returns nothing, the question is *which* upstream went quiet, and
 * the orchestrated `discoverTopics` cannot answer it.
 *
 * It was reaching in as `../packages/trends/src/sources/wikimedia.ts`, which
 * bypassed the package's `exports` map entirely. That is worse than it looks:
 * it means the package could rearrange its own `src/` and silently break a
 * script, and it makes the public API a suggestion rather than a boundary.
 *
 * Kept out of the main entry point deliberately. These are raw upstream calls
 * with no rate-limit accounting beyond `http.ts`, no caching decisions and no
 * prefilter — the application should reach for `discoverTopics`, and this
 * subpath exists so a human debugging a run does not have to pretend otherwise.
 */

export { newsVolume } from './sources/gdelt.ts'
export {
  geosForLanguage,
  parseTrendingRss,
  trendingForLanguage,
  trendingNow,
} from './sources/google-trends.ts'
export {
  monthlyHistory,
  projectForLanguage,
  summariseHistory,
  topArticles,
} from './sources/wikimedia.ts'
export {
  articleFacts,
  entityFacts,
  entityIdsForTitles,
  resolveArticle,
  type EntityFacts,
} from './sources/wikipedia.ts'
