import type { NichePack } from '@claimfold/niches'

import { evaluateGate, type GateResult } from './gate.ts'
import { getProvider, type LlmProvider, type ResearchSource } from './llm/index.ts'
import { ideate, verify, write, type StageCost } from './stages.ts'
import type { Draft, Idea, Verification } from './schemas.ts'

/**
 * idea → verify → gate → write
 *
 * Note the order: the gate runs BEFORE writing, not after. Writing a full
 * carousel around claims that will be rejected wastes tokens and, worse,
 * produces a polished draft that is tempting to wave through. Failing early
 * keeps the rejection cheap and unambiguous.
 */

export interface PipelineInput {
  niche: NichePack
  topic?: string
  slideCount?: number
  recentTitles?: string[]
  /** Candidates to generate before picking one. More costs little. */
  candidates?: number
}

export interface PipelineResult {
  idea: Idea
  /** The other candidates, kept so a reviewer can pick a different angle. */
  rejectedIdeas: Idea[]
  verification: Verification
  searched: ResearchSource[]
  gate: GateResult
  draft?: Draft
  roles?: string[]
  costs: StageCost[]
  totalCostUsd?: number
  /** True when the gate blocked before anything was written. */
  stoppedAtGate: boolean
}

export async function runPipeline(
  input: PipelineInput,
  provider: LlmProvider = getProvider(),
): Promise<PipelineResult> {
  const { niche } = input
  const costs: StageCost[] = []

  // ── 1. Ideate ───────────────────────────────────────────────────────────
  const ideation = await ideate(
    {
      niche,
      topic: input.topic,
      count: input.candidates ?? 4,
      recentTitles: input.recentTitles,
    },
    provider,
  )
  costs.push(ideation.cost)

  if (ideation.ideas.length === 0) {
    throw new Error(
      'Ideation produced no usable ideas. Check that the niche has topic seeds and formats.',
    )
  }

  // Highest self-assessed surprise. A weak signal, but the alternative is
  // "first one", and a human reviews the choice anyway.
  const [idea, ...rejectedIdeas] = [...ideation.ideas].sort((a, b) => b.surprise - a.surprise)

  // ── 2. Verify ───────────────────────────────────────────────────────────
  const verification = await verify({ niche, idea: idea! }, provider)
  costs.push(verification.cost)

  // ── 3. Gate, before spending anything on writing ────────────────────────
  const preGate = evaluateGate({ niche, verification: verification.verification })

  if (!preGate.passed) {
    return {
      idea: idea!,
      rejectedIdeas,
      verification: verification.verification,
      searched: verification.searched,
      gate: preGate,
      costs,
      totalCostUsd: sumCost(costs),
      stoppedAtGate: true,
    }
  }

  // ── 4. Write ────────────────────────────────────────────────────────────
  const written = await write(
    {
      niche,
      idea: idea!,
      verification: verification.verification,
      slideCount: input.slideCount,
    },
    provider,
  )
  costs.push(written.cost)

  // ── 5. Re-gate, now including publishability of the actual draft ────────
  const gate = evaluateGate({
    niche,
    verification: verification.verification,
    draft: written.draft,
    roles: written.roles,
  })

  return {
    idea: idea!,
    rejectedIdeas,
    verification: verification.verification,
    searched: verification.searched,
    gate,
    draft: written.draft,
    roles: written.roles,
    costs,
    totalCostUsd: sumCost(costs),
    stoppedAtGate: false,
  }
}

/** Undefined when any stage used an unpriced model — better than a wrong total. */
 
function sumCost(costs: StageCost[]): number | undefined {
  if (costs.some((c) => c.costUsd === undefined)) return undefined
  return costs.reduce((total, c) => total + (c.costUsd ?? 0), 0)
}
