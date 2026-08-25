import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import type {
  ClaimSource,
  LanguageTag,
  NicheRules,
  PostingCadence,
  PromptOverrides,
  SlideContent,
  SlideFormat,
} from '../types.ts'
import { organization, user } from './auth.ts'
import { claimVerdict, igAccountStatus, jobStatus, postStatus } from './enums.ts'

/**
 * Every table below carries `org_id` and is protected by row-level security
 * (see src/rls.ts). A query that forgets its WHERE clause returns zero rows
 * instead of another tenant's data — application-layer scoping fails open,
 * RLS fails closed, and this product is sold to people whose accounts must
 * never see each other.
 */

/**
 * A niche is the whole topic configuration, stored as data so it can be
 * created, edited, cloned and switched at runtime with no code change.
 * An org may hold many and run them side by side.
 */
export const niches = pgTable(
  'niches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),

    // ── Voice ────────────────────────────────────────────────────────────
    language: text('language').$type<LanguageTag>().notNull().default('en'),
    /** Who this is for. Injected verbatim into every pipeline stage. */
    audience: text('audience').notNull().default(''),
    /** How it should sound. Injected verbatim into the writing stage. */
    voice: text('voice').notNull().default(''),

    // ── What to make ─────────────────────────────────────────────────────
    /** Ideation starting points. Grows as winning posts feed back in. */
    topicSeeds: jsonb('topic_seeds').$type<string[]>().notNull().default([]),
    /** Slide structures available to this niche. */
    formats: jsonb('formats').$type<SlideFormat[]>().notNull().default([]),
    promptOverrides: jsonb('prompt_overrides').$type<PromptOverrides>().notNull().default({}),
    hashtagSets: jsonb('hashtag_sets').$type<string[][]>().notNull().default([]),

    /**
     * The Instagram account this channel publishes to.
     *
     * The missing quarter of an identity this table already carried: `watermark`
     * is the handle and `cadence` is a publishing schedule, and both only mean
     * anything per account. Putting the account here rather than on the post
     * means choosing a channel *is* choosing an account, so the two can never
     * disagree — see docs/decisions/0004-which-account-a-post-goes-to.md.
     *
     * Null on channels created before this existed. Their posts are refused at
     * approval with a finding that says so, which is a visible prompt rather
     * than the silent retry loop that came before.
     */
    igAccountId: uuid('ig_account_id').references(() => igAccounts.id, {
      onDelete: 'set null',
    }),

    // ── How it looks ─────────────────────────────────────────────────────
    themeId: text('theme_id').notNull().default('default'),
    /**
     * Small persistent mark on every slide, usually the account handle.
     *
     * Belongs to the channel rather than the post: it is the same on every
     * carousel this niche produces, and that sameness is the point. Empty
     * means none. The renderer has accepted a watermark since the first
     * version; this is the column that finally supplies one.
     */
    watermark: text('watermark').notNull().default(''),
    /**
     * Overrides the theme's accent colour. Null keeps the theme's own.
     *
     * One colour rather than a whole palette, because the accent is what
     * carries a channel's identity — the rule, the kicker, the badge, the
     * tinted panel. Validated for contrast against the theme's background and
     * `onAccent` at save time, not at build time: the moment a colour becomes
     * user data, a test that reads the stylesheet cannot see it any more.
     */
    accentColor: text('accent_color'),

    // ── Guardrails ───────────────────────────────────────────────────────
    rules: jsonb('rules').$type<NicheRules>().notNull(),
    cadence: jsonb('cadence').$type<PostingCadence>().notNull(),

    isDefault: boolean('is_default').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('niches_org_slug_idx').on(t.orgId, t.slug),
    index('niches_org_idx').on(t.orgId),
    /*
      `channelsUsingAccount` had no index at all, and `ig_account_id` is
      `ON DELETE set null` — so every account deletion sequentially scanned
      every channel in the install. Exactly the gap already closed for
      `posts.ig_account_id`; this is the other half of it.
    */
    index('niches_org_account_idx').on(t.orgId, t.igAccountId),
  ],
)

/**
 * A connected Instagram account.
 *
 * Meta app credentials live HERE, per organization, not in env. That is what
 * keeps every install on Standard Access: each operator registers their own
 * Meta app and adds their own account as a role-holder, so nobody ever needs
 * App Review. Moving these to a shared install-wide app would silently make
 * Advanced Access mandatory.
 */
export const igAccounts = pgTable(
  'ig_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    igUserId: text('ig_user_id').notNull(),
    username: text('username').notNull(),

    /** AES-256-GCM, wrapped with ENCRYPTION_KEY. Never logged, never returned to the client. */
    encryptedToken: text('encrypted_token').notNull(),
    /** Long-lived tokens last 60 days and can only be refreshed while still valid. */
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),

    metaAppId: text('meta_app_id').notNull(),
    encryptedMetaAppSecret: text('encrypted_meta_app_secret').notNull(),

    status: igAccountStatus('status').notNull().default('connected'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ig_accounts_org_user_idx').on(t.orgId, t.igUserId),
    index('ig_accounts_org_idx').on(t.orgId),
    // Drives the refresh cron: find tokens nearing the 60-day cliff.
    index('ig_accounts_expiry_idx').on(t.tokenExpiresAt),
  ],
)

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    nicheId: uuid('niche_id')
      .notNull()
      .references(() => niches.id, { onDelete: 'restrict' }),
    igAccountId: uuid('ig_account_id').references(() => igAccounts.id, { onDelete: 'set null' }),

    status: postStatus('status').notNull().default('idea'),
    /** Format id from the niche pack. Text, not an enum — see schema/enums.ts. */
    format: text('format').notNull(),

    /** Internal working title, never published. */
    title: text('title').notNull().default(''),
    /**
     * The slide-1 hook. Also the grouping key for performance analysis —
     * "which hook patterns earn saves" is the question the whole insights
     * loop exists to answer.
     */
    hook: text('hook').notNull().default(''),
    caption: text('caption').notNull().default(''),
    hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
    /** Posted as a separate comment after publish; the API has no field for it. */
    firstComment: text('first_comment'),

    templateId: text('template_id').notNull().default('default'),
    themeId: text('theme_id').notNull().default('default'),

    /** Sets `is_ai_generated` on the publish call. */
    aiDisclosure: boolean('ai_disclosure').notNull().default(false),

    /** Normalised hash of the core idea, used to dedup against history. */
    ideaFingerprint: text('idea_fingerprint'),

    /**
     * Every page the verifier actually opened, whether or not it cited it.
     *
     * Deliberately distinct from `claims.sources`, which is what the model
     * *says* it relied on. A gap between the two is a signal worth showing a
     * reviewer: a claim marked supported by a model that opened nothing, or
     * that read ten pages and cited one, is worth a second look. Collecting
     * this and then discarding it — as an earlier version did — throws away
     * the difference between "consulted" and "cited", which is precisely the
     * distinction this product exists to make.
     */
    consultedSources: jsonb('consulted_sources')
      .$type<Array<{ url: string; title: string }>>()
      .notNull()
      .default([]),

    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    igMediaId: text('ig_media_id'),
    igPermalink: text('ig_permalink'),
    /**
     * The parent carousel container, written BEFORE `media_publish` is called.
     *
     * This column exists because `igMediaId` alone cannot make publishing
     * exactly-once. `media_publish` returning 200 and our transaction
     * committing are two separate events, and a worker that dies between them
     * leaves a post that Instagram has already published and our database
     * believes is merely stranded — which the recovery path then republishes.
     * The idempotency guard covered the case where our HTTP call timed out; it
     * could not cover the gap after Meta accepted.
     *
     * With this written first, recovery has something durable to ask about:
     * the container's own `status_code` says whether it went live. A duplicate
     * carousel on a customer's real account is not something an apology fixes,
     * so the cost of one extra UPDATE per publish is not a close call.
     */
    igCreationId: text('ig_creation_id'),

    reviewNotes: text('review_notes'),
    failureReason: text('failure_reason'),
    /**
     * Publish attempts so far.
     *
     * Without a ceiling, a post that fails for a persistent-but-classified-as-
     * retryable reason is rescheduled forever, and every attempt costs a
     * render. Bounded here rather than in the worker's memory so the count
     * survives a restart.
     *
     * Counts REAL attempts only — see `publishDeferrals`.
     */
    publishAttempts: integer('publish_attempts').notNull().default(0),
    /**
     * Times this post was put back for a reason that is not its fault.
     *
     * Split out from `publishAttempts` because the two were the same counter
     * and the accounting ran backwards: `claim` increments on every claim, and
     * the quota branch in the worker says it is requeueing "rather than burning
     * an attempt" — but the attempt was already burnt. Four brushes with Meta's
     * rolling 25-post/24h limit and a perfectly healthy post was marked
     * `failed` forever, with a message blaming the quota.
     *
     * Unbounded on purpose. A post deferred fifty times is a post waiting for
     * quota, which is a queue-depth problem, not a broken post.
     */
    publishDeferrals: integer('publish_deferrals').notNull().default(0),
    /**
     * When the current claim stops being trusted.
     *
     * A claim used to be a single `updatedAt` stamp compared against a fixed 20
     * minutes, and nothing refreshed it while work was happening. A ten-slide
     * render plus Meta's sequential per-child processing can exceed that, so a
     * second worker would see a live publish as abandoned, release it, and
     * publish the same carousel concurrently. The lease is renewed as each
     * slide finishes; an expired one means the holder is genuinely gone.
     */
    publishLeaseUntil: timestamp('publish_lease_until', { withTimezone: true }),
    approvedBy: text('approved_by').references(() => user.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('posts_org_status_idx').on(t.orgId, t.status),
    index('posts_org_niche_idx').on(t.orgId, t.nicheId),
    // The publish queue scan: due, approved, not yet sent.
    index('posts_scheduled_idx').on(t.status, t.scheduledAt),
    index('posts_fingerprint_idx').on(t.orgId, t.ideaFingerprint),
    /*
      `recentTitles` filters by org and status and sorts by `created_at`. Both
      composite indexes above sort by `updated_at`, so neither could serve it
      and the planner fell back to a scan-and-sort.
    */
    index('posts_org_status_created_idx').on(t.orgId, t.status, t.createdAt.desc()),
    /*
      The board query: every post in an org, newest edit first.

      It had no index at all. `listPosts` orders by `updated_at desc` with a
      default limit of 100, and the closest existing index is (org_id, status) —
      which cannot serve the sort, so Postgres read every post in the org and
      sorted the lot to return a page.
    */
    index('posts_org_updated_idx').on(t.orgId, t.updatedAt.desc()),
    index('posts_org_status_updated_idx').on(t.orgId, t.status, t.updatedAt.desc()),
    // `loadContext` and the account-in-use check both filter on this, and an
    // unindexed FK referent also means a sequential scan on every account
    // delete.
    index('posts_ig_account_idx').on(t.igAccountId),
  ],
)

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** Path relative to the storage root; served unauthenticated at PUBLIC_ASSET_URL. */
    path: text('path').notNull(),
    /**
     * `render` for a rasterised slide, `upload` for a picture a person supplied.
     *
     * Same table and same content-hash paths, because they are the same kind of
     * object to everything downstream: an immutable JPEG identified by id. The
     * distinction exists so the picture library can list what a person can
     * reuse without offering them every slide the renderer has ever produced.
     */
    kind: text('kind').$type<'render' | 'upload'>().notNull().default('render'),
    sha256: text('sha256').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    /** Always image/jpeg — Instagram rejects PNG on the publishing API. */
    mime: text('mime').notNull().default('image/jpeg'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assets_org_idx').on(t.orgId),
    /*
      Scoped to the org rather than unique on `path` alone.

      The bare-path version was safe only by accident: `saveSlideImage` prefixes
      every path with the org id, so a collision across tenants cannot happen —
      but the index does not know that. The consequence showed up in
      `recordAsset`, whose read-back after `onConflictDoNothing` runs under RLS:
      a conflict the current tenant cannot see returned no row and threw
      "conflicted on insert but could not be read back", an unhandled 500 for a
      case the code had already thought about. With the org in the key, a
      conflict is always one this tenant can read.
    */
    uniqueIndex('assets_org_path_idx').on(t.orgId, t.path),
    // The picture library: uploads for one org, newest first.
    index('assets_org_kind_created_idx').on(t.orgId, t.kind, t.createdAt.desc()),
    /*
      The same columns without the org, because `findOrphanedRenderAssets` runs
      under `withoutTenantScope` — it is a cross-tenant sweep, so it supplies no
      `org_id` predicate and cannot use the index above, whose leading column is
      exactly that. Every retention sweep was a full scan of `assets`.
    */
    index('assets_kind_created_idx').on(t.kind, t.createdAt),
  ],
)

export const slides = pgTable(
  'slides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    /** Zero-based position in the carousel. Slide 0 sets the aspect ratio for all others. */
    index: integer('index').notNull(),
    /** Role id from the format definition. Text, not an enum — see schema/enums.ts. */
    role: text('role').notNull(),
    content: jsonb('content').$type<SlideContent>().notNull().default({}),
    /** Up to 1000 chars on the API. Good for search, and accessibility for free. */
    altText: text('alt_text').notNull().default(''),

    /**
     * Layout for this one slide, overriding the post's.
     *
     * Null means inherit, which is every row written by the pipeline. Set by
     * hand when one slide reads better as a figure or a split than the rest of
     * the carousel. Has no effect on hook, sources and cta slides — those
     * dispatch on role, deliberately, so a carousel still reads as a set.
     */
    templateId: text('template_id'),

    /**
     * When a person last changed this slide's copy, and who.
     *
     * Load-bearing rather than bookkeeping. Claims are attached to slides by
     * index, so rewriting a slide leaves verified verdicts standing against
     * text nobody checked. The gate turns these two columns into a warning the
     * approver sees, and the editorial record names the editor — which is the
     * difference between a human-reviewed post and one that merely looks like
     * one. Null means "as generated".
     *
     * Only copy edits set these. A theme or layout change does not touch a
     * claim, and a warning that fires on a colour change teaches people to
     * ignore warnings.
     */
    editedAt: timestamp('edited_at', { withTimezone: true }),
    editedBy: text('edited_by').references(() => user.id, { onDelete: 'set null' }),

    /**
     * sha256(templateId + themeId + content). Unchanged slides skip re-render,
     * which keeps editing one line of one slide from re-rasterising all ten.
     */
    renderHash: text('render_hash'),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('slides_post_index_idx').on(t.postId, t.index),
    index('slides_org_idx').on(t.orgId),
    /*
      An unindexed FK referent means a sequential scan of `slides` on every
      asset delete, which the retention sweep now does in bulk. It also serves
      the orphan check that sweep runs.
    */
    index('slides_asset_idx').on(t.assetId),
    /*
      `content->>'imageAssetId'` is a foreign key hidden inside a jsonb document,
      and three separate queries now filter on it: the upload-reuse check, the
      retention sweep's orphan test, and the editor's in-use lookup. All three
      were sequential scans of every slide in the install.

      A B-tree on the extracted expression rather than a GIN on the whole
      document: the queries test one scalar key for equality, which is exactly
      what an expression index serves, and a GIN over `content` would be larger
      and slower for this shape. The other jsonb columns are read whole and
      never filtered on, so they get nothing.
    */
    index('slides_image_asset_idx').on(sql`(${t.content} ->> 'imageAssetId')`),
  ],
)

/**
 * The fact-check audit trail: one row per checked assertion.
 *
 * This table is the product's spine. It is what separates "generated a
 * plausible carousel" from "published something defensible", and it is the
 * evidence a reviewer reads before approving.
 */
export const claims = pgTable(
  'claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    /**
     * Which slide asserts this, where attributable.
     *
     * Kept for display and for rows written before `slideId` existed, but
     * `slideId` is the authority. See the note there.
     */
    slideIndex: integer('slide_index'),
    /**
     * The slide this claim belongs to.
     *
     * Attribution used to be by `slideIndex` alone — a bare nullable integer
     * with no foreign key and no constraint tying it to `slides.index`. Every
     * structural edit had to keep the two in sync by hand (`renumberSlides`
     * does a careful two-pass remap for exactly this reason), and any future
     * write path that forgets silently re-points evidence at the wrong slide.
     *
     * That failure is invisible: the carousel looks right, the claim looks
     * right, and the only thing wrong is which sentence the evidence is
     * attached to — in the table the product exists to defend. A real
     * reference makes it the database's problem instead of the application's.
     *
     * `set null` rather than `cascade`: deleting a slide should not destroy the
     * record that its assertion was checked.
     */
    slideId: uuid('slide_id').references(() => slides.id, { onDelete: 'set null' }),

    claim: text('claim').notNull(),
    verdict: claimVerdict('verdict').notNull(),
    /** Model's self-reported confidence, 0..1. Compared against niche minConfidence. */
    confidence: real('confidence').notNull(),
    sources: jsonb('sources').$type<ClaimSource[]>().notNull().default([]),
    reasoning: text('reasoning').notNull().default(''),

    /**
     * Core claims block publication when unsupported; incidental ones only warn.
     * The model marks these, the reviewer can correct them.
     */
    isCore: boolean('is_core').notNull().default(true),

    /** Set when a human knowingly overrides a bad verdict. Kept for accountability. */
    resolvedBy: text('resolved_by').references(() => user.id, { onDelete: 'set null' }),
    resolvedNote: text('resolved_note'),

    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('claims_post_idx').on(t.postId),
    index('claims_org_idx').on(t.orgId),
    index('claims_slide_idx').on(t.slideId),
  ],
)

/** Daily Insights snapshot. One row per post per day. */
export const metrics = pgTable(
  'metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    capturedOn: date('captured_on').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),

    reach: integer('reach').notNull().default(0),
    impressions: integer('impressions').notNull().default(0),
    /** Saves and shares are the 2026 ranking signals that matter; likes are vanity. */
    saved: integer('saved').notNull().default(0),
    shares: integer('shares').notNull().default(0),
    likes: integer('likes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    profileVisits: integer('profile_visits').notNull().default(0),
    follows: integer('follows').notNull().default(0),
  },
  (t) => [
    uniqueIndex('metrics_post_day_idx').on(t.postId, t.capturedOn),
    index('metrics_org_idx').on(t.orgId),
  ],
)

/**
 * A record of long-running work, so a page can show what happened.
 *
 * Written kinds: `generate` (the content pipeline) and `discover` (topic
 * discovery). The comment here used to promise `publish`, `render`,
 * `refresh_token` and `insights` as well, and the index below called itself
 * "the worker's hot path" — but the worker never reads this table at all. It
 * polls `posts` for due work and runs the token refresh on a timer, so this is
 * a log of jobs the web app started rather than a queue anything drains.
 *
 * Left as it is rather than turned into a real queue: the polling design works,
 * and the one thing this table genuinely provides — "is a generation already
 * running for this org?", enforced by the partial unique index below — is the
 * part that is actually load-bearing.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: jobStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    lastError: text('last_error'),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Kept for the "what is running now" lookups the dashboard makes. Not a
    // queue scan: nothing claims jobs from this table.
    index('jobs_queue_idx').on(t.status, t.runAt),
    /*
      `kind` was indexed ONLY inside the partial one-running-per-kind unique
      index below, which is restricted to `status = 'running'` — so neither
      `recentJobs` nor `spendOverDays` could use it, on the table the schema
      itself calls the fastest-growing here.
    */
    index('jobs_org_kind_created_idx').on(t.orgId, t.kind, t.createdAt.desc()),
    /*
      `purgeFinishedJobs` filters on `finished_at`; `jobs_queue_idx` is
      (status, run_at), which does not serve it.
    */
    index('jobs_status_finished_idx').on(t.status, t.finishedAt),
    index('jobs_org_idx').on(t.orgId),
    // At most one running job of a kind per org, enforced by the database.
    //
    // Generation costs real money — roughly $0.43 a post — so a double-clicked
    // button must not become two API bills. Checking "is one already running?"
    // in application code loses the race between two simultaneous requests;
    // a partial unique index cannot. Same reasoning as row-level security:
    // where correctness matters, let Postgres refuse.
    uniqueIndex('jobs_one_running_per_kind_idx')
      .on(t.orgId, t.kind)
      .where(sql`${t.status} = 'running'`),
  ],
)

/**
 * A discovered topic candidate, with the evidence behind its score.
 *
 * Stored rather than recomputed because a discovery run takes minutes — the
 * sources are free and rate-limited to match — and because the operator needs
 * to come back to a list and work through it.
 *
 * The rejected ones are kept too, with their reasons. That is the same
 * decision the pipeline makes about refused ideas: the refusal and its
 * evidence are the most interesting thing the system produces, and a topic
 * dropped for one marginal reason is exactly the case a person should be able
 * to look at and disagree with.
 */
export const topics = pgTable(
  'topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    nicheId: uuid('niche_id')
      .notNull()
      .references(() => niches.id, { onDelete: 'cascade' }),

    /** Sanitised subject line. This is what reaches the ideation prompt. */
    title: text('title').notNull(),
    /** Stable identity across runs, so re-running updates rather than duplicates. */
    dedupeKey: text('dedupe_key').notNull(),

    /** Which sources surfaced it. */
    sources: jsonb('sources').$type<string[]>().notNull().default([]),
    /** The Wikipedia article it was measured against, when there is one. */
    articleUrl: text('article_url'),

    /** Raw measurements, kept so a score can be explained after the fact. */
    signals: jsonb('signals').$type<Record<string, unknown>>().notNull().default({}),
    /** Component scores and the multiplier, not just the total. */
    breakdown: jsonb('breakdown').$type<Record<string, unknown>>().notNull().default({}),
    /** `base * recencyMultiplier`, so the range is 0 to 1.3. */
    score: real('score').notNull().default(0),

    /** False when the prefilter refused it. Refusals are kept, not deleted. */
    accepted: boolean('accepted').notNull().default(false),
    rejectionReasons: jsonb('rejection_reasons').$type<string[]>().notNull().default([]),
    rejectionDetail: jsonb('rejection_detail').$type<string[]>().notNull().default([]),

    /** Set when a post has been generated from this topic. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    /** Set when the operator dismissed it by hand. */
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),

    discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Re-running discovery refreshes a topic's evidence instead of stacking a
    // second copy next to it, which is what makes the list workable over weeks.
    uniqueIndex('topics_niche_key_idx').on(t.nicheId, t.dedupeKey),
    index('topics_org_idx').on(t.orgId),
    index('topics_rank_idx').on(t.nicheId, t.accepted, t.score),
  ],
)

/** Tables under row-level security. Kept here so rls.ts cannot drift from the schema. */
export const TENANT_TABLES = [
  'niches',
  'ig_accounts',
  'posts',
  'assets',
  'slides',
  'claims',
  'metrics',
  'jobs',
  'topics',
] as const
