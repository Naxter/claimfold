import type { z } from 'zod'

/**
 * The model-provider boundary.
 *
 * Kept deliberately narrow. The pipeline needs exactly two things from a
 * language model, and nothing here names a vendor, a model, a tool version or
 * a message format. That is what lets a second backend be an addition rather
 * than a rewrite — and it is why the interface is defined before the first
 * adapter, not extracted from it afterwards.
 *
 * What is deliberately NOT in this interface:
 *  - Free-form text generation. Every pipeline stage returns structured data,
 *    because a free-text channel is exactly how injected instructions from a
 *    fetched web page would reach a caption (see 0001-security-posture, T3).
 *  - Tool calling in general. The only tool any stage may use is web search,
 *    and only in `research()`. A provider adapter must not widen this.
 *  - Conversations. Every call is single-shot, so no stage can be steered by
 *    something it read earlier.
 */

export interface LlmUsage {
  /** Total prompt tokens, including any served from cache. */
  inputTokens: number
  outputTokens: number
  /** Subset of inputTokens billed at the cached rate, typically 10x cheaper. */
  cachedTokens?: number
  /** Undefined when the model is not in the price table — never guessed. */
  costUsd?: number
}

export interface LlmResult<T> {
  data: T
  usage: LlmUsage
  /** Which concrete model answered, for the audit trail on a published post. */
  model: string
}

/** A source the model consulted. Surfaced to the reviewer, so never optional. */
export interface ResearchSource {
  url: string
  title: string
  /** Populated when the provider reports it; not all do. */
  publisher?: string
  retrievedAt?: string
}

export interface ResearchResult<T> extends LlmResult<T> {
  /**
   * Everything the model actually fetched, whether or not it cited it.
   *
   * Deliberately separate from the sources inside `data`: the model reports
   * which sources it *relied on*, this records which it *saw*. A gap between
   * the two is a signal worth showing a reviewer.
   */
  searched: ResearchSource[]
}

/**
 * How much model a stage needs, expressed as a capability rather than a name.
 *
 * The pipeline must not contain model ids: they change every few months, they
 * differ per provider, and an operator running OpenAI should not be editing
 * pipeline code. Each adapter maps these three tiers onto its own line-up.
 *
 *   fast     — cheap and quick; drafting, classification, low-stakes work
 *   balanced — the default; writing that will be published
 *   deep     — most capable available; used for verification, where being
 *              wrong means publishing a falsehood to a real audience
 */
export type ModelTier = 'fast' | 'balanced' | 'deep'

export interface GenerateOptions {
  /**
   * Instructions that carry authority. Never contains retrieved content or
   * anything a user typed into a niche pack — those go in `prompt`.
   */
  system: string
  prompt: string
  /** Reasoning depth. Higher costs more and is worth it for verification. */
  effort?: 'low' | 'medium' | 'high'
  /** Capability needed. Defaults to 'balanced'. */
  tier?: ModelTier
  /**
   * Budget for the ANSWER. Adapters add their own allowance for invisible
   * reasoning tokens on top, so callers never have to know how much a
   * particular model thinks.
   */
  maxTokens?: number
}

export interface ResearchOptions extends GenerateOptions {
  /** Cap on searches per call, so one verification cannot run away. */
  maxSearches?: number
  /** Restrict search to these domains. Used by niches with curated sources. */
  allowedDomains?: string[]
}

/**
 * Raised when the provider declines a request on policy grounds.
 *
 * Distinct from a transport failure: a refusal must not be retried with the
 * same input, and it should surface to the operator as "this topic was
 * declined", not as "something went wrong".
 */
export class LlmRefusalError extends Error {
  constructor(
    message: string,
    readonly category?: string,
  ) {
    super(message)
    this.name = 'LlmRefusalError'
  }
}

/** Raised when output does not satisfy the requested schema after retries. */
export class LlmSchemaError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message)
    this.name = 'LlmSchemaError'
  }
}

export interface LlmProvider {
  /** Stable id: 'anthropic', 'openai', … Recorded against generated posts. */
  readonly id: string
  /** The configured model, for display and for the audit trail. */
  readonly model: string

  /** Structured generation with no tools and no network access. */
  generate<T>(schema: z.ZodType<T>, options: GenerateOptions): Promise<LlmResult<T>>

  /**
   * Structured generation grounded in a web search the provider runs.
   *
   * The only call in the system that reads the open internet. Adapters must
   * treat retrieved page text strictly as data: it may inform the answer, and
   * it must never be able to change what the model is being asked to do.
   */
  research<T>(schema: z.ZodType<T>, options: ResearchOptions): Promise<ResearchResult<T>>
}
