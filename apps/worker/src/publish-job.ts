import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'

import { decryptSecret, redact } from '@claimfold/crypto'
import {
  assets,
  igAccounts,
  niches,
  posts,
  slides,
  withOrg,
  withoutTenantScope,
  type TenantTx,
} from '@claimfold/db'
import {
  ContainerExpiredError,
  InstagramError,
  PublishLimitError,
  containerPublishState,
  publishCarousel,
} from '@claimfold/ig'
import { computeRenderHash, renderSlide } from '@claimfold/render'
import { toDataUri } from '@claimfold/render/image'
import {
  publicUrlFor,
  publicUrlIsPublishable,
  readSlideImage,
  saveSlideImage,
} from '@claimfold/storage'

/**
 * Turning an approved post into a live carousel.
 *
 * Instagram's API has no scheduling, so this is where "post at 18:00" actually
 * happens. And because media containers expire 24 hours after creation, the
 * rendering and the publishing must happen together, close to the target time —
 * pre-building containers at schedule time would leave them stale.
 */

const MAX_ATTEMPTS = 4

export interface PublishOutcome {
  postId: string
  status: 'published' | 'retry' | 'failed'
  detail: string
}

/**
 * How long a claim is trusted before another worker may take the post.
 *
 * Renewed as each slide finishes, so this is a ceiling on *silence*, not on
 * total publish time. It used to be a fixed 20 minutes measured against a
 * single `updatedAt` stamp that nothing refreshed — a ten-slide render plus
 * Meta's sequential per-child processing can exceed that, and with two workers
 * the second would release a live publish and run it again.
 */
const LEASE_MS = Math.max(1, Number(process.env.PUBLISH_LEASE_MINUTES ?? 20)) * 60 * 1000

/** How many posts one tick will take on. */
const BATCH = 20

/**
 * Posts whose time has come, plus any whose lease has lapsed mid-publish.
 *
 * Runs unscoped — the queue spans tenants — then hands off to `withOrg` for the
 * actual work. Without the second clause, a worker killed between claiming a
 * post and finishing it leaves that post in `publishing` forever, silently
 * unpublished.
 *
 * Ordered by `scheduled_at`, oldest first. It had no ORDER BY at all, so which
 * twenty rows came back was whatever the planner felt like — across every
 * tenant. One org with fifty due posts could take every slot on every tick,
 * indefinitely, and a post that missed its slot had no guarantee of ever being
 * preferred over a newer one. Nulls first so a lapsed publish, which carries no
 * new schedule, is picked up before fresh work.
 *
 * The third clause is a rescue, not a supported state. `approvePost` always
 * writes `scheduled`, but rows written before that change carry `approved` with
 * no time at all, and nothing would ever have looked at them — a person signed
 * those off and they were never going anywhere. They are treated as due
 * immediately, which is what approving them meant.
 *
 * That clause used to be an infinite silent loop: it selected rows `claim` then
 * refused, because `claim` only transitioned from `scheduled`. Such a post was
 * picked up every tick, refused, and logged "already being published" forever —
 * no publish, no error, no state change. `claim` now accepts `approved` as
 * well, so the rescue actually rescues. Migration 0009 also rewrites the
 * existing rows once, but the clause stays: a restored backup or an older
 * replica can reintroduce one at any time, and a rescue that only ran during a
 * migration is not a rescue.
 */
export async function findDuePosts(now = new Date()): Promise<Array<{ id: string; orgId: string }>> {
  return withoutTenantScope(async (tx) => {
    const rows = await tx
      .select({ id: posts.id, orgId: posts.orgId, scheduledAt: posts.scheduledAt })
      .from(posts)
      .where(
        or(
          and(eq(posts.status, 'scheduled'), lte(posts.scheduledAt, now)),
          and(
            eq(posts.status, 'publishing'),
            or(isNull(posts.publishLeaseUntil), lte(posts.publishLeaseUntil, now)),
          ),
          eq(posts.status, 'approved'),
        ),
      )
      .orderBy(sql`${posts.scheduledAt} asc nulls first`, asc(posts.createdAt))
      // Deliberately over-fetched, so the interleave below has more than one
      // tenant to work with even when one of them is holding the whole queue.
      .limit(BATCH * 5)

    return interleaveByOrg(rows, BATCH)
  })
}

/**
 * Round-robin across tenants: one post each, then a second each, and so on.
 *
 * Ordering by time alone is correct within a tenant and unfair across them. One
 * organisation with fifty due posts sorted ahead of everyone else's would take
 * every slot on every tick — and because it keeps producing due posts, take
 * them again on the next tick, indefinitely. A second tenant's post would not
 * be late, it would be unreachable.
 *
 * Order within each tenant is preserved exactly, so "oldest scheduled first"
 * still holds where it means something.
 */
function interleaveByOrg<T extends { orgId: string }>(rows: T[], limit: number): T[] {
  const byOrg = new Map<string, T[]>()
  for (const row of rows) {
    const queue = byOrg.get(row.orgId)
    if (queue) queue.push(row)
    else byOrg.set(row.orgId, [row])
  }

  const picked: T[] = []
  // Map preserves insertion order, so tenants are visited in the order their
  // oldest due post appeared — the tenant waiting longest goes first.
  const queues = [...byOrg.values()]

  while (picked.length < limit) {
    let tookAny = false
    for (const queue of queues) {
      const next = queue.shift()
      if (!next) continue
      picked.push(next)
      tookAny = true
      if (picked.length === limit) break
    }
    if (!tookAny) break
  }

  return picked
}

/** Put a post whose lease lapsed back so `claim` can take it again. */
async function releaseStranded(orgId: string, postId: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx
      .update(posts)
      .set({ status: 'scheduled', publishLeaseUntil: null, updatedAt: new Date() })
      .where(and(eq(posts.id, postId), eq(posts.status, 'publishing')))
  })
}

/**
 * Push the lease out. Called after each slide renders.
 *
 * Scoped to the row still being `publishing` so a worker whose lease already
 * lapsed — and whose post another worker has since taken — cannot reclaim it by
 * heartbeating.
 */
async function renewLease(orgId: string, postId: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx
      .update(posts)
      .set({ publishLeaseUntil: new Date(Date.now() + LEASE_MS), updatedAt: new Date() })
      .where(and(eq(posts.id, postId), eq(posts.status, 'publishing')))
  })
}

export async function publishPost(orgId: string, postId: string): Promise<PublishOutcome> {
  // Fail fast on a misconfigured install rather than after rendering ten
  // slides. This is the single most common setup mistake: it works locally and
  // then every scheduled publish fails with an opaque Meta error.
  const reachable = publicUrlIsPublishable()
  if (!reachable.ok) {
    await markFailed(orgId, postId, reachable.reason ?? 'Assets are not publicly reachable')
    return { postId, status: 'failed', detail: reachable.reason ?? 'unreachable assets' }
  }

  /**
   * A refusal that is not written down is a refusal that repeats forever.
   *
   * This used to `return` here without touching the database. The post stayed
   * `scheduled`, `findDuePosts` selected it again on the next tick, and the whole
   * thing ran once every thirty seconds for as long as the worker lived — no
   * publish, no error, nothing in the dashboard. Combined with `posts.igAccountId`
   * never being written by anything, that meant every scheduled post in the
   * product looped silently.
   *
   * The account binding is fixed elsewhere (see
   * docs/decisions/0004-which-account-a-post-goes-to.md). This is the part that
   * has to be right regardless of why the context could not be built: a terminal
   * outcome gets persisted as one.
   */
  const context = await loadContext(orgId, postId)
  if (!context) {
    const reason =
      'No connected Instagram account is resolved for this post, so it cannot be published. ' +
      'Choose an account on its channel, then approve it again.'
    await markFailed(orgId, postId, reason)
    return { postId, status: 'failed', detail: reason }
  }

  const { post, slideRows, account } = context

  let accessToken: string
  try {
    accessToken = decryptSecret(account.encryptedToken, 'ig_access_token', orgId)
  } catch {
    await markFailed(orgId, postId, 'Stored Instagram token could not be decrypted. Reconnect the account.')
    return { postId, status: 'failed', detail: 'token decrypt failed' }
  }

  /**
   * Idempotency.
   *
   * `media_publish` can succeed on Meta's side and still time out on ours —
   * ten images take a while to process. That surfaced as a retryable error and
   * the next tick published the same carousel again. A post that already has a
   * media id is done, whatever our own bookkeeping thinks.
   */
  if (post.igMediaId) {
    await withOrg(orgId, async (tx) => {
      await tx
        .update(posts)
        .set({ status: 'published', updatedAt: new Date() })
        .where(eq(posts.id, postId))
    })
    return { postId, status: 'published', detail: `already published as ${post.igMediaId}` }
  }

  /**
   * The other half of idempotency, and the one the media-id check cannot cover.
   *
   * `media_publish` returning 200 and our transaction committing are separate
   * events. A worker that dies between them leaves a post Instagram has already
   * published and this database believes is merely stranded — so the recovery
   * path above releases it, `claim` takes it, and the same carousel goes out a
   * second time under the customer's real name.
   *
   * `igCreationId` is written before that call precisely so this question can be
   * asked afterwards. Three answers, three different right things to do:
   *
   *  - published     → adopt it. Never send again.
   *  - not-published → the container exists but never went live; clear it and
   *                    publish normally.
   *  - unknown       → STOP. Meta will not say, so neither will we. A human
   *                    looks at the account. Guessing here is the entire class
   *                    of bug this block exists to prevent, and "probably fine"
   *                    is how a duplicate reaches an audience.
   */
  if (post.igCreationId) {
    const state = await containerPublishState(accessToken, post.igCreationId)

    if (state === 'published') {
      await withOrg(orgId, async (tx) => {
        await tx
          .update(posts)
          .set({
            status: 'published',
            publishedAt: post.publishedAt ?? new Date(),
            failureReason:
              'Recovered after an interrupted publish: Instagram confirms this carousel is ' +
              'live. The media id could not be recovered, so engagement numbers will not be ' +
              'collected for this post.',
            updatedAt: new Date(),
          })
          .where(eq(posts.id, postId))
      })
      return { postId, status: 'published', detail: 'recovered: already live on Instagram' }
    }

    if (state === 'unknown') {
      const reason =
        'This post was interrupted while publishing and Instagram will not say whether the ' +
        'carousel went live. It has NOT been sent again, because that risks posting twice. ' +
        'Check the account: if the carousel is there, mark this post published; if not, ' +
        'approve it again.'
      await markFailed(orgId, postId, reason)
      return { postId, status: 'failed', detail: 'interrupted publish needs a human' }
    }

    // Not published. The container is spent either way — containers cannot be
    // reused — so clear it and build fresh below.
    await withOrg(orgId, async (tx) => {
      await tx.update(posts).set({ igCreationId: null }).where(eq(posts.id, postId))
    })
  }

  if (post.publishAttempts >= MAX_ATTEMPTS) {
    await markFailed(
      orgId,
      postId,
      `Giving up after ${post.publishAttempts} attempts. Last error: ${post.failureReason ?? 'unknown'}`,
    )
    return { postId, status: 'failed', detail: 'attempt limit reached' }
  }

  // A post stranded by a killed worker goes back to `scheduled` so it can be
  // claimed again. Safe because of the media-id check above.
  if (post.status === 'publishing') await releaseStranded(orgId, postId)

  // Claim the post so a second worker cannot publish it concurrently. A
  // duplicate carousel is not something an apology fixes.
  const claimed = await claim(orgId, postId)
  if (!claimed) return { postId, status: 'retry', detail: 'already being published' }

  try {
    // Render anything whose copy changed since it was last rasterised.
    const imageUrls: Array<{ imageUrl: string; altText?: string }> = []

    for (const slide of slideRows) {
      const input = {
        // A slide may carry its own layout; null means it follows the post.
        templateId: slide.templateId ?? post.templateId,
        themeId: post.themeId,
        role: slide.role,
        content: slide.content,
        page: slide.index + 1,
        total: slideRows.length,
        lang: context.language,
        ...(context.watermark ? { watermark: context.watermark } : {}),
        ...(context.accentColor ? { accentColor: context.accentColor } : {}),
      }
      const hash = computeRenderHash(input)

      let path = slide.assetPath
      if (!path || slide.renderHash !== hash) {
        /*
          Read the picture only when actually rendering. It becomes a data URI
          inside the HTML — the render browser makes no network requests — so
          this is a few hundred kilobytes per slide that there is no reason to
          load on a cache hit.
        */
        const imageSrc = slide.imagePath
          ? toDataUri(await readSlideImage(slide.imagePath))
          : undefined

        const rendered = await renderSlide({ ...input, imageSrc })
        const stored = await saveSlideImage(orgId, rendered.jpeg)

        await withOrg(orgId, async (tx) => {
          const [asset] = await tx
            .insert(assets)
            .values({
              orgId,
              path: stored.path,
              sha256: stored.sha256,
              width: rendered.width,
              height: rendered.height,
              bytes: stored.bytes,
            })
            .onConflictDoNothing()
            .returning({ id: assets.id })

          const assetId =
            asset?.id ??
            (
              await tx.select({ id: assets.id }).from(assets).where(eq(assets.path, stored.path)).limit(1)
            )[0]?.id

          if (assetId) {
            await tx
              .update(slides)
              .set({ assetId, renderHash: hash })
              .where(eq(slides.id, slide.id))
          }
        })

        path = stored.path
      }

      imageUrls.push({ imageUrl: publicUrlFor(path), altText: slide.altText })

      // Renewed per slide, not per post. A ten-slide render can outlast the
      // lease on its own, and a lapsed lease is an invitation for a second
      // worker to publish this same carousel.
      await renewLease(orgId, postId)
    }

    const result = await publishCarousel({
      igUserId: account.igUserId,
      accessToken,
      slides: imageUrls,
      caption: buildCaption(post.caption, post.hashtags),
      isAiGenerated: post.aiDisclosure,
      firstComment: post.firstComment ?? undefined,
      // Committed before `media_publish` is called. See the recovery block at
      // the top of this function for what reads it.
      onCarouselCreated: async (creationId) => {
        await withOrg(orgId, async (tx) => {
          await tx
            .update(posts)
            .set({ igCreationId: creationId, updatedAt: new Date() })
            .where(eq(posts.id, postId))
        })
      },
    })

    await withOrg(orgId, async (tx) => {
      await tx
        .update(posts)
        .set({
          status: 'published',
          publishedAt: new Date(),
          igMediaId: result.mediaId,
          igPermalink: result.permalink ?? null,
          failureReason: null,
          publishLeaseUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, postId))
    })

    return { postId, status: 'published', detail: result.permalink ?? result.mediaId }
  } catch (error) {
    return handleFailure(orgId, postId, context.account.id, error)
  }
}

/**
 * Decide between retry and give-up.
 *
 * Getting this wrong is expensive in both directions: retrying a malformed
 * request loops forever, and giving up on a transient blip means a post
 * silently never goes out.
 */
async function handleFailure(
  orgId: string,
  postId: string,
  accountId: string,
  error: unknown,
): Promise<PublishOutcome> {
  const message = redact(error instanceof Error ? error.message : String(error))

  /**
   * Meta's own answer, when it gave one.
   *
   * `Retry-After` is the API telling us exactly how long to wait. The delays
   * below are reasonable guesses; this is not a guess, so it wins whenever it
   * is present. Clamped to an hour so a hostile or garbled header cannot park a
   * post indefinitely.
   */
  const asked =
    error instanceof InstagramError && typeof error.retryAfterSeconds === 'number'
      ? Math.min(error.retryAfterSeconds, 3600) * 1000
      : null

  if (error instanceof PublishLimitError) {
    // Quota resets on a rolling window. Genuinely not this post's fault, so it
    // is deferred rather than charged an attempt — `reschedule` refunds the
    // increment `claim` made. Without the refund, four brushes with Meta's
    // 25-post/24h limit marked a healthy post `failed` forever.
    await reschedule(orgId, postId, asked ?? 60 * 60 * 1000, message, { deferred: true })
    return { postId, status: 'retry', detail: 'quota exhausted, retrying in an hour' }
  }

  if (error instanceof ContainerExpiredError) {
    // Containers cannot be reused. Requeue soon so the whole carousel is
    // rebuilt from scratch. Also not the post's fault.
    await reschedule(orgId, postId, asked ?? 5 * 60 * 1000, message, { deferred: true })
    return { postId, status: 'retry', detail: 'containers expired, rebuilding' }
  }

  if (error instanceof InstagramError && error.requiresReconnect) {
    await markAccountBroken(orgId, postId, accountId, message)
    return { postId, status: 'failed', detail: 'account must be reconnected' }
  }

  if (error instanceof InstagramError && error.retryable) {
    await reschedule(orgId, postId, asked ?? 10 * 60 * 1000, message)
    return { postId, status: 'retry', detail: 'transient error, retrying' }
  }

  /*
    An InstagramError that is neither retryable nor a reconnect is a request we
    got wrong. Repeating it will not help.
  */
  if (error instanceof InstagramError) {
    await markFailed(orgId, postId, message)
    return { postId, status: 'failed', detail: message }
  }

  /*
    Everything else: a Chromium crash mid-render, a disk error writing a JPEG, a
    transient database blip.

    These used to fall through to `markFailed`, so a post died permanently on
    the first hiccup at attempt 1 of 4 — none of them are Instagram's verdict on
    the post, and all of them routinely succeed on a second run. Retried inside
    the attempt budget, which is what the budget is for; a genuinely broken post
    still stops after MAX_ATTEMPTS.
  */
  await reschedule(orgId, postId, 10 * 60 * 1000, message)
  return { postId, status: 'retry', detail: `unexpected error, retrying: ${message}` }
}

/* ─── Data helpers ───────────────────────────────────────────────────────── */

interface Context {
  post: typeof posts.$inferSelect
  slideRows: Array<
    typeof slides.$inferSelect & {
      assetPath: string | null
      /** Storage path of this slide's uploaded picture, if it has one. */
      imagePath: string | null
    }
  >
  account: typeof igAccounts.$inferSelect
  language: string
  /** Channel-wide appearance, read from the niche. See `loadContext`. */
  watermark: string
  accentColor: string | null
}

async function loadContext(orgId: string, postId: string): Promise<Context | null> {
  return withOrg(orgId, async (tx: TenantTx) => {
    const [post] = await tx.select().from(posts).where(eq(posts.id, postId)).limit(1)
    if (!post) return null

    const rows = await tx
      .select({
        id: slides.id,
        orgId: slides.orgId,
        postId: slides.postId,
        index: slides.index,
        role: slides.role,
        content: slides.content,
        altText: slides.altText,
        templateId: slides.templateId,
        editedAt: slides.editedAt,
        editedBy: slides.editedBy,
        renderHash: slides.renderHash,
        assetId: slides.assetId,
        createdAt: slides.createdAt,
        updatedAt: slides.updatedAt,
        assetPath: assets.path,
      })
      .from(slides)
      .leftJoin(assets, eq(assets.id, slides.assetId))
      .where(eq(slides.postId, postId))
      .orderBy(slides.index)

    /**
     * Which account to publish to.
     *
     * Never guessed. An earlier version fell back to `SELECT … LIMIT 1` with
     * no ordering and no status filter when `igAccountId` was null — so in an
     * org running two channels, a post could publish to the wrong audience
     * under the customer's real name. That is the unrecoverable failure this
     * product exists to avoid, so an unresolved account is now a hard stop.
     */
    if (!post.igAccountId) return null

    const [account] = await tx
      .select()
      .from(igAccounts)
      .where(and(eq(igAccounts.id, post.igAccountId), eq(igAccounts.status, 'connected')))
      .limit(1)

    if (!account) return null

    // Language drives hyphenation, which changes the rendered pixels. Reading
    // it from the niche keeps the published image identical to the one the
    // reviewer approved; hardcoding 'en' silently published unhyphenated
    // German and guaranteed a permanent render-cache miss.
    //
    // The watermark and the accent are read from the same place for the same
    // reason: both change pixels, both belong to the channel rather than the
    // post, and both are in the render hash — so reading them here is what
    // makes the cached image and the approved preview the same picture.
    const [niche] = await tx
      .select({
        language: niches.language,
        watermark: niches.watermark,
        accentColor: niches.accentColor,
      })
      .from(niches)
      .where(eq(niches.id, post.nicheId))
      .limit(1)

    /**
     * Resolve uploaded pictures to storage paths in one query.
     *
     * Scoped to `kind = 'upload'` so a slide cannot reference a rendered slide
     * and embed a picture of a carousel inside a carousel. Row-level security
     * already limits this to the tenant; the kind check is about what the
     * reference is allowed to mean.
     */
    const imageIds = [
      ...new Set(
        rows
          .map((row) => row.content.imageAssetId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ]

    const imagePathById = new Map<string, string>()
    if (imageIds.length > 0) {
      const imageRows = await tx
        .select({ id: assets.id, path: assets.path })
        .from(assets)
        .where(and(inArray(assets.id, imageIds), eq(assets.kind, 'upload')))
      for (const row of imageRows) imagePathById.set(row.id, row.path)
    }

    return {
      post,
      slideRows: rows.map((row) => ({
        ...row,
        imagePath: row.content.imageAssetId
          ? (imagePathById.get(row.content.imageAssetId) ?? null)
          : null,
      })),
      account,
      language: niche?.language ?? 'en',
      watermark: niche?.watermark ?? '',
      accentColor: niche?.accentColor ?? null,
    }
  })
}

/**
 * Atomically move scheduled → publishing, so only one worker proceeds.
 *
 * The attempt counter increments here rather than on failure: a worker killed
 * mid-publish never reaches its failure handler, and an attempt that is not
 * counted is an attempt that can repeat forever. Deferrals refund it — see
 * `reschedule`.
 *
 * Takes the lease at the same moment. Claim and lease have to be one write, or
 * there is a window where the post is `publishing` with no lease and looks
 * abandoned to every other worker.
 */
async function claim(orgId: string, postId: string): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const updated = await tx
      .update(posts)
      .set({
        status: 'publishing',
        publishAttempts: sql`${posts.publishAttempts} + 1`,
        publishLeaseUntil: new Date(Date.now() + LEASE_MS),
        updatedAt: new Date(),
      })
      /*
        Both states, not just `scheduled`.

        `findDuePosts` rescues legacy `approved` rows, and this only ever
        matched `scheduled` — so every rescued post was refused here and looped
        forever. Whichever of the two clauses selected the row, this is the
        atomic transition that decides which single worker proceeds.
      */
      .where(and(eq(posts.id, postId), inArray(posts.status, ['scheduled', 'approved'])))
      .returning({ id: posts.id })
    return updated.length > 0
  })
}

/**
 * Put a post back in the queue.
 *
 * `deferred` marks the reasons that are not the post's fault — quota, expired
 * containers — and refunds the attempt `claim` charged, counting it against the
 * unbounded `publishDeferrals` instead. The two used to be one counter, so the
 * quota branch's own comment ("rather than burning an attempt") described
 * something the code did not do.
 *
 * `greatest(..., 0)` because the refund must never drive the count negative if
 * this is ever reached without a matching claim.
 */
async function reschedule(
  orgId: string,
  postId: string,
  delayMs: number,
  reason: string,
  { deferred = false }: { deferred?: boolean } = {},
): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx
      .update(posts)
      .set({
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + delayMs),
        failureReason: reason,
        publishLeaseUntil: null,
        ...(deferred
          ? {
              publishAttempts: sql`greatest(${posts.publishAttempts} - 1, 0)`,
              publishDeferrals: sql`${posts.publishDeferrals} + 1`,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId))
  })
}

async function markFailed(orgId: string, postId: string, reason: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx
      .update(posts)
      .set({
        status: 'failed',
        failureReason: reason,
        publishLeaseUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId))
  })
}

async function markAccountBroken(
  orgId: string,
  postId: string,
  accountId: string,
  reason: string,
): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx
      .update(posts)
      .set({ status: 'failed', failureReason: reason, updatedAt: new Date() })
      .where(eq(posts.id, postId))

    await tx
      .update(igAccounts)
      .set({ status: 'token_expired', lastError: reason, updatedAt: new Date() })
      // Without this WHERE, one post failing marked EVERY account in the
      // organization as expired and halted all publishing for that tenant.
      // Row-level security limited the damage to one tenant instead of the
      // whole install — which is the argument for the RLS design, not a
      // reason to leave the clause out.
      .where(eq(igAccounts.id, accountId))
  })
}

/** Hashtags go at the end of the caption; there is no separate API field. */
function buildCaption(caption: string, hashtags: string[]): string {
  const tags = hashtags.filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`))
  const body = tags.length ? `${caption}\n\n${tags.join(' ')}` : caption
  return body.slice(0, 2200)
}

export { MAX_ATTEMPTS }
