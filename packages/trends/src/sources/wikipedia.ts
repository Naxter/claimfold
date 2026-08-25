import { TTL, withCache } from '../cache.ts'
import { fetchJson } from '../http.ts'

/**
 * Article metadata, used to reject candidates before anything is spent on them.
 *
 * The economics are the point. Verification costs real money per claim, and
 * the writing stage costs more. Everything here is free, so every rejection
 * that happens at this layer is a rejection that never reaches a paid stage.
 *
 * Two APIs, chosen for different reasons:
 *
 * - **MediaWiki Action API** for per-article facts that only exist in the
 *   article: how many external links it carries, and when it was created.
 * - **Wikidata** for "is this a living person?". That check has to be right,
 *   and category names differ per language while `P31` (instance of) and
 *   `P570` (date of death) do not. Deriving it from category lists would also
 *   mean trusting a batched list that silently truncates.
 */

export interface ArticleFacts {
  title: string
  /**
   * External links on the article.
   *
   * A PROXY for citation density, not a reference count — a book cited with
   * no URL does not appear here, and an external link in an infobox is not a
   * reference. It correlates well enough to filter on and is free; anything
   * more accurate means parsing wikitext per article. Named for what it
   * measures so nothing downstream can mistake it for the other thing.
   */
  externalLinkCount: number
  /** Days since the first revision. */
  ageDays?: number
  /** Wikidata id, when the article has one. */
  entityId?: string
  /** Categories, for soft signals only — this list can truncate. */
  categories: string[]
  /** Templates on the article, lower-cased. The prefilter looks for maintenance banners here. */
  templates: string[]
}

interface ActionQueryResponse {
  query?: {
    pages?: Array<{
      title?: string
      missing?: boolean
      extlinks?: Array<{ url?: string }>
      categories?: Array<{ title?: string }>
      templates?: Array<{ title?: string }>
      pageprops?: { wikibase_item?: string }
      revisions?: Array<{ timestamp?: string }>
    }>
  }
}

function apiBase(project: string): URL {
  // `de.wikipedia` → `de.wikipedia.org`. Built from the project string this
  // package generated, never from anything a source returned.
  const host = project.endsWith('.wikipedia') ? `${project}.org` : project
  return new URL(`https://${host}/w/api.php`)
}

/**
 * Everything about one article, in one request.
 *
 * Per-article rather than batched: `rvlimit` may not be combined with several
 * titles, and `ellimit` is a per-query cap that silently truncates when it is
 * shared across a batch. A count that quietly under-reports would push good
 * candidates below the reference floor, which is the opposite of the filter's
 * job. One request per article is slower and correct.
 */
export async function articleFacts(
  project: string,
  title: string,
): Promise<ArticleFacts | null> {
  const url = apiBase(project)
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('prop', 'extlinks|categories|templates|pageprops|revisions')
  url.searchParams.set('titles', title)
  url.searchParams.set('ellimit', 'max')
  url.searchParams.set('cllimit', 'max')
  url.searchParams.set('clshow', '!hidden')
  url.searchParams.set('tllimit', 'max')
  // Maintenance banners live in the template namespace, so the scan is
  // restricted to it rather than pulling every transclusion on the page.
  url.searchParams.set('tlnamespace', '10')
  url.searchParams.set('rvlimit', '1')
  url.searchParams.set('rvdir', 'newer')
  url.searchParams.set('rvprop', 'timestamp')
  url.searchParams.set('redirects', '1')

  const key = `wikipedia:facts:${project}:${title}`
  const payload = await withCache(key, TTL.articleMetadata, () =>
    fetchJson<ActionQueryResponse>(url),
  )

  const page = payload.query?.pages?.[0]
  if (!page || page.missing) return null

  const created = page.revisions?.[0]?.timestamp
  const ageDays = created
    ? Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000)
    : undefined

  return {
    title: page.title ?? title,
    externalLinkCount: page.extlinks?.length ?? 0,
    ...(ageDays === undefined ? {} : { ageDays }),
    ...(page.pageprops?.wikibase_item ? { entityId: page.pageprops.wikibase_item } : {}),
    categories: (page.categories ?? [])
      .map((c) => c.title)
      .filter((t): t is string => typeof t === 'string'),
    templates: (page.templates ?? [])
      .map((t) => t.title?.toLowerCase())
      .filter((t): t is string => typeof t === 'string'),
  }
}

interface PagePropsResponse {
  query?: {
    normalized?: Array<{ from?: string; to?: string }>
    redirects?: Array<{ from?: string; to?: string }>
    pages?: Array<{ title?: string; missing?: boolean; pageprops?: { wikibase_item?: string } }>
  }
}

/** Article titles compare equal whether they arrived with underscores or spaces. */
function titleKey(title: string): string {
  return title.replace(/_/g, ' ').trim().toLowerCase()
}

/**
 * Wikidata ids for many articles at once.
 *
 * The cheap half of the metadata story, and worth separating from
 * `articleFacts` for one reason: it makes the living-person check affordable
 * *before* the expensive per-article calls. Wikipedia's most-viewed list is
 * mostly people who were in the news yesterday, and every one of them is a
 * candidate the prefilter will refuse. Measuring them first and rejecting them
 * afterwards spends the whole request budget learning nothing.
 *
 * Batching is safe here in a way it is not for external links: `pageprops`
 * returns one small value per page, so there is no shared cap to truncate.
 */
export async function entityIdsForTitles(
  project: string,
  titles: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (titles.length === 0) return out

  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50)

    const url = apiBase(project)
    url.searchParams.set('action', 'query')
    url.searchParams.set('format', 'json')
    url.searchParams.set('formatversion', '2')
    url.searchParams.set('prop', 'pageprops')
    url.searchParams.set('ppprop', 'wikibase_item')
    url.searchParams.set('titles', batch.join('|'))
    url.searchParams.set('redirects', '1')

    const key = `wikipedia:entityids:${project}:${batch.join(',')}`
    let payload: PagePropsResponse
    try {
      payload = await withCache(key, TTL.articleMetadata, () =>
        fetchJson<PagePropsResponse>(url),
      )
    } catch {
      // A failed batch costs precision, not correctness: an article with no id
      // simply skips the free check and gets measured like any other.
      continue
    }

    // The API rewrites titles it normalised or followed a redirect for, so the
    // answer has to be walked back to the title the caller asked about.
    const aliases = new Map<string, string>()
    for (const step of [
      ...(payload.query?.normalized ?? []),
      ...(payload.query?.redirects ?? []),
    ]) {
      if (step.from && step.to) aliases.set(titleKey(step.to), titleKey(step.from))
    }

    for (const page of payload.query?.pages ?? []) {
      const entityId = page.pageprops?.wikibase_item
      if (!page.title || !entityId) continue

      let resolved = titleKey(page.title)
      // Follow the chain back: normalise, then redirect, at most a few hops.
      for (let hop = 0; hop < 4 && aliases.has(resolved); hop += 1) {
        resolved = aliases.get(resolved)!
      }
      out.set(resolved, entityId)
    }
  }

  return out
}

interface WikidataResponse {
  entities?: Record<
    string,
    {
      claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>
    }
  >
}

const INSTANCE_OF = 'P31'
const DATE_OF_DEATH = 'P570'
const HUMAN = 'Q5'

export interface EntityFacts {
  isHuman: boolean
  /** True only for humans with no recorded date of death. */
  isLivingPerson: boolean
  /** Raw `instance of` ids, used for the subject-matter checks. */
  instanceOf: string[]
}

/**
 * Batched entity lookup. Up to 50 ids per request, which is the API's limit.
 *
 * Batched here — unlike article facts — because these claims are returned in
 * full for every entity asked about. There is no shared cap to truncate.
 */
export async function entityFacts(ids: string[]): Promise<Map<string, EntityFacts>> {
  const out = new Map<string, EntityFacts>()
  if (ids.length === 0) return out

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const url = new URL('https://www.wikidata.org/w/api.php')
    url.searchParams.set('action', 'wbgetentities')
    url.searchParams.set('format', 'json')
    url.searchParams.set('props', 'claims')
    url.searchParams.set('ids', batch.join('|'))

    const key = `wikidata:claims:${batch.join(',')}`
    const payload = await withCache(key, TTL.articleMetadata, () =>
      fetchJson<WikidataResponse>(url),
    )

    for (const [id, entity] of Object.entries(payload.entities ?? {})) {
      const instanceOf = (entity.claims?.[INSTANCE_OF] ?? [])
        .map((c) => {
          const value = c.mainsnak?.datavalue?.value
          // Wikidata wraps an item reference as `{ "entity-type": "item",
          // "id": "Q5" }`. Anything else is a claim of a different datatype.
          return value && typeof value === 'object' && 'id' in value
            ? String(value.id)
            : undefined
        })
        .filter((v): v is string => typeof v === 'string')

      const isHuman = instanceOf.includes(HUMAN)
      const hasDeathDate = (entity.claims?.[DATE_OF_DEATH] ?? []).length > 0

      out.set(id, { isHuman, isLivingPerson: isHuman && !hasDeathDate, instanceOf })
    }
  }

  return out
}

/**
 * Resolve a free-text phrase to an article, so trends and news candidates can
 * be measured on the same footing as Wikimedia ones.
 *
 * Uses the opensearch endpoint and takes the first hit. A wrong match here
 * costs a bad measurement, not a bad post — the phrase itself is what reaches
 * the writing stage, and every claim in that post is still verified.
 */
export async function resolveArticle(
  project: string,
  phrase: string,
): Promise<string | null> {
  const url = apiBase(project)
  url.searchParams.set('action', 'opensearch')
  url.searchParams.set('format', 'json')
  url.searchParams.set('search', phrase)
  url.searchParams.set('limit', '1')
  url.searchParams.set('namespace', '0')
  url.searchParams.set('redirects', 'resolve')

  const key = `wikipedia:resolve:${project}:${phrase.toLowerCase()}`
  const payload = await withCache(key, TTL.articleMetadata, () =>
    fetchJson<[string, string[], string[], string[]]>(url),
  )

  const titles = Array.isArray(payload) ? payload[1] : undefined
  const first = Array.isArray(titles) ? titles[0] : undefined
  return typeof first === 'string' && first.length > 0 ? first.replace(/ /g, '_') : null
}
