export {
  getProvider,
  setProvider,
  AnthropicProvider,
  OpenAiProvider,
  LlmRefusalError,
  LlmSchemaError,
  toJsonSchema,
  type GenerateOptions,
  type LlmProvider,
  type LlmResult,
  type LlmUsage,
  type ModelTier,
  type ProviderId,
  type ResearchOptions,
  type ResearchResult,
  type ResearchSource,
} from './llm/index.ts'

export {
  generateNiche,
  ideate,
  nichePackFromGenerated,
  verify,
  write,
  type GenerateNicheInput,
  type IdeateInput,
  type StageCost,
  type VerifyInput,
  type WriteInput,
} from './stages.ts'

export { evaluateGate, type GateInput, type GateIssue, type GateResult } from './gate.ts'

export { ideaFingerprint } from './fingerprint.ts'

export {
  MAX_ALT_TEXT,
  normaliseSlideContent,
  slideContentEditSchema,
  type SlideContentEdit,
} from './slide-edit.ts'

export { runPipeline, type PipelineInput, type PipelineResult } from './pipeline.ts'

export {
  claimVerdictSchema,
  draftSchema,
  generatedNicheSchema,
  ideaBatchSchema,
  ideaSchema,
  slideDraftSchema,
  verificationSchema,
  type ClaimVerdict,
  type Draft,
  type GeneratedNiche,
  type Idea,
  type SlideDraft,
  type Verification,
} from './schemas.ts'

export {
  describeNiche,
  generateNicheSystem,
  ideateSystem,
  verifySystem,
  writeSystem,
} from './prompts.ts'
