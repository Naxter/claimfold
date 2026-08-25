import { TTL, withCache } from '../cache.ts'
import { fetchJson } from '../http.ts'
import { THRESHOLDS } from '../prefilter.ts'
import type { TopicCandidate } from '../types.ts'

/**
 * Wikimedia Pageviews — the spine of discovery.
 *
 * Tier A: no key, no cost, and the licence is CC0, so the numbers can be
 * shown to an operator and kept in an exported record without a rights
 * question. It is also the only free source here that says anything about
 * *durability*: a twelve-month history distinguishes a subject people look up
 * every month from one that spiked once because of a news cycle. That
 * distinction is the whole point — a carousel published next week about last
 * week's noise ages badly, and a claim that was only ever interesting for
 * three days is not worth sourcing.
 */

const REST_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews'

/**
 * Namespaced and special pages that dominate every top list.
 *
 * Matched on the colon prefix rather than by name, so this works for every
 * language project — `Spezial:`, `Special:`, `Wikipédia:` and the rest all
 * carry one. `Main_Page` and its translations are handled by the explicit
 * list, because the main page has no namespace prefix anywhere.
 */
const MAIN_PAGES = new Set([
  'Main_Page',
  'Wikipedia:Hauptseite',
  'Hauptseite',
  'Portada',
  'Accueil_principal',
  'Pagina_principale',
  '-',
])

/**
 * Requests for files and scripts that reach the pageview counter anyway.
 *
 * `wiki.phtml` turned up in the first live run of this code: it is a legacy
 * entry point, not an article, and nothing downstream would ever have noticed
 * — it simply has no references, so it would have been refused after two
 * requests were spent on it.
 */
const NON_ARTICLE_SUFFIX = /\.(phtml|php|html?|js|css|json|png|jpe?g|gif|svg|ico|txt|xml)$/i

function isArticleTitle(title: string): boolean {
  if (MAIN_PAGES.has(title)) return false
  if (title.includes(':')) return false
  // Special:Search hits and similar arrive percent-encoded in some responses.
  if (title.startsWith('Special%3A') || title.startsWith('Spezial%3A')) return false
  if (NON_ARTICLE_SUFFIX.test(title)) return false
  return title.length > 1
}

/** `de` → `de.wikipedia`. Language tags may carry a region; the project never does. */
export function projectForLanguage(language: string): string {
  const base = language.toLowerCase().split('-')[0] ?? 'en'
  return `${base}.wikipedia`
}

interface TopResponse {
  items?: Array<{ articles?: Array<{ article?: string; views?: number; rank?: number }> }>
}

/**
 * The most-read articles for one day.
 *
 * Deliberately not "today": the aggregation lands a day or two behind, and
 * asking for a date that is not ready yet answers 404. Callers pass an offset.
 */
export async function topArticles(
  project: string,
  daysAgo: number,
  limit: number,
): Promise<TopicCandidate[]> {
  const date = new Date(Date.now() - daysAgo * 86_400_000)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')

  const url = new URL(`${REST_BASE}/top/${project}/all-access/${y}/${m}/${d}`)
  const key = `wikimedia:top:${project}:${y}-${m}-${d}`

  // A day's top list is final once published, so it keeps for a month.
  const payload = await withCache(key, TTL.monthlyHistory, () =>
    fetchJson<TopResponse>(url),
  )

  const articles = payload.items?.[0]?.articles ?? []
  return articles
    .filter((a) => typeof a.article === 'string' && isArticleTitle(a.article))
    .slice(0, limit)
    .map<TopicCandidate>((a) => ({
      key: `${project}:${a.article!}`,
      title: a.article!.replace(/_/g, ' '),
      sources: ['wikimedia'],
      article: {
        project,
        title: a.article!,
        url: `https://${project.replace('.wikipedia', '.wikipedia.org')}/wiki/${encodeURIComponent(a.article!)}`,
      },
      signals: {},
    }))
}

interface PerArticleResponse {
  items?: Array<{ timestamp?: string; views?: number }>
}

export interface MonthlyHistory {
  months: Array<{ month: string; views: number }>
}

/**
 * Twelve months of views for one article.
 *
 * Monthly rather than daily on purpose: daily data is twelve times the volume
 * to answer a question — "is this subject steadily interesting?" — that daily
 * resolution does not improve.
 */
export async function monthlyHistory(
  project: string,
  article: string,
  months = 12,
): Promise<MonthlyHistory> {
  const end = new Date()
  // Only complete months. The current one is partial and would read as a slump.
  end.setUTCDate(1)
  end.setUTCDate(0)
  const start = new Date(end)
  start.setUTCMonth(start.getUTCMonth() - (months - 1))
  start.setUTCDate(1)

  const stamp = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`

  const url = new URL(
    `${REST_BASE}/per-article/${project}/all-access/all-agents/` +
      `${encodeURIComponent(article)}/monthly/${stamp(start)}/${stamp(end)}`,
  )
  const key = `wikimedia:monthly:${project}:${article}:${stamp(start)}-${stamp(end)}`

  const payload = await withCache(key, TTL.monthlyHistory, () =>
    fetchJson<PerArticleResponse>(url),
  )

  const months_ = (payload.items ?? [])
    .filter((i) => typeof i.timestamp === 'string' && typeof i.views === 'number')
    .map((i) => ({
      // Timestamps arrive as YYYYMMDDHH.
      month: `${i.timestamp!.slice(0, 4)}-${i.timestamp!.slice(4, 6)}`,
      views: i.views!,
    }))

  return { months: months_ }
}

/**
 * Turn a view series into the shape signals the scorer needs.
 *
 * Median rather than mean, and coefficient of variation rather than raw
 * spread, because both answer "is this normally busy?" without one viral
 * month dragging the answer around.
 */
export function summariseHistory(history: MonthlyHistory): {
  medianMonthlyViews: number
  recentMonthlyViews: number
  viewsVariation: number
  monthsOfHistory: number
  dominantSpike?: { month: string; share: number; ageDays: number }
} {
  /*
    Sorted by month before anything is derived from the order.

    The Pageviews API happens to return ascending today and this code depended
    on that silently — `recentMonthlyViews` took the LAST element. Handed
    `[2025-12, 2025-11, 2025-10]` it reported the oldest month as the most
    recent, and that number is persisted into `topics.signals` and scored.
    Every fixture in the tests is already ascending, so nothing would have
    caught the day it changed.

    Codepoint comparison, not `localeCompare`: `YYYY-MM` sorts correctly as a
    string, and a locale-aware comparison would make the result depend on the
    container's `LANG`. Same reasoning as `sortKeys` in @claimfold/render.
  */
  const months = [...history.months].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))

  const views = months.map((m) => m.views)
  const monthsOfHistory = views.length

  if (monthsOfHistory === 0) {
    return {
      medianMonthlyViews: 0,
      recentMonthlyViews: 0,
      viewsVariation: 1,
      monthsOfHistory: 0,
    }
  }

  const sorted = [...views].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const medianMonthlyViews =
    sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!

  const mean = views.reduce((a, b) => a + b, 0) / views.length
  const variance = views.reduce((acc, v) => acc + (v - mean) ** 2, 0) / views.length
  const viewsVariation = mean > 0 ? Math.sqrt(variance) / mean : 1

  const total = views.reduce((a, b) => a + b, 0)
  let dominantSpike: { month: string; share: number; ageDays: number } | undefined

  if (total > 0) {
    const peak = months.reduce((best, m) => (m.views > best.views ? m : best))
    const share = peak.views / total
    // Half of a year's attention landing in one month is a news event, not a
    // subject. The scorer does not decide this; the prefilter does — and the
    // number comes from there too. It was hardcoded here as `0.5` alongside
    // `THRESHOLDS.spikeShare` holding the same value, which is one editorial
    // policy in two places waiting to drift.
    if (share >= THRESHOLDS.spikeShare) {
      const [year, month] = peak.month.split('-').map(Number)

      /*
        Guarded. `'2025-'.split('-').map(Number)` yields `[2025, NaN]`, and
        `Date.UTC(2025, NaN - 1, 15)` silently became December 2024 — a spike
        dated a year off, which then decides whether the subject is "still
        recent" and gets dropped.
      */
      if (Number.isFinite(year) && Number.isFinite(month)) {
        const peakDate = Date.UTC(year!, month! - 1, 15)
        dominantSpike = {
          month: peak.month,
          share,
          ageDays: Math.floor((Date.now() - peakDate) / 86_400_000),
        }
      }
    }
  }

  return {
    medianMonthlyViews,
    recentMonthlyViews: views[views.length - 1] ?? 0,
    viewsVariation,
    monthsOfHistory,
    ...(dominantSpike ? { dominantSpike } : {}),
  }
}
