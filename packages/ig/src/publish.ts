import { graphRequest } from './client.ts'
import { ContainerExpiredError, InstagramError, PublishLimitError } from './errors.ts'

/**
 * Publishing a carousel.
 *
 * Instagram's API has no scheduling and no atomic "post these ten images" call.
 * A carousel is built up as N+1 server-side containers and then published, and
 * every one of those containers evaporates 24 hours after creation. So this
 * whole flow must run close to the intended publish time, and a failure part
 * way through means starting over rather than resuming.
 */

/** Hard API limit. A carousel takes 2–10 images. */
export const MAX_CAROUSEL_ITEMS = 10

export interface PublishQuota {
  used: number
  total: number
  remaining: number
}

/**
 * Read the account's remaining publishing quota.
 *
 * Always asked, never assumed. Meta's own sources disagree about the limit —
 * the docs say 100 posts per rolling 24h, the quota endpoint reports 50, and
 * developers observe throttling around 25. Hardcoding any of those numbers
 * means either refusing to publish when we could, or failing at publish time
 * when we thought we were fine.
 */
export async function checkQuota(igUserId: string, accessToken: string): Promise<PublishQuota> {
  const response = await graphRequest<{
    data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }>
  }>(`${igUserId}/content_publishing_limit`, {
    accessToken,
    params: { fields: 'config,quota_usage' },
  })

  const entry = response.data?.[0]
  const used = entry?.quota_usage ?? 0
  const total = entry?.config?.quota_total ?? 25

  return { used, total, remaining: Math.max(0, total - used) }
}

export interface CarouselSlide {
  /**
   * Publicly reachable HTTPS URL of a JPEG.
   *
   * Must be fetchable server-to-server by Meta's crawler with no auth, no
   * redirect and no bot protection. Presigned or expiring URLs are a known
   * failure mode: they open fine in a browser and fail for the crawler.
   */
  imageUrl: string
  /** Up to 1000 characters. Accessibility, and indexed by Instagram search. */
  altText?: string
}

export interface PublishCarouselInput {
  igUserId: string
  accessToken: string
  slides: CarouselSlide[]
  caption: string
  /** Sets Meta's AI-disclosure flag on the post. */
  isAiGenerated?: boolean
  /** Posted as a separate comment after publishing; the API has no field for it. */
  firstComment?: string
  /**
   * Called with the parent carousel container id immediately before the
   * irreversible `media_publish` call, and awaited.
   *
   * The caller is expected to persist it. See the note at the call site: this
   * is what lets a crashed publish be resolved instead of blindly retried.
   */
  onCarouselCreated?: (creationId: string) => Promise<void>
}

export interface PublishResult {
  mediaId: string
  permalink?: string
  containerIds: string[]
}

/** Create one child container. Children carry no caption — that belongs on the parent. */
async function createImageContainer(
  input: { igUserId: string; accessToken: string },
  slide: CarouselSlide,
): Promise<string> {
  const response = await graphRequest<{ id: string }>(`${input.igUserId}/media`, {
    accessToken: input.accessToken,
    method: 'POST',
    params: {
      image_url: slide.imageUrl,
      is_carousel_item: true,
      alt_text: slide.altText?.slice(0, 1000) || undefined,
    },
    // Meta fetches the image during this call, so it is slower than it looks.
    timeoutSeconds: 90,
  })

  return response.id
}

/**
 * Poll a container until Meta finishes processing it.
 *
 * The default budget is generous on purpose. A ten-image carousel is slow, and
 * timing out here produces a retryable error — which, before idempotency
 * existed, meant republishing a post Meta had already accepted.
 */
async function waitForContainer(
  accessToken: string,
  containerId: string,
  { attempts = 30, intervalMs = 3_000 } = {},
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await graphRequest<{ status_code?: string; status?: string }>(
      containerId,
      { accessToken, params: { fields: 'status_code,status' } },
    )

    const status = response.status_code
    if (status === 'FINISHED') return
    if (status === 'PUBLISHED') return

    if (status === 'ERROR') {
      throw new InstagramError(
        `Instagram rejected a media container: ${response.status ?? 'no detail given'}`,
        undefined,
        undefined,
        400,
        false,
      )
    }
    if (status === 'EXPIRED') {
      throw new ContainerExpiredError('Media container expired before publishing')
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new InstagramError(
    'Media container did not finish processing in time',
    undefined,
    undefined,
    408,
    true,
  )
}

/**
 * Whether a carousel container was already published.
 *
 * The recovery question, and the reason `posts.ig_creation_id` exists: a worker
 * that died between `media_publish` returning 200 and its own transaction
 * committing leaves a post Instagram has already published and our database
 * believes is merely stranded. Republishing it puts a duplicate carousel on a
 * customer's real account.
 *
 * Deliberately three-valued. `unknown` is not a failure to be smoothed over —
 * it is the answer that must never be treated as "safe to publish again", and
 * collapsing it into a boolean is how that mistake gets made. The caller stops
 * and asks a human.
 */
export type ContainerPublishState = 'published' | 'not-published' | 'unknown'

export async function containerPublishState(
  accessToken: string,
  containerId: string,
): Promise<ContainerPublishState> {
  try {
    const response = await graphRequest<{ status_code?: string }>(containerId, {
      accessToken,
      params: { fields: 'status_code' },
    })

    switch (response.status_code) {
      case 'PUBLISHED':
        return 'published'
      // FINISHED means processed and ready, but not sent. IN_PROGRESS likewise.
      // ERROR and EXPIRED both mean it never went live.
      case 'FINISHED':
      case 'IN_PROGRESS':
      case 'ERROR':
      case 'EXPIRED':
        return 'not-published'
      default:
        return 'unknown'
    }
  } catch {
    // A container Meta has forgotten, a network failure, an expired token —
    // none of these tell us it did not publish.
    return 'unknown'
  }
}

/**
 * Publish a carousel.
 *
 * Returns the published media id. Throws `PublishLimitError` when out of quota
 * (retry later), `ContainerExpiredError` when containers went stale (rebuild
 * from scratch — never retry with the same ids), or a non-retryable
 * `InstagramError` when the request itself was wrong.
 */
export async function publishCarousel(input: PublishCarouselInput): Promise<PublishResult> {
  const { igUserId, accessToken, slides, caption } = input

  if (slides.length < 2 || slides.length > MAX_CAROUSEL_ITEMS) {
    throw new InstagramError(
      `A carousel takes 2–${MAX_CAROUSEL_ITEMS} images, got ${slides.length}`,
      undefined,
      undefined,
      400,
      false,
    )
  }

  for (const slide of slides) {
    if (!slide.imageUrl.startsWith('https://')) {
      throw new InstagramError(
        `Slide image URL must be HTTPS and publicly reachable: ${slide.imageUrl}`,
        undefined,
        undefined,
        400,
        false,
      )
    }
  }

  // Check before building anything. Discovering exhaustion after creating
  // eleven containers wastes them, and they cannot be reused later.
  const quota = await checkQuota(igUserId, accessToken)
  if (quota.remaining < 1) {
    throw new PublishLimitError(
      `Publishing quota exhausted (${quota.used}/${quota.total} in the last 24h)`,
    )
  }

  // 1. One container per image. Sequential: Meta fetches each image as it is
  // created, and a burst of parallel fetches against a small self-hosted box
  // is a good way to get rate-limited by your own server.
  const containerIds: string[] = []
  for (const slide of slides) {
    containerIds.push(await createImageContainer({ igUserId, accessToken }, slide))
  }

  // 2. Wait for every CHILD to finish processing before assembling the parent.
  //
  // Meta's flow expects this, and referencing a still-processing child is a
  // documented way to get an opaque carousel failure. Doing it here also
  // surfaces a bad image URL against the specific slide that caused it,
  // rather than as a generic error on the parent.
  for (const containerId of containerIds) {
    await waitForContainer(accessToken, containerId)
  }

  // 3. The parent. Caption and AI disclosure live here, not on the children.
  const carousel = await graphRequest<{ id: string }>(`${igUserId}/media`, {
    accessToken,
    method: 'POST',
    params: {
      media_type: 'CAROUSEL',
      children: containerIds.join(','),
      caption: caption.slice(0, 2200),
      is_ai_generated: input.isAiGenerated ? true : undefined,
    },
    timeoutSeconds: 90,
  })

  await waitForContainer(accessToken, carousel.id)

  /*
    Hand the caller the creation id BEFORE publishing.

    This is the durable marker that makes recovery possible. Everything up to
    here is reversible — containers expire on their own and cost nothing but
    quota — while the call below is the irreversible one. If the process dies
    after it, `containerPublishState` can be asked what happened, but only if
    something wrote the id down first.

    Awaited, not fire-and-forget: the whole point is that it is committed
    before the publish is attempted.
  */
  await input.onCarouselCreated?.(carousel.id)

  // 4. Publish.
  const published = await graphRequest<{ id: string }>(`${igUserId}/media_publish`, {
    accessToken,
    method: 'POST',
    params: { creation_id: carousel.id },
    timeoutSeconds: 90,
  })

  let permalink: string | undefined
  try {
    const media = await graphRequest<{ permalink?: string }>(published.id, {
      accessToken,
      params: { fields: 'permalink' },
    })
    permalink = media.permalink
  } catch {
    // Cosmetic. The post is live; failing here would misreport a success.
  }

  if (input.firstComment?.trim()) {
    try {
      await graphRequest(`${published.id}/comments`, {
        accessToken,
        method: 'POST',
        params: { message: input.firstComment.slice(0, 2200) },
      })
    } catch {
      // Same reasoning: the carousel is published. A missing first comment is
      // not a reason to mark the job failed and retry the whole publish.
    }
  }

  return { mediaId: published.id, permalink, containerIds }
}
