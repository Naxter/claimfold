import { TTL, withCache } from '../cache.ts'
import { fetchJson } from '../http.ts'

/**
 * GDELT DOC 2.0 — how much the news is currently saying about a subject.
 *
 * Tier A: open, keyless, and documented for programmatic use. It answers one
 * narrow question — is anyone writing about this right now? — which feeds the
 * recency multiplier and nothing else.
 *
 * Deliberately not used for anything that decides whether a topic is any
 * good. News volume measures attention, and attention is exactly the signal
 * this product refuses to optimise for on its own. A subject with a thousand
 * articles and no sourceable claim still fails the gate later; boosting it
 * here would only mean paying for the verification that rejects it.
 */

const DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc'

interface DocResponse {
  articles?: Array<{ title?: string; url?: string; seendate?: string }>
}

/** Rough language filter. GDELT expects English names, not BCP-47 tags. */
const LANGUAGE_NAMES: Record<string, string> = {
  de: 'german',
  en: 'english',
  fr: 'french',
  es: 'spanish',
  it: 'italian',
  nl: 'dutch',
  pt: 'portuguese',
}

export interface NewsVolume {
  articleCount: number
  /** A few headlines, shown to the operator as evidence rather than used for scoring. */
  sampleTitles: string[]
}

/**
 * Article count for a phrase over the last week.
 *
 * The query is quoted so a multi-word subject is matched as a phrase rather
 * than as loose keywords, which otherwise returns the whole news cycle for
 * anything containing a common word.
 */
export async function newsVolume(phrase: string, language: string): Promise<NewsVolume> {
  const base = language.toLowerCase().split('-')[0] ?? 'en'
  const languageName = LANGUAGE_NAMES[base]

  const query = languageName
    ? `"${phrase}" sourcelang:${languageName}`
    : `"${phrase}"`

  const url = new URL(DOC_API)
  url.searchParams.set('query', query)
  url.searchParams.set('mode', 'artlist')
  url.searchParams.set('format', 'json')
  url.searchParams.set('timespan', '7d')
  url.searchParams.set('maxrecords', '75')

  const key = `gdelt:${base}:${phrase.toLowerCase()}`

  try {
    const payload = await withCache(key, TTL.gdelt, () => fetchJson<DocResponse>(url))
    const articles = payload.articles ?? []
    return {
      articleCount: articles.length,
      sampleTitles: articles
        .map((a) => a.title)
        .filter((t): t is string => typeof t === 'string')
        .slice(0, 3),
    }
  } catch {
    // GDELT answers with an HTML error page for some queries rather than JSON,
    // and it rate-limits without warning. Neither is worth failing a discovery
    // run over: no news volume simply means no boost from this source.
    return { articleCount: 0, sampleTitles: [] }
  }
}
