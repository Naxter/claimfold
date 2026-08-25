/**
 * Shapes stored in `jsonb` columns.
 *
 * These are plain data contracts with no behaviour, so both @claimfold/db and
 * @claimfold/niches can depend on them without a cycle. Validation, defaults
 * and generation live in @claimfold/niches.
 */

/** BCP-47 tag: 'de', 'en', 'de-AT', 'pt-BR'. Drives copy, dates and numbers. */
export type LanguageTag = string

/**
 * One slide structure a niche can produce.
 *
 * A format is DATA, not code. Adding "before-after" or "common-mistakes" to a
 * niche must never require a migration or a deploy — that is what makes the
 * app topic-agnostic rather than a myth-vs-fact tool with a rename.
 */
export interface SlideFormat {
  /** Stable identifier, referenced by `posts.format`. */
  id: string
  /** Shown in the UI. */
  name: string
  /** Told to the model: when is this structure the right choice? */
  description: string
  /**
   * Ordered slide roles. `posts.slides[i].role` must be one of these.
   * The first is always the hook; the renderer maps roles to templates.
   */
  roles: SlideRole[]
  /** Inclusive bounds. Instagram's API caps a carousel at 10 images. */
  minSlides: number
  maxSlides: number
  /** Default template family for this format, overridable per post. */
  templateId: string
}

export interface SlideRole {
  /** e.g. 'hook', 'claim', 'evidence', 'source', 'cta'. Free-form by design. */
  id: string
  /** Told to the model: what goes on this slide? */
  purpose: string
  /** Whether the pipeline may repeat this role to fill the carousel. */
  repeatable?: boolean
  /** Soft character budget for the headline, used by the auto-fit renderer. */
  headlineBudget?: number
  /** Soft character budget for the body. */
  bodyBudget?: number
}

/** Editorial and compliance constraints applied to every post in the niche. */
export interface NicheRules {
  /**
   * Require at least one citable source per core claim. Recommended on for
   * anything factual — it is what makes content "materially transformed"
   * under Instagram's April 2026 originality policy.
   */
  requireSources: boolean
  /**
   * Content that informs the public on matters of public interest (health,
   * finance, politics, safety). Raises the fact-check bar and turns on
   * AI-disclosure by default — see EU AI Act Art. 50, applicable 2026-08-02.
   */
  publicInterest: boolean
  /** Claims below this confidence block publication. 0..1. */
  minConfidence: number
  /** Topics the niche must never cover. Enforced at ideation. */
  forbiddenTopics: string[]
  /**
   * Require an advertising label when any affiliate or sponsored link is
   * present. German operators: § 5a UWG. Default on; disabling is a choice.
   */
  requireAdLabel: boolean
}

export interface PostingCadence {
  postsPerWeek: number
  /** Local times of day, 'HH:mm', in the org's timezone. */
  preferredTimes: string[]
  /** IANA timezone, e.g. 'Europe/Berlin'. */
  timezone: string
}

/**
 * Extra instructions appended to each pipeline stage's system prompt.
 * Deliberately additive: a niche tunes the pipeline, it does not replace it,
 * so the fact-check gate cannot be prompted away from a config file.
 */
export interface PromptOverrides {
  ideate?: string
  write?: string
  /**
   * No `verify`. Verification must not be steerable from user-editable config —
   * see the reasoning in packages/niches/src/schema.ts.
   */
}

/** A citation backing a claim. */
export interface ClaimSource {
  url: string
  title: string
  publisher?: string
  /** The specific sentence relied on, for the reviewer to check at a glance. */
  quote?: string
  publishedAt?: string
}

/** Free-form per-slide copy. Keys are interpreted by the template. */
export interface SlideContent {
  headline?: string
  body?: string
  kicker?: string
  footnote?: string
  /** Ordered list items, for ranking and comparison templates. */
  items?: string[]
  /** Big number for reveal templates, kept as a string to preserve formatting. */
  figure?: string
  figureLabel?: string
  /**
   * An uploaded picture, by asset id — never by path or URL.
   *
   * An id is resolved server-side against this org's own rows, so a slide
   * cannot name a file on disk or a page on the internet. That matters twice
   * over: the storage root is only ever addressed by id
   * (packages/storage/src/index.ts), and the render browser makes no network
   * requests at all, so the bytes are read locally and inlined.
   */
  imageAssetId?: string
  [key: string]: unknown
}
