import { TTL, withCache } from '../cache.ts'
import { fetchText } from '../http.ts'
import { sanitiseTitle } from '../sanitise.ts'

/**
 * Google Trends "Trending Now", read as RSS.
 *
 * The published feed, fetched as published — not `pytrends`, not a scraper,
 * not an unofficial JSON endpoint. Those are all excluded on purpose: they
 * work by pretending to be a browser, they break without notice, and shipping
 * one inside a product sold to other people makes their install the thing
 * making unauthorised requests.
 *
 * What this gives is *demand*, and only demand. Trending means people are
 * searching now, which says nothing about whether the subject can be sourced
 * or will matter next month. It feeds the recency multiplier, which can only
 * boost a topic that already scored on its own merits — never rescue one.
 */

const FEED = 'https://trends.google.com/trending/rss'

/**
 * Geographies, not languages. A German-language niche cares about Germany,
 * Austria and Switzerland; the feed is per country and has no language axis.
 */
export const GEOS_BY_LANGUAGE: Record<string, string[]> = {
  de: ['DE', 'AT', 'CH'],
  en: ['US', 'GB'],
  fr: ['FR', 'BE'],
  es: ['ES', 'MX'],
  it: ['IT'],
  nl: ['NL'],
  pt: ['PT', 'BR'],
}

export function geosForLanguage(language: string): string[] {
  const base = language.toLowerCase().split('-')[0] ?? 'en'
  return GEOS_BY_LANGUAGE[base] ?? ['US']
}

/**
 * Pull `<title>` out of each `<item>`.
 *
 * Regex over XML is normally a mistake. It is the right call here: the feed is
 * a fixed, flat shape, and the alternative is a parser dependency carried
 * forever for one endpoint. The parse is defensive — anything unexpected
 * yields fewer titles rather than a throw, and the caller treats an empty
 * trends list as "no boost" rather than an error.
 */
export function parseTrendingRss(xml: string): string[] {
  const titles: string[] = []

  for (const item of xml.split('<item>').slice(1)) {
    const match = /<title>([\s\S]*?)<\/title>/.exec(item)
    if (!match?.[1]) continue

    const text = decodeEntities(
      match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, ''),
    ).trim()

    // Every string here reaches a model prompt eventually, and this feed is
    // populated by whatever the public is searching for. Treated as untrusted
    // input, same as a verifier search result.
    const clean = sanitiseTitle(text)
    if (clean) titles.push(clean)
  }

  return titles
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Trending phrases for one country. */
export async function trendingNow(geo: string): Promise<string[]> {
  const url = new URL(FEED)
  url.searchParams.set('geo', geo)

  const key = `google-trends:${geo}`
  const xml = await withCache(key, TTL.trends, () =>
    fetchText(url, { accept: 'application/rss+xml, application/xml, text/xml' }),
  )

  return parseTrendingRss(xml)
}

/** Trending phrases across every geography for a language, deduplicated. */
export async function trendingForLanguage(language: string): Promise<Set<string>> {
  const seen = new Set<string>()

  for (const geo of geosForLanguage(language)) {
    try {
      for (const title of await trendingNow(geo)) seen.add(title.toLowerCase())
    } catch {
      // One country's feed failing should not lose the others. Trends is a
      // multiplier input, so its absence costs precision, not correctness.
    }
  }

  return seen
}
