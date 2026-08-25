import { graphRequest } from './client.ts'
import { InstagramError } from './errors.ts'

/**
 * Reading post performance.
 *
 * The metrics that matter here are `saved` and `shares`. Since 2024 Instagram
 * has weighted sends and saves far above likes for distribution, so a dashboard
 * that leads with likes would be optimising the wrong thing. Likes are kept
 * because they are cheap to collect, not because they should drive decisions.
 */

export interface MediaInsights {
  reach: number
  impressions: number
  saved: number
  shares: number
  likes: number
  comments: number
  profileVisits: number
  follows: number
}

/**
 * Requested in descending order of importance.
 *
 * Metric availability varies by media type and changes between API versions,
 * and requesting one the API does not recognise fails the ENTIRE call rather
 * than omitting that field. So an unrecognised metric is dropped and the call
 * retried, instead of losing every metric to one bad name.
 */
const METRICS = [
  'reach',
  'saved',
  'shares',
  'likes',
  'comments',
  'profile_visits',
  'follows',
  'total_interactions',
  'impressions',
] as const

const FIELD_MAP: Record<string, keyof MediaInsights> = {
  reach: 'reach',
  impressions: 'impressions',
  saved: 'saved',
  shares: 'shares',
  likes: 'likes',
  comments: 'comments',
  profile_visits: 'profileVisits',
  follows: 'follows',
}

export async function fetchInsights(
  mediaId: string,
  accessToken: string,
): Promise<MediaInsights> {
  const result: MediaInsights = {
    reach: 0,
    impressions: 0,
    saved: 0,
    shares: 0,
    likes: 0,
    comments: 0,
    profileVisits: 0,
    follows: 0,
  }

  let metrics = [...METRICS]

  // Up to a few attempts, dropping whichever metric the API names as invalid.
  for (let attempt = 0; attempt < 5 && metrics.length > 0; attempt += 1) {
    try {
      const response = await graphRequest<{
        data?: Array<{ name: string; values?: Array<{ value?: number }>; total_value?: { value?: number } }>
      }>(`${mediaId}/insights`, {
        accessToken,
        params: { metric: metrics.join(',') },
      })

      for (const metric of response.data ?? []) {
        const key = FIELD_MAP[metric.name]
        if (!key) continue
        // Newer metrics report `total_value`; older ones a `values` array.
        const value = metric.total_value?.value ?? metric.values?.[0]?.value ?? 0
        result[key] = value
      }

      return result
    } catch (error) {
      if (!(error instanceof InstagramError)) throw error

      const offending = metrics.find((m) => error.message.includes(m))
      if (!offending) throw error

      metrics = metrics.filter((m) => m !== offending)
    }
  }

  return result
}
