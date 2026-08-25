import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { withOrg, type TenantTx } from '../rls.ts'
import { claims, niches, posts, slides, type assets } from '../schema/index.ts'
import type { ClaimSource, SlideContent } from '../types.ts'

/**
 * Tenant-scoped data access for posts.
 *
 * Every function here takes an `orgId` and runs inside `withOrg`, so row-level
 * security is active for the whole operation. Nothing in this file writes a
 * `WHERE org_id = …` clause by hand — that is the database's job, and doing it
 * here as well would create two places for the rule to drift.
 */

export interface SaveDraftInput {
  orgId: string
  nicheId: string
  /**
   * The account this post will publish to, copied from its channel.
   *
   * Copied rather than resolved through `nicheId` at publish time, which would be
   * less code and wrong: repointing a channel at a different account later would
   * silently rewrite where every past post claims to have gone, and the editorial
   * record is supposed to answer that question months afterwards. An answer that
   * moves is not a record. See docs/decisions/0004-which-account-a-post-goes-to.md.
   */
  igAccountId?: string | null
  format: string
  templateId: string
  themeId: string
  title: string
  hook: string
  caption: string
  hashtags: string[]
  aiDisclosure: boolean
  /** Normalised hash of the premise, for deduplication against history. */
  ideaFingerprint: string
  /**
   * Defaults to `review`. Set to `rejected` when the gate stopped the run
   * before anything was written: a post with no slides sitting in the review
   * column is not something a person can review, but the claims and sources
   * behind the refusal are still worth keeping.
   */
  status?: 'review' | 'rejected'
  /** Why it was rejected, when it was. Shown on the review page. */
  reviewNotes?: string
  /** Pages the verifier opened. See posts.consultedSources. */
  consultedSources?: Array<{ url: string; title: string }>
  slides: Array<{
    role: string
    content: SlideContent
    altText: string
  }>
  claims: Array<{
    claim: string
    verdict: 'supported' | 'disputed' | 'false' | 'unverifiable'
    confidence: number
    reasoning: string
    isCore: boolean
    sources: ClaimSource[]
    slideIndex?: number
  }>
}

/**
 * Persist a complete pipeline run.
 *
 * Written in one transaction: a post whose slides saved but whose claims did
 * not would appear fully verified in the review UI while having no evidence
 * behind it — the exact failure the fact-check gate exists to prevent.
 */
export async function saveDraft(input: SaveDraftInput): Promise<string> {
  return withOrg(input.orgId, async (tx) => {
    const [post] = await tx
      .insert(posts)
      .values({
        orgId: input.orgId,
        nicheId: input.nicheId,
        igAccountId: input.igAccountId ?? null,
        status: input.status ?? 'review',
        reviewNotes: input.reviewNotes ?? null,
        format: input.format,
        templateId: input.templateId,
        themeId: input.themeId,
        title: input.title,
        hook: input.hook,
        caption: input.caption,
        hashtags: input.hashtags,
        aiDisclosure: input.aiDisclosure,
        ideaFingerprint: input.ideaFingerprint,
        consultedSources: input.consultedSources ?? [],
      })
      .returning({ id: posts.id })

    const postId = post!.id

    if (input.slides.length > 0) {
      await tx.insert(slides).values(
        input.slides.map((slide, index) => ({
          orgId: input.orgId,
          postId,
          index,
          role: slide.role,
          content: slide.content,
          altText: slide.altText,
        })),
      )
    }

    if (input.claims.length > 0) {
      await tx.insert(claims).values(
        input.claims.map((claim) => ({
          orgId: input.orgId,
          postId,
          claim: claim.claim,
          verdict: claim.verdict,
          confidence: claim.confidence,
          reasoning: claim.reasoning,
          isCore: claim.isCore,
          sources: claim.sources,
          slideIndex: claim.slideIndex ?? null,
        })),
      )
    }

    return postId
  })
}

export interface PostSummary {
  id: string
  title: string
  hook: string
  status: string
  format: string
  nicheName: string
  scheduledAt: Date | null
  publishedAt: Date | null
  updatedAt: Date
  slideCount: number
  /** Core claims that are not `supported` — the reviewer's first question. */
  unresolvedClaims: number
}

/**
 * A place in the board's ordering, for fetching the next page.
 *
 * `(updatedAt, id)` rather than an offset. An offset re-scans and re-sorts
 * everything before the page on every request, and — worse for a board people
 * leave open — a post edited between two page loads shifts the window, so a row
 * is silently skipped or shown twice. The id breaks ties, because `updated_at`
 * is not unique and a page boundary landing inside a group of equal timestamps
 * would do the same thing.
 */
export interface PostCursor {
  updatedAt: Date
  id: string
}

export interface PostPage {
  posts: PostSummary[]
  /** Pass back as `after` for the next page; null when this is the last one. */
  nextCursor: PostCursor | null
}

/**
 * Board view. Ordered by most recently touched, which is what a reviewer wants.
 *
 * Served by `posts_org_updated_idx` — `(org_id, updated_at DESC)` — which did
 * not exist. The closest index was `(org_id, status)`, which cannot serve this
 * sort, so Postgres read every post in the organization and sorted the lot to
 * return a hundred rows.
 *
 * The two counts are `LEFT JOIN LATERAL`, not correlated scalar subqueries in
 * the SELECT list. Written the old way, a full page ran two hundred separate
 * subqueries; as laterals the planner runs each once per row with the join
 * indexes available and can choose a different strategy entirely.
 */
export async function listPosts(
  orgId: string,
  options: { status?: string; limit?: number; after?: PostCursor } = {},
): Promise<PostPage> {
  const limit = options.limit ?? 100

  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({
        id: posts.id,
        title: posts.title,
        hook: posts.hook,
        status: posts.status,
        format: posts.format,
        nicheName: niches.name,
        scheduledAt: posts.scheduledAt,
        publishedAt: posts.publishedAt,
        updatedAt: posts.updatedAt,
        slideCount: sql<number>`coalesce(slide_count.count, 0)`,
        unresolvedClaims: sql<number>`coalesce(unresolved.count, 0)`,
      })
      .from(posts)
      .innerJoin(niches, eq(niches.id, posts.nicheId))
      /*
        Correlated, like the claims count below it.

        This was a CTE that grouped `slides` with no WHERE and no correlation —
        so every board load hash-aggregated EVERY slide row in the organization
        and then joined a hundred of them. The cost grew with total slides ever
        created rather than with what is on screen, which is the shape that
        looks fine on a demo install and is unusable at a thousand posts.

        As a lateral it is one indexed lookup per returned row against
        `slides_post_index_idx`, whose leading column is `post_id`.
      */
      .leftJoin(
        sql`lateral (
          select count(*)::int as count
          from ${slides}
          where ${slides.postId} = ${posts.id}
        ) as slide_count`,
        sql`true`,
      )
      .leftJoin(
        sql`lateral (
          select count(*)::int as count
          from ${claims}
          where ${claims.postId} = ${posts.id}
            and ${claims.isCore} = true
            and ${claims.verdict} <> 'supported'
            and ${claims.resolvedBy} is null
        ) as unresolved`,
        sql`true`,
      )
      .where(
        and(
          options.status ? eq(posts.status, options.status as never) : undefined,
          /*
            Keyset predicate. Strictly "older than the cursor, or the same
            instant with a smaller id" — the row comparison Postgres can
            evaluate against the index directly.
          */
          options.after
            ? sql`(${posts.updatedAt}, ${posts.id}) < (${options.after.updatedAt}, ${options.after.id})`
            : undefined,
        ),
      )
      .orderBy(desc(posts.updatedAt), desc(posts.id))
      // One extra row, purely to learn whether another page exists without a
      // second count query.
      .limit(limit + 1)

    const page = rows.slice(0, limit)
    const last = page[page.length - 1]

    return {
      posts: page,
      nextCursor:
        rows.length > limit && last ? { updatedAt: last.updatedAt, id: last.id } : null,
    }
  })
}

/**
 * How many posts sit in each status, counted in the database.
 *
 * Separate from `listPosts` on purpose. The board draws both the cards and the
 * number beside each column heading, and deriving the number from the fetched
 * page makes it a count of *what was fetched* — capped at the list limit —
 * while it reads as a count of what exists. A number that is silently wrong
 * once the org passes the cap is worse than no number, because nothing about
 * it looks wrong. One extra grouped count is cheap; the index on
 * (org_id, status) already exists.
 */
export async function countPostsByStatus(orgId: string): Promise<Record<string, number>> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({ status: posts.status, count: sql<number>`count(*)::int` })
      .from(posts)
      .groupBy(posts.status)

    return Object.fromEntries(rows.map((row) => [row.status as string, row.count]))
  })
}

export interface PostDetail {
  post: typeof posts.$inferSelect
  niche: typeof niches.$inferSelect
  slides: Array<typeof slides.$inferSelect & { asset?: typeof assets.$inferSelect | null }>
  claims: Array<typeof claims.$inferSelect>
}

export async function getPost(orgId: string, postId: string): Promise<PostDetail | null> {
  return withOrg(orgId, async (tx) => {
    const [post] = await tx.select().from(posts).where(eq(posts.id, postId)).limit(1)
    if (!post) return null

    const [niche] = await tx.select().from(niches).where(eq(niches.id, post.nicheId)).limit(1)

    const slideRows = await tx
      .select()
      .from(slides)
      .where(eq(slides.postId, postId))
      .orderBy(slides.index)

    const claimRows = await tx.select().from(claims).where(eq(claims.postId, postId))

    return {
      post,
      niche: niche!,
      slides: slideRows,
      claims: claimRows,
    }
  })
}

/**
 * Key-order-independent JSON, for comparing two slide contents.
 *
 * Needed because one side comes from a form and the other from `jsonb`, and
 * Postgres does not preserve the key order anything was written with. Sorting
 * is the same reason `computeRenderHash` sorts — which cannot be reused here,
 * because @claimfold/render depends on this package rather than the other way
 * round.
 */
function stableJson(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort)
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          // Codepoint order, not localeCompare: the latter is locale-dependent
          // and two containers with different LANG settings would disagree.
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, item]) => [key, sort(item)]),
      )
    }
    return input
  }
  return JSON.stringify(sort(value))
}

/** The words on a slide, without the picture behind them. */
function withoutImage(content: SlideContent): SlideContent {
  const { imageAssetId: _imageAssetId, ...text } = content
  return text
}

export interface SlidePatch {
  content?: SlideContent
  altText?: string
  /** Layout override. `null` puts the slide back to inheriting the post's. */
  templateId?: string | null
  /** Recorded against a copy edit. Ignored for anything else. */
  editedBy?: string
  /**
   * The `updatedAt` the editor loaded.
   *
   * Omit to write unconditionally. Supplying it turns the write into a
   * compare-and-set, which is what stops two open tabs from silently
   * overwriting each other.
   */
  expectedUpdatedAt?: Date
}

export type SlidePatchResult =
  | 'saved'
  /** No such slide on this post — wrong id, or it was deleted underneath. */
  | 'missing'
  /** Someone else changed it since the editor loaded it. Nothing was written. */
  | 'stale'

/**
 * Edit one slide.
 *
 * Three fields, three different consequences, and getting them mixed up is how
 * you either publish a stale image or cry wolf about verification:
 *
 * | field        | pixels change | counts as an edit |
 * | ------------ | ------------- | ----------------- |
 * | `content`    | yes           | yes               |
 * | `templateId` | yes           | no                |
 * | `altText`    | no            | no                |
 *
 * Alt text is not in the render hash — correctly, it does not change a pixel —
 * so invalidating the cached image for an alt-text fix would re-rasterise a
 * slide to produce an identical JPEG. And a layout change touches no claim, so
 * flagging it as an edit would train reviewers to ignore the warning that
 * matters.
 *
 * Scoped by `postId` as well as `slideId`. Row-level security already stops a
 * cross-tenant write, which is the boundary that counts, but within one
 * organization a slide id belonging to a different post would otherwise be
 * accepted — and the caller would then revalidate the wrong page.
 */
export async function updateSlide(
  orgId: string,
  postId: string,
  slideId: string,
  patch: SlidePatch,
): Promise<SlidePatchResult> {
  const now = new Date()

  return withOrg(orgId, async (tx) => {
    const [existing] = await tx
      .select({
        updatedAt: slides.updatedAt,
        content: slides.content,
        templateId: slides.templateId,
      })
      .from(slides)
      .where(and(eq(slides.id, slideId), eq(slides.postId, postId)))
      .limit(1)

    if (!existing) return 'missing'

    /**
     * An early exit, not the lock.
     *
     * Both sides are drizzle-parsed values from the same column, so both have
     * been truncated from Postgres microseconds to JavaScript milliseconds the
     * same way. Comparing a raw database timestamp against a round-tripped one
     * would not be safe.
     *
     * This check alone WAS the lock, and it did not work. Reading `updatedAt`,
     * comparing it in JavaScript, then issuing an UPDATE keyed only on
     * (id, postId) is a time-of-check/time-of-use gap: under READ COMMITTED two
     * concurrent saves both read the same timestamp, both pass here, and the
     * second silently overwrites the first. The docstring claimed it "stops two
     * open tabs from silently overwriting each other" — it stopped the
     * sequential case only, which is the case the tests exercise.
     *
     * Kept because it turns the common conflict into one round trip instead of
     * two. The real guarantee is the predicate on the UPDATE below.
     */
    if (
      patch.expectedUpdatedAt &&
      existing.updatedAt.getTime() !== patch.expectedUpdatedAt.getTime()
    ) {
      return 'stale'
    }

    /**
     * Compared rather than assumed, because "was this edited?" and "do the
     * pixels change?" are different questions with different consequences.
     *
     * Swapping the picture on a slide changes the pixels but does not touch a
     * word any claim was checked against, so it must not raise the
     * verification warning — a warning that fires when someone changes a photo
     * is one people learn to click past. And re-saving a form without changing
     * anything must not stamp an edit at all, or opening the editor to look at
     * a slide would be enough to mark the post as rewritten.
     */
    const contentChanged =
      patch.content !== undefined && stableJson(patch.content) !== stableJson(existing.content)

    const textChanged =
      patch.content !== undefined &&
      stableJson(withoutImage(patch.content)) !== stableJson(withoutImage(existing.content))

    const layoutChanged =
      patch.templateId !== undefined && (patch.templateId ?? null) !== existing.templateId

    const changesPixels = contentChanged || layoutChanged
    const isCopyEdit = textChanged

    /*
      The actual compare-and-set.

      `expectedUpdatedAt` goes into the WHERE, so Postgres — not JavaScript —
      decides whether this row is still the one the editor loaded. Two
      concurrent saves now both attempt the UPDATE and exactly one matches; the
      loser gets zero rows back and is told it is stale, instead of quietly
      winning by arriving second.
    */
    const written = await tx
      .update(slides)
      .set({
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...(patch.altText !== undefined ? { altText: patch.altText } : {}),
        ...(patch.templateId !== undefined ? { templateId: patch.templateId } : {}),
        // The stored image no longer matches. Null rather than stale: a
        // reviewer approving text they cannot see rendered is exactly the
        // mistake this whole review step exists to prevent.
        ...(changesPixels ? { renderHash: null, assetId: null } : {}),
        ...(isCopyEdit ? { editedAt: now, editedBy: patch.editedBy ?? null } : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(slides.id, slideId),
          eq(slides.postId, postId),
          ...(patch.expectedUpdatedAt ? [eq(slides.updatedAt, patch.expectedUpdatedAt)] : []),
        ),
      )
      .returning({ id: slides.id })

    if (written.length === 0) return patch.expectedUpdatedAt ? 'stale' : 'missing'

    return 'saved'
  })
}

/* ─── Structure ──────────────────────────────────────────────────────────── */

export type StructureResult =
  | 'saved'
  | 'missing'
  /** The carousel is not the shape the editor was looking at. Nothing written. */
  | 'stale'
  /** Would leave too few slides to publish. */
  | 'too_few'
  /** Would exceed what the format or the API allows. */
  | 'too_many'
  /** Nowhere to move it. */
  | 'no_op'

/**
 * Renumber a post's slides, dragging claim attribution along with them.
 *
 * Two things here are not obvious and both were arrived at by asking what
 * Postgres actually does.
 *
 * **Why two passes.** `slides_post_index_idx` is a plain unique index, which
 * Postgres enforces per row as an UPDATE walks the table rather than once at
 * the end of the statement. So `SET index = index + 1` explodes the moment two
 * rows would briefly share a value. Parking every row in the negative range
 * first makes any permutation collision-free without a schema change; a
 * DEFERRABLE constraint would also work but means converting an existing index.
 *
 * **Why claims move too.** `claims.slideIndex` says which slide asserts a
 * claim. Reordering without remapping silently re-points every claim at the
 * wrong slide — which does not break the layout, it corrupts the evidence
 * trail, and nobody looking at the screen would notice. That is the reason
 * structural editing is the last thing built rather than the first.
 *
 * A claim whose slide is gone has its `slideIndex` set to null and is otherwise
 * left alone. Never deleted: a checked claim and its sources are the record. An
 * unattributed false core claim still blocks the gate, and the way past it is
 * the existing override, which is recorded against the person who takes it.
 */
async function renumberSlides(
  tx: TenantTx,
  postId: string,
  before: Array<{ id: string; index: number }>,
  afterIds: string[],
): Promise<void> {
  const newIndexById = new Map(afterIds.map((id, position) => [id, position]))

  await tx
    .update(slides)
    .set({ index: sql`-${slides.index} - 1` })
    .where(eq(slides.postId, postId))

  for (const [id, index] of newIndexById) {
    await tx
      .update(slides)
      .set({ index })
      .where(and(eq(slides.id, id), eq(slides.postId, postId)))
  }

  const moved = before
    .map((row) => ({ from: row.index, to: newIndexById.get(row.id) ?? null }))
    .filter((entry) => entry.to !== entry.from)

  if (moved.length === 0) return

  // Same two-pass reasoning, for a different reason: a sequential remap would
  // re-match rows it had already moved, so a straight swap would collapse both
  // claims onto one slide.
  await tx
    .update(claims)
    .set({ slideIndex: sql`-${claims.slideIndex} - 1` })
    .where(
      and(
        eq(claims.postId, postId),
        inArray(
          claims.slideIndex,
          moved.map((entry) => entry.from),
        ),
      ),
    )

  for (const { from, to } of moved) {
    await tx
      .update(claims)
      .set({ slideIndex: to })
      .where(and(eq(claims.postId, postId), eq(claims.slideIndex, -from - 1)))
  }
}

/** Slides in carousel order, with just enough to reorder them. */
async function slideOrder(
  tx: TenantTx,
  postId: string,
): Promise<Array<{ id: string; index: number }>> {
  return tx
    .select({ id: slides.id, index: slides.index })
    .from(slides)
    .where(eq(slides.postId, postId))
    .orderBy(slides.index)
}

/**
 * `expectedCount` is a cheap optimistic lock for shape changes: if the carousel
 * gained or lost a slide since the page was drawn, the position the person
 * clicked no longer means what they thought it meant.
 */
export async function moveSlide(
  orgId: string,
  postId: string,
  slideId: string,
  direction: 'up' | 'down',
  expectedCount?: number,
): Promise<StructureResult> {
  return withOrg(orgId, async (tx) => {
    const order = await slideOrder(tx, postId)
    if (expectedCount !== undefined && order.length !== expectedCount) return 'stale'

    const from = order.findIndex((row) => row.id === slideId)
    if (from === -1) return 'missing'

    const to = direction === 'up' ? from - 1 : from + 1
    if (to < 0 || to >= order.length) return 'no_op'

    const afterIds = order.map((row) => row.id)
    const [moving] = afterIds.splice(from, 1)
    afterIds.splice(to, 0, moving!)

    await renumberSlides(tx, postId, order, afterIds)
    await touchPost(tx, postId)
    return 'saved'
  })
}

export async function deleteSlide(
  orgId: string,
  postId: string,
  slideId: string,
  minSlides: number,
  expectedCount?: number,
): Promise<StructureResult> {
  return withOrg(orgId, async (tx) => {
    const order = await slideOrder(tx, postId)
    if (expectedCount !== undefined && order.length !== expectedCount) return 'stale'
    if (!order.some((row) => row.id === slideId)) return 'missing'
    if (order.length - 1 < minSlides) return 'too_few'

    await tx.delete(slides).where(and(eq(slides.id, slideId), eq(slides.postId, postId)))

    await renumberSlides(
      tx,
      postId,
      order,
      order.filter((row) => row.id !== slideId).map((row) => row.id),
    )
    await touchPost(tx, postId)
    return 'saved'
  })
}

/**
 * Insert an empty slide after `afterIndex` (use `-1` to put it first).
 *
 * It arrives with no copy and no alt text, so the gate blocks approval until
 * someone writes both. That is the intended shape: the missing alt text is
 * now a thing a person can fix rather than a dead end.
 */
export async function addSlide(
  orgId: string,
  postId: string,
  input: { role: string; afterIndex: number; maxSlides: number; templateId?: string | null },
  expectedCount?: number,
): Promise<StructureResult> {
  return withOrg(orgId, async (tx) => {
    const order = await slideOrder(tx, postId)
    if (expectedCount !== undefined && order.length !== expectedCount) return 'stale'
    if (order.length + 1 > input.maxSlides) return 'too_many'

    // Appended first, at an index nothing occupies, then moved into place by
    // the renumber pass — which is the only code that knows how to keep the
    // unique index and the claim attribution happy at the same time.
    const [inserted] = await tx
      .insert(slides)
      .values({
        orgId,
        postId,
        index: order.length,
        role: input.role,
        content: {},
        altText: '',
        templateId: input.templateId ?? null,
      })
      .returning({ id: slides.id })

    const afterIds = order.map((row) => row.id)
    const position = Math.min(Math.max(input.afterIndex + 1, 0), afterIds.length)
    afterIds.splice(position, 0, inserted!.id)

    await renumberSlides(tx, postId, order, afterIds)
    await touchPost(tx, postId)
    return 'saved'
  })
}

/**
 * The board orders by `updatedAt`, so a structural change has to move it.
 * Editing a slide already does this through the slide's own row; the post row
 * is what the board reads.
 */
async function touchPost(tx: TenantTx, postId: string): Promise<void> {
  await tx.update(posts).set({ updatedAt: new Date() }).where(eq(posts.id, postId))
}

/**
 * Edit the post itself: its text, and the look shared by all its slides.
 *
 * Deliberately does NOT clear any slide's `renderHash`, even though changing
 * `themeId` or `templateId` changes every slide's pixels. The publish worker
 * recomputes the hash from the live post and slide and re-renders on a
 * mismatch, so the invalidation is already handled one layer down. Nulling the
 * column here as well would work and would be redundant — this note exists
 * because "changing the theme does not invalidate the cache" reads like a bug
 * until you know where the comparison happens.
 */
export async function updatePost(
  orgId: string,
  postId: string,
  patch: Partial<{
    caption: string
    hashtags: string[]
    hook: string
    title: string
    themeId: string
    templateId: string
    scheduledAt: Date | null
    reviewNotes: string
    /**
     * Posted as a separate comment straight after publishing.
     *
     * The publishing client has handled this since it was written and nothing
     * could ever fill it in, so it always posted nothing. Its usual job is the
     * source list: out of the caption, where it would eat the first 125
     * characters the feed shows, but still on the post.
     */
    firstComment: string | null
    aiDisclosure: boolean
    /** Per-post override of the channel's account, chosen before approval. */
    igAccountId: string | null
  }>,
): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx
      .update(posts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(posts.id, postId))
  })
}

/**
 * Approve and schedule.
 *
 * Deliberately requires the caller to have already evaluated the gate — this
 * function records a decision, it does not make one. Keeping the check in one
 * place (the gate) rather than duplicating it here stops the two from drifting.
 */
/**
 * Signing a post off, with the time it should go out.
 *
 * `scheduledAt` of `null` means "as soon as possible", which is stored as a
 * time of now rather than as a separate status. That is the whole fix for a
 * gap that sat here unnoticed: this used to write `approved` when no time was
 * given, and the worker only ever selects `scheduled`. So approving a post
 * from the dashboard — which never sent a time, because no control for one
 * existed — moved it into a column called "Approved" that nothing could ever
 * take it out of. Every part worked; the handover did not exist.
 *
 * One status out of this function, therefore one thing the worker has to
 * understand. `approved` remains in the enum only for rows written before
 * this change; see `findDuePosts`, which sweeps them up.
 */
export async function approvePost(
  orgId: string,
  postId: string,
  userId: string,
  scheduledAt: Date | null,
): Promise<boolean> {
  const now = new Date()

  return withOrg(orgId, async (tx) => {
    const approved = await tx
      .update(posts)
      .set({
        status: 'scheduled',
        approvedBy: userId,
        approvedAt: now,
        scheduledAt: scheduledAt ?? now,
        updatedAt: now,
      })
      /*
        Guarded for the same reason `rejectPost` is.

        This was an unconditional UPDATE on the id. A POST carrying a published
        post's id moved it back to `scheduled` with a fresh time — and the
        worker would then publish the same carousel to the same audience a
        second time. The gate check in `approveAction` runs first, but it
        answers "is this defensible", not "has this already gone out".
      */
      .where(and(eq(posts.id, postId), inArray(posts.status, ['review', 'rejected', 'failed'])))
      .returning({ id: posts.id })

    return approved.length > 0
  })
}

/**
 * Take a scheduled post back off the queue, returning it to review.
 *
 * The door that only opened one way. Approving moved a post to `scheduled` and
 * `isEditable` locks that status, so from the moment someone approved there was
 * no cancel, no unschedule and no reschedule anywhere in the product — the only
 * remaining move was to wait for it to publish. For a control whose default is
 * "publish immediately", that is the wrong shape: the most likely reason to
 * want this is realising, seconds later, that the time was wrong.
 *
 * Guarded on `scheduled` alone. `publishing` deliberately cannot be cancelled:
 * the worker owns that row, may already have created containers, and may be
 * between `media_publish` and its own commit. Racing it is exactly how a
 * duplicate happens.
 *
 * Clears the publish bookkeeping so a later re-approval starts clean rather
 * than inheriting a spent attempt count.
 *
 * @returns false when the post was no longer scheduled; nothing written.
 */
export async function unschedulePost(orgId: string, postId: string): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const moved = await tx
      .update(posts)
      .set({
        status: 'review',
        scheduledAt: null,
        approvedBy: null,
        approvedAt: null,
        publishAttempts: 0,
        publishDeferrals: 0,
        publishLeaseUntil: null,
        igCreationId: null,
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(posts.id, postId), eq(posts.status, 'scheduled')))
      .returning({ id: posts.id })

    return moved.length > 0
  })
}

/**
 * Move a scheduled post to a different time, without sending it back to review.
 *
 * Separate from `unschedulePost` because they answer different questions. "Not
 * this, not yet" is a review decision; "yes, but at seven" is not, and making
 * someone re-approve a post they already read — re-running the gate, re-signing
 * it off — to change a timestamp would train them to approve without reading.
 */
export async function reschedulePost(
  orgId: string,
  postId: string,
  scheduledAt: Date,
): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const moved = await tx
      .update(posts)
      .set({ scheduledAt, failureReason: null, updatedAt: new Date() })
      .where(and(eq(posts.id, postId), eq(posts.status, 'scheduled')))
      .returning({ id: posts.id })

    return moved.length > 0
  })
}

/**
 * Send a post back with a reason.
 *
 * Refuses anything already out of review. This was an unconditional UPDATE on
 * the id, and `rejectAction` checks the caller's capability but not the post's
 * status — so a POST carrying a *published* post's id flipped it to `rejected`
 * and overwrote `reviewNotes`, which is where the gate records why it let the
 * post through. The only thing standing in the way was the `disabled` attribute
 * on a button, and this file's own header says the disabled attribute is a
 * convenience for the reviewer, not a control.
 *
 * Destroying the reasoning behind a decision on something already public is a
 * worse outcome than any of the edit paths, all of which route through
 * `isEditable` first.
 *
 * @returns false when the post was not in a rejectable state; nothing written.
 */
export async function rejectPost(orgId: string, postId: string, reason: string): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const rejected = await tx
      .update(posts)
      .set({ status: 'rejected', reviewNotes: reason, updatedAt: new Date() })
      .where(
        and(
          eq(posts.id, postId),
          // The states a human may still send back. `publishing` is excluded on
          // purpose: the worker is mid-flight and owns the row.
          inArray(posts.status, ['review', 'scheduled', 'failed']),
        ),
      )
      .returning({ id: posts.id })

    return rejected.length > 0
  })
}

/**
 * Human override of a claim verdict.
 *
 * Recorded rather than silently applied: who overrode what, and why. If a
 * published post is later challenged, this is the audit trail that answers it.
 */
export async function resolveClaim(
  orgId: string,
  claimId: string,
  userId: string,
  note: string,
): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx
      .update(claims)
      .set({ resolvedBy: userId, resolvedNote: note })
      .where(eq(claims.id, claimId))
  })
}

/** Titles already used, so ideation does not repeat itself. */
export async function recentTitles(orgId: string, limit = 60): Promise<string[]> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({ title: posts.title })
      .from(posts)
      .where(inArray(posts.status, ['published', 'scheduled', 'approved']))
      .orderBy(desc(posts.createdAt))
      .limit(limit)

    return rows.map((r) => r.title).filter(Boolean)
  })
}

/** True when this idea has been produced before. Cheap guard against repeats. */
export async function isDuplicate(orgId: string, fingerprint: string): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.ideaFingerprint, fingerprint)))
      .limit(1)
    return Boolean(row)
  })
}

