import { AnthropicProvider } from './anthropic.ts'
import { OpenAiProvider } from './openai.ts'
import type { LlmProvider } from './types.ts'

export {
  LlmRefusalError,
  LlmSchemaError,
  type GenerateOptions,
  type LlmProvider,
  type LlmResult,
  type LlmUsage,
  type ModelTier,
  type ResearchOptions,
  type ResearchResult,
  type ResearchSource,
} from './types.ts'

export { AnthropicProvider } from './anthropic.ts'
export { OpenAiProvider } from './openai.ts'
export { toJsonSchema } from './schema-json.ts'

/**
 * Backends this install can talk to.
 *
 * Adding one means writing an adapter that satisfies LlmProvider and listing it
 * here — no pipeline code changes. What it does NOT mean is that the backend is
 * suitable: the verification stage decides whether a factual claim reaches a
 * real audience, so a new backend needs its own evaluation before it is offered
 * to operators. "Runs" and "is trustworthy for this job" are different claims.
 */
export type ProviderId = 'anthropic' | 'openai'

const FACTORIES: Record<ProviderId, () => LlmProvider> = {
  anthropic: () => new AnthropicProvider(),
  openai: () => new OpenAiProvider(),
}

let cached: LlmProvider | null = null

/**
 * The default provider when `LLM_PROVIDER` is unset.
 *
 * Must match what `.env.example` and docker-compose.yml ship. It did not: this
 * defaulted to `anthropic` while both of those default to `openai`, so
 * commenting the variable out — or deleting the line while tidying a `.env` —
 * silently switched provider, model tier and billing account. Nothing failed;
 * the next generation just went somewhere else and cost something different.
 *
 * Exported so a test can assert the three stay in step.
 */
export const DEFAULT_PROVIDER: ProviderId = 'openai'

/**
 * The configured provider, from `LLM_PROVIDER`.
 *
 * Cached per process: constructing a client is cheap but not free, and the
 * worker calls this on every job.
 */
export function getProvider(): LlmProvider {
  if (cached) return cached

  const id = (process.env.LLM_PROVIDER ?? DEFAULT_PROVIDER) as ProviderId
  const factory = FACTORIES[id]

  if (!factory) {
    throw new Error(
      `Unknown LLM_PROVIDER "${id}". Available: ${Object.keys(FACTORIES).join(', ')}`,
    )
  }

  cached = factory()
  return cached
}

/** Test seam, and the hook for per-organization providers on a hosted tier. */
export function setProvider(provider: LlmProvider | null): void {
  cached = provider
}
