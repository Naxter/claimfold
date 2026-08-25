import { z } from 'zod'

/**
 * Contracts between pipeline stages.
 *
 * Every stage returns structured data matching one of these. That is a
 * security property as much as an engineering one: with no free-text channel
 * between the stage that reads the web and the stage that writes the slides,
 * text injected into a fetched page has no route to a caption
 * (docs/decisions/0001-security-posture.md, T3).
 */

/* ─── Stage 1: ideate ────────────────────────────────────────────────────── */

export const ideaSchema = z.object({
  /** Internal working title. Never published. */
  title: z.string(),
  /** The single sentence a reader should walk away able to repeat. */
  premise: z.string(),
  /** Why this is worth a post: what does the audience currently believe? */
  angle: z.string(),
  /** Format id chosen from those the niche allows. */
  format: z.string(),
  /**
   * Assertions requiring verification before publication.
   *
   * The model is asked to be exhaustive rather than conservative here: an
   * unlisted claim is one that never gets checked, and the cost of checking a
   * claim that turns out to be trivially true is a few cents.
   */
  claims: z.array(
    z.object({
      text: z.string(),
      /** Core claims block publication when unsupported; incidental ones warn. */
      isCore: z.boolean(),
    }),
  ),
  /** Self-assessed 0–1. Used only for ranking candidates, never for publishing. */
  surprise: z.number(),
})

export const ideaBatchSchema = z.object({
  ideas: z.array(ideaSchema),
})

export type Idea = z.infer<typeof ideaSchema>

/* ─── Stage 2: verify ────────────────────────────────────────────────────── */

/**
 * Bounds are load-bearing, not decoration.
 *
 * `confidence` is compared numerically against the niche's floor, so without
 * `.min(0).max(1)` a returned `5` sails past every threshold and a `-1` blocks
 * everything. The string caps stop a single manipulated verification from
 * writing megabytes into the claims table.
 *
 * Note these constraints are stripped before the schema is sent to the
 * provider (see llm/schema-json.ts) and enforced here on the way back — which
 * only works if they exist here.
 */
export const claimVerdictSchema = z.object({
  claim: z.string().max(2_000),
  verdict: z.enum(['supported', 'disputed', 'false', 'unverifiable']),
  /** 0–1. Compared against the niche's minConfidence to decide publication. */
  confidence: z.number().min(0).max(1),
  /** Short, and specific about what the evidence does and does not establish. */
  reasoning: z.string().max(4_000),
  isCore: z.boolean(),
  sources: z
    .array(
      z.object({
        url: z.string().max(2_000),
        title: z.string().max(500),
        publisher: z.string().max(200).nullish(),
        /** The sentence actually relied on, so a reviewer can check at a glance. */
        quote: z.string().max(1_000).nullish(),
      }),
    )
    .max(20),
})

export const verificationSchema = z.object({
  verdicts: z.array(claimVerdictSchema).max(40),
  /**
   * Anything found while checking that changes the premise — a common trap
   * where the correction is itself an oversimplification. Surfaced to the
   * reviewer even when every individual claim passes.
   */
  caveats: z.array(z.string()),
})

export type ClaimVerdict = z.infer<typeof claimVerdictSchema>
export type Verification = z.infer<typeof verificationSchema>

/* ─── Stage 3: write ─────────────────────────────────────────────────────── */

export const slideDraftSchema = z.object({
  /** Must match the planned role for this position. */
  role: z.string(),
  headline: z.string().nullish(),
  body: z.string().nullish(),
  kicker: z.string().nullish(),
  footnote: z.string().nullish(),
  items: z.array(z.string()).nullish(),
  figure: z.string().nullish(),
  figureLabel: z.string().nullish(),
  /**
   * Describes the slide for screen readers, and is indexed by Instagram's
   * search. Required on every slide — a missing one blocks approval.
   */
  altText: z.string(),
})

export const draftSchema = z.object({
  slides: z.array(slideDraftSchema),
  /** Up to 2,200 characters. Front-load it — the feed truncates after ~125. */
  caption: z.string(),
  /**
   * 3–5 relevant tags. Hashtags no longer drive reach since hashtag-following
   * was removed; they act as search metadata, so relevance beats volume.
   */
  hashtags: z.array(z.string()),
  /** The hook line, stored separately for performance analysis. */
  hook: z.string(),
})

export type SlideDraft = z.infer<typeof slideDraftSchema>
export type Draft = z.infer<typeof draftSchema>

/* ─── Niche generation ───────────────────────────────────────────────────── */

/**
 * Output of "describe your channel in a sentence" → a full niche pack.
 * Formats are chosen from the built-ins by id rather than invented, so a
 * generated niche cannot produce slide structures no template can render.
 */
export const generatedNicheSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  language: z.string(),
  audience: z.string(),
  voice: z.string(),
  topicSeeds: z.array(z.string()),
  formatIds: z.array(z.string()),
  hashtagSets: z.array(z.array(z.string())),
  themeId: z.string(),
  /** True for health, finance, safety or politics-adjacent subjects. */
  publicInterest: z.boolean(),
  suggestedMinConfidence: z.number(),
  forbiddenTopics: z.array(z.string()),
})

export type GeneratedNiche = z.infer<typeof generatedNicheSchema>
