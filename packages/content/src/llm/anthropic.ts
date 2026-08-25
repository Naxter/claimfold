import Anthropic from '@anthropic-ai/sdk'
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
 * Anthropic adapter.
 *
 * Everything provider-specific is confined to this file: model ids, tool
 * versions, block shapes, refusal handling. The pipeline sees only LlmProvider.
 */

/** Capability tier → model. Overridable via ANTHROPIC_MODEL_{FAST,BALANCED,DEEP}. */
const TIER_MODELS = {
  fast: 'claude-haiku-4-5',
  balanced: 'claude-sonnet-5',
  deep: 'claude-opus-5',
} as const

const DEFAULT_MODEL = TIER_MODELS.deep

/** Server-side web search, the only tool any stage is permitted. */
const WEB_SEARCH_TOOL_TYPE = 'web_search_20260209'

/**
 * USD per million tokens. Not billing-accurate.
 * `cachedInput` is roughly 0.1x, which dominates on cache-heavy verification.
 */
const PRICING: Record<string, { input: number; cachedInput: number; output: number }> = {
  'claude-opus-5': { input: 5, cachedInput: 0.5, output: 25 },
  'claude-opus-4-8': { input: 5, cachedInput: 0.5, output: 25 },
  'claude-sonnet-5': { input: 3, cachedInput: 0.3, output: 15 },
  'claude-sonnet-4-6': { input: 3, cachedInput: 0.3, output: 15 },
  'claude-haiku-4-5': { input: 1, cachedInput: 0.1, output: 5 },
}

export interface AnthropicProviderOptions {
  apiKey?: string
  model?: string
}

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic'
  readonly model: string
  private readonly client: Anthropic

  constructor(options: AnthropicProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Add it to .env — get one at ' +
          'https://console.anthropic.com/settings/keys',
      )
    }

    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL
    this.client = new Anthropic({ apiKey, maxRetries: 3 })
  }

  /** Resolve a tier to a concrete model. An explicit ANTHROPIC_MODEL pins all tiers. */
  private modelFor(tier: ModelTier = 'balanced'): string {
    if (process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL
    return (
      process.env[`ANTHROPIC_MODEL_${tier.toUpperCase()}`] ?? TIER_MODELS[tier] ?? this.model
    )
  }

  async generate<T>(schema: z.ZodType<T>, options: GenerateOptions): Promise<LlmResult<T>> {
    const response = await this.call(schema, options, undefined)
    // The model that actually ran, not the instance default — see openai.ts.
    return {
      data: response.data,
      usage: response.usage,
      model: response.model,
    }
  }

  async research<T>(schema: z.ZodType<T>, options: ResearchOptions): Promise<ResearchResult<T>> {
    const tool: Record<string, unknown> = {
      type: WEB_SEARCH_TOOL_TYPE,
      name: 'web_search',
      // Bounded so one verification cannot spiral. Fact-checking a carousel
      // should cost cents, not dollars.
      max_uses: options.maxSearches ?? 8,
    }
    if (options.allowedDomains?.length) {
      tool['allowed_domains'] = options.allowedDomains
    }

    const response = await this.call(schema, options, [tool])
    return {
      data: response.data,
      usage: response.usage,
      model: response.model,
      searched: response.searched,
    }
  }

  /**
   * One structured request, resuming across `pause_turn` if the server-side
   * search loop hits its iteration cap.
   */
  private async call<T>(
    schema: z.ZodType<T>,
    options: GenerateOptions,
    tools: Record<string, unknown>[] | undefined,
  ): Promise<{
    data: T
    usage: LlmResult<T>['usage']
    searched: ResearchSource[]
    model: string
  }> {
    const jsonSchema = toJsonSchema(schema)
    const model = this.modelFor(options.tier)

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: options.prompt }]

    let inputTokens = 0
    let outputTokens = 0
    let cachedTokens = 0
    const searched: ResearchSource[] = []
    let text = ''
    let stillPaused = false

    // `pause_turn` means the server tool loop paused, not that it failed. The
    // cap stops a pathological case from looping forever.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await this.client.messages.create({
        model,
        max_tokens: options.maxTokens ?? 8_000,
        system: options.system,
        messages,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: options.effort ?? 'high',
          format: { type: 'json_schema', schema: jsonSchema },
        },
        ...(tools ? { tools: tools as unknown as Anthropic.ToolUnion[] } : {}),
      } as Anthropic.MessageCreateParamsNonStreaming)

      inputTokens += response.usage.input_tokens ?? 0
      outputTokens += response.usage.output_tokens ?? 0
      cachedTokens += response.usage.cache_read_input_tokens ?? 0

      // Truncation must not masquerade as malformed output. Without this the
      // caller sees "Model output was not valid JSON" and goes looking for a
      // schema bug that isn't there — the same misdiagnosis the OpenAI adapter
      // already guards against.
      if (response.stop_reason === 'max_tokens') {
        throw new LlmSchemaError(
          'Model hit max_tokens before completing its output. Raise maxTokens for this stage.',
          [],
        )
      }

      // Check before reading content: on a refusal `content` is empty or
      // partial, and indexing into it produces a confusing downstream error
      // instead of an actionable one.
      if (response.stop_reason === 'refusal') {
        const details = (response as { stop_details?: { category?: string } }).stop_details
        throw new LlmRefusalError(
          'The model declined this request on policy grounds. ' +
            'Rephrase the topic or exclude it in the niche configuration.',
          details?.category,
        )
      }

      collectSearchResults(response.content, searched)
      text = extractText(response.content) || text

      if (response.stop_reason !== 'pause_turn') {
        stillPaused = false
        break
      }

      stillPaused = true
      messages.push({ role: 'assistant', content: response.content })
    }

    // Falling out of the loop still paused means the server-tool loop never
    // finished. Parsing whatever partial text accumulated would silently
    // return an answer built on incomplete research.
    if (stillPaused) {
      throw new LlmSchemaError(
        'Server-tool loop did not complete within the resume limit. Reduce maxSearches or retry.',
        [],
      )
    }

    if (!text.trim()) {
      throw new LlmSchemaError('Model returned no structured output', [])
    }

    return {
      data: parseOrThrow(schema, text),
      usage: {
        inputTokens,
        outputTokens,
        cachedTokens,
        costUsd: estimateCost(model, inputTokens, outputTokens, cachedTokens),
      },
      searched,
      model,
    }
  }
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

/**
 * Pull every page the model actually looked at out of the search result blocks.
 *
 * Recorded separately from the sources the model claims to have relied on, so
 * a reviewer can see the difference between "consulted" and "cited".
 */
function collectSearchResults(
  content: Anthropic.ContentBlock[],
  into: ResearchSource[],
): void {
  for (const block of content) {
    if (block.type !== 'web_search_tool_result') continue

    // On error the block's `content` is a single error object rather than a
    // list. Server-tool failures arrive as HTTP 200, so this is a real branch,
    // not defensive padding.
    const results = (block as { content?: unknown }).content
    if (!Array.isArray(results)) continue

    for (const result of results as Array<Record<string, unknown>>) {
      const url = typeof result['url'] === 'string' ? result['url'] : undefined
      if (!url) continue
      if (into.some((s) => s.url === url)) continue

      into.push({
        url,
        title: typeof result['title'] === 'string' ? result['title'] : url,
        retrievedAt:
          typeof result['page_age'] === 'string' ? (result['page_age']) : undefined,
      })
    }
  }
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
  // Strip a dated snapshot suffix (claude-opus-4-1-20250805) before lookup.
  const rate = PRICING[model] ?? PRICING[model.replace(/-\d{8}$/, '')]

  // Undefined, not zero — a model missing from the table is unpriced, and
  // $0.0000 reads as "free" on the cost dashboard.
  if (!rate) return undefined

  const fresh = Math.max(0, inputTokens - cachedTokens)
  return (
    (fresh / 1_000_000) * rate.input +
    (cachedTokens / 1_000_000) * rate.cachedInput +
    (outputTokens / 1_000_000) * rate.output
  )
}
