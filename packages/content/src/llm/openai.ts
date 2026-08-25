import OpenAI from 'openai'
import type { z } from 'zod'

import { toJsonSchema } from './schema-json.ts'
import {
  LlmRefusalError,
  LlmSchemaError,
  type GenerateOptions,
  type LlmProvider,
  type LlmResult,
  type ModelTier,
  type ResearchOptions,
  type ResearchResult,
  type ResearchSource,
} from './types.ts'

/**
 * OpenAI adapter.
 *
 * Uses the Responses API rather than Chat Completions, because it is the only
 * one that offers the two things the pipeline needs together: server-side web
 * search and strict schema-constrained output. Doing search client-side would
 * mean fetching arbitrary pages from our own process — a far worse security
 * position than letting the provider fetch them (0001-security-posture, T3/T4).
 */

/**
 * Capability tier → model.
 *
 * The gpt-5.6 line runs luna (cost-optimised) → terra (balanced) → sol
 * (frontier). `deep` deliberately maps to terra rather than sol: on the
 * verification task sol took 61s and twelve searches to reach the same verdict
 * terra reached in 17s and seven, at materially higher cost. Frontier capacity
 * is not the bottleneck for checking whether a documented fact is true.
 *
 * Every tier is overridable, so an operator publishing into a high-stakes
 * niche can point `deep` at sol without touching pipeline code:
 *
 *   OPENAI_MODEL_DEEP=gpt-5.6-sol
 */
const TIER_MODELS = {
  fast: 'gpt-5.6-luna',
  balanced: 'gpt-5.6-terra',
  deep: 'gpt-5.6-terra',
} as const

const DEFAULT_MODEL = TIER_MODELS.balanced

/**
 * USD per million tokens. Source: openai.com pricing, checked 2026-07-25.
 *
 * `cachedInput` is a 10× discount and matters more than it looks: the
 * verification stage sends ~90k input tokens of search results, so cache hits
 * dominate the bill on any niche that re-checks related claims.
 *
 * Rates change. A model missing from this table reports an undefined cost
 * rather than zero — see estimateCost.
 */
const PRICING: Record<string, { input: number; cachedInput: number; output: number }> = {
  'gpt-5.6-sol': { input: 5, cachedInput: 0.5, output: 30 },
  'gpt-5.6-terra': { input: 2.5, cachedInput: 0.25, output: 15 },
  'gpt-5.6-luna': { input: 1, cachedInput: 0.1, output: 6 },
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-4.1': { input: 2, cachedInput: 0.5, output: 8 },
  'gpt-4o': { input: 2.5, cachedInput: 1.25, output: 10 },
}

/** Models that accept a `reasoning.effort` setting. Others reject the field. */
const REASONING_MODEL = /^(gpt-5|o[134])/

/**
 * Extra output budget granted to reasoning models, by effort.
 *
 * Reasoning tokens are billed and counted against `max_output_tokens`, but are
 * never returned — so a caller asking for 3,000 tokens of answer gets silently
 * starved and the response comes back `incomplete` with nothing in it. Callers
 * should be able to say how much ANSWER they want without knowing how much the
 * model thinks, so the allowance is added on top rather than taken out of it.
 */
const REASONING_ALLOWANCE = { low: 6_000, medium: 12_000, high: 24_000 } as const

export interface OpenAiProviderOptions {
  apiKey?: string
  model?: string
}

export class OpenAiProvider implements LlmProvider {
  readonly id = 'openai'
  readonly model: string
  private readonly client: OpenAI

  constructor(options: OpenAiProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set. Add it to .env — get one at ' +
          'https://platform.openai.com/api-keys',
      )
    }

    this.model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL
    this.client = new OpenAI({ apiKey, maxRetries: 3 })
  }

  /**
   * Resolve a tier to a concrete model.
   *
   * An explicit `OPENAI_MODEL` (or a constructor override) pins every tier to
   * one model — useful for cost control and for reproducing a run exactly.
   */
  private modelFor(tier: ModelTier = 'balanced'): string {
    if (process.env.OPENAI_MODEL) return process.env.OPENAI_MODEL
    return (
      process.env[`OPENAI_MODEL_${tier.toUpperCase()}`] ?? TIER_MODELS[tier] ?? this.model
    )
  }

  async generate<T>(schema: z.ZodType<T>, options: GenerateOptions): Promise<LlmResult<T>> {
    const result = await this.call(schema, options, false)
    // The model that actually ran, not the instance default — this ends up in
    // the audit trail against a published post, and a tiered call would
    // otherwise record the wrong one.
    return { data: result.data, usage: result.usage, model: result.model }
  }

  async research<T>(schema: z.ZodType<T>, options: ResearchOptions): Promise<ResearchResult<T>> {
    const result = await this.call(schema, options, true)
    return {
      data: result.data,
      usage: result.usage,
      model: result.model,
      searched: result.searched,
    }
  }

  private async call<T>(
    schema: z.ZodType<T>,
    options: GenerateOptions & Partial<ResearchOptions>,
    withSearch: boolean,
  ): Promise<{
    data: T
    usage: LlmResult<T>['usage']
    searched: ResearchSource[]
    model: string
  }> {
    const jsonSchema = toJsonSchema(schema)

    const effort = options.effort ?? 'high'
    const answerTokens = options.maxTokens ?? 8_000
    const model = this.modelFor(options.tier)
    const isReasoning = REASONING_MODEL.test(model)

    const request: Record<string, unknown> = {
      model,
      // `instructions` is the authority channel — the equivalent of a system
      // prompt. Retrieved page content never reaches it.
      instructions: options.system,
      input: options.prompt,
      max_output_tokens: isReasoning ? answerTokens + REASONING_ALLOWANCE[effort] : answerTokens,
      text: {
        format: {
          type: 'json_schema',
          name: 'response',
          strict: true,
          schema: jsonSchema,
        },
      },
    }

    if (withSearch) {
      const tool: Record<string, unknown> = { type: 'web_search' }
      if (options.allowedDomains?.length) {
        tool['filters'] = { allowed_domains: options.allowedDomains }
      }
      request['tools'] = [tool]
    }

    if (isReasoning) {
      request['reasoning'] = { effort }
    }

    const response = (await this.client.responses.create(
      request as never,
    )) as unknown as OpenAiResponse

    const refusal = findRefusal(response)
    if (refusal) {
      throw new LlmRefusalError(
        'The model declined this request on policy grounds. ' +
          'Rephrase the topic or exclude it in the niche configuration.',
        refusal,
      )
    }

    // `incomplete` almost always means max_output_tokens was hit. Surfacing it
    // as a schema error would send someone hunting the wrong bug.
    if (response.status === 'incomplete') {
      throw new LlmSchemaError(
        `Model stopped early (${response.incomplete_details?.reason ?? 'unknown'}). ` +
          'Raise maxTokens for this stage.',
        [],
      )
    }

    const text = extractText(response)
    if (!text.trim()) {
      throw new LlmSchemaError('Model returned no structured output', [])
    }

    const inputTokens = response.usage?.input_tokens ?? 0
    const outputTokens = response.usage?.output_tokens ?? 0
    const cachedTokens = response.usage?.input_tokens_details?.cached_tokens ?? 0

    return {
      data: parseOrThrow(schema, text),
      usage: {
        inputTokens,
        outputTokens,
        cachedTokens,
        costUsd: estimateCost(model, inputTokens, outputTokens, cachedTokens),
      },
      searched: collectCitations(response),
      model,
    }
  }
}

/* ─── Response shapes ────────────────────────────────────────────────────── */

interface OpenAiAnnotation {
  type: string
  url?: string
  title?: string
}

interface OpenAiContent {
  type: string
  text?: string
  refusal?: string
  annotations?: OpenAiAnnotation[]
}

interface OpenAiSearchAction {
  type: string
  url?: string
  query?: string
  queries?: string[]
}

interface OpenAiOutputItem {
  type: string
  content?: OpenAiContent[]
  /** Present on `web_search_call` items; records what the tool actually did. */
  action?: OpenAiSearchAction
}

interface OpenAiResponse {
  status?: string
  incomplete_details?: { reason?: string }
  output_text?: string
  output?: OpenAiOutputItem[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
    input_tokens_details?: { cached_tokens?: number }
  }
}

function extractText(response: OpenAiResponse): string {
  // `output_text` is the SDK's convenience aggregation; fall back to walking
  // the output items, since reasoning models interleave other item types.
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text
  }

  const parts: string[] = []
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) parts.push(content.text)
    }
  }
  return parts.join('')
}

function findRefusal(response: OpenAiResponse): string | undefined {
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'refusal' && content.refusal) return content.refusal
    }
  }
  return undefined
}

/**
 * Everything the model actually looked at.
 *
 * Two sources, and BOTH are required. `url_citation` annotations are the
 * documented path, but they come back empty when strict structured output is
 * in use — which is exactly our configuration, and exactly the deepest model
 * we run for verification. Relying on annotations alone produced an empty
 * audit trail on a run that had opened twelve pages.
 *
 * The `web_search_call` items carry the ground truth: `open_page` and
 * `find_in_page` actions record the URLs actually fetched. Those are what a
 * reviewer needs to see, so they are collected first and annotations merged in
 * for their titles.
 */
function collectCitations(response: OpenAiResponse): ResearchSource[] {
  const out: ResearchSource[] = []

  const add = (url: string | undefined, title?: string) => {
    if (!url) return
    const existing = out.find((s) => s.url === url)
    if (existing) {
      // A later annotation may supply a real title for a URL first seen as a
      // bare fetch.
      if (title && existing.title === existing.url) existing.title = title
      return
    }
    out.push({ url, title: title ?? url })
  }

  for (const item of response.output ?? []) {
    if (item.type === 'web_search_call' && item.action) {
      const action = item.action
      if (action.type === 'open_page' || action.type === 'find_in_page') {
        add(action.url)
      }
    }

    for (const content of item.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        if (annotation.type === 'url_citation') add(annotation.url, annotation.title)
      }
    }
  }

  return out
}

function parseOrThrow<T>(schema: z.ZodType<T>, text: string): T {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new LlmSchemaError('Model output was not valid JSON', [text.slice(0, 400)])
  }

  const result = schema.safeParse(json)
  if (!result.success) {
    throw new LlmSchemaError(
      'Model output did not match the expected schema',
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    )
  }
  return result.data
}

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens = 0,
): number | undefined {
  const rate = PRICING[model] ?? PRICING[model.replace(/-\d{4}-\d{2}-\d{2}$/, '')]
  // Undefined, not zero. A model missing from the table is unpriced, and
  // reporting $0.0000 would read as "free" on the cost dashboard — the one
  // number an operator most needs to be able to trust.
  if (!rate) return undefined

  // `input_tokens` is the total and already includes the cached ones, so the
  // fresh count is the difference. Billing them all at full rate would
  // overstate cost by up to 10x on cache-heavy runs.
  const fresh = Math.max(0, inputTokens - cachedTokens)

  return (
    (fresh / 1_000_000) * rate.input +
    (cachedTokens / 1_000_000) * rate.cachedInput +
    (outputTokens / 1_000_000) * rate.output
  )
}
