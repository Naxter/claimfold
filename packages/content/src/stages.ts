import type { SlideFormat } from '@claimfold/db'
import { planSlides, type NichePack, type NichePackInput } from '@claimfold/niches'

import { getProvider } from './llm/index.ts'
import type { LlmProvider, ResearchSource } from './llm/index.ts'
import {
  describeNiche,
  generateNicheSystem,
  ideateSystem,
  verifySystem,
  writeSystem,
} from './prompts.ts'
import {
  draftSchema,
  generatedNicheSchema,
  ideaBatchSchema,
  verificationSchema,
  type Draft,
  type GeneratedNiche,
  type Idea,
  type Verification,
} from './schemas.ts'

/**
 * The three pipeline stages.
 *
 * Each is a pure function of (niche, input) → structured output. None touches
 * the database, so they can be run and evaluated without one — which is what
 * makes prompt iteration tolerable.
 *
 * The stages are deliberately separate calls rather than one prompt. Beyond
 * being easier to evaluate, it is a security boundary: the stage that reads the
 * open web returns only verdicts and confidences, so text injected into a
 * fetched page has no path into a caption.
 */

export interface StageCost {
  inputTokens: number
  outputTokens: number
  /** Subset of inputTokens billed at the cached rate. */
  cachedTokens?: number
  costUsd?: number
  model: string
}

function costOf(result: {
  usage: {
    inputTokens: number
    outputTokens: number
    cachedTokens?: number
    costUsd?: number
  }
  model: string
}): StageCost {
  return {
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cachedTokens: result.usage.cachedTokens,
    costUsd: result.usage.costUsd,
    model: result.model,
  }
}

/* ─── Stage 1: ideate ────────────────────────────────────────────────────── */

export interface IdeateInput {
  niche: NichePack
  /** Optional steer. Without it, seeds from the niche are used. */
  topic?: string
  count?: number
  /** Titles already published, so the model does not repeat them. */
  recentTitles?: string[]
}

export async function ideate(
  input: IdeateInput,
  provider: LlmProvider = getProvider(),
): Promise<{ ideas: Idea[]; cost: StageCost }> {
  const { niche } = input
  const formatList = niche.formats
    .map((f) => `- ${f.id}: ${f.name}. ${f.description}`)
    .join('\n')

  const prompt = [
    describeNiche(niche),
    '',
    input.topic
      ? `Topic to develop: ${input.topic}`
      : `Draw from these areas:\n${niche.topicSeeds.map((s) => `- ${s}`).join('\n')}`,
    '',
    `Available formats (use the id exactly):\n${formatList}`,
    '',
    input.recentTitles?.length
      ? `Already published — do not repeat or closely echo these:\n${input.recentTitles
          .map((t) => `- ${t}`)
          .join('\n')}`
      : '',
    '',
    `Produce ${input.count ?? 5} distinct ideas.`,
    niche.promptOverrides.ideate ?? '',
  ]
    .filter(Boolean)
    .join('\n')

  const result = await provider.generate(ideaBatchSchema, {
    system: ideateSystem(niche),
    prompt,
    // Ideation is cheap and disposable — bad ideas are filtered by the next
    // stage or by a human, so this is the wrong place to spend.
    tier: 'balanced',
    effort: 'medium',
    maxTokens: 6_000,
  })

  // A format id the niche does not carry would fail at slide planning, so drop
  // those ideas here rather than midway through generation.
  const allowed = new Set(niche.formats.map((f) => f.id))
  const ideas = result.data.ideas.filter((idea) => allowed.has(idea.format))

  return { ideas, cost: costOf(result) }
}

/* ─── Stage 2: verify — the gate ─────────────────────────────────────────── */

export interface VerifyInput {
  niche: NichePack
  idea: Idea
}

export async function verify(
  input: VerifyInput,
  provider: LlmProvider = getProvider(),
): Promise<{ verification: Verification; searched: ResearchSource[]; cost: StageCost }> {
  const { niche, idea } = input

  const claimList = idea.claims
    .map((c, i) => `${i + 1}. [${c.isCore ? 'CORE' : 'incidental'}] ${c.text}`)
    .join('\n')

  const prompt = [
    `Premise of the proposed post: ${idea.premise}`,
    '',
    'Verify each of the following claims independently:',
    claimList,
    '',
    'Return one verdict per claim, in the same order.',
    // No niche override here, by design. See promptOverridesSchema.
  ]
    .filter(Boolean)
    .join('\n')

  const result = await provider.research(verificationSchema, {
    system: verifySystem(niche),
    prompt,
    // The one stage worth paying for. Everything downstream assumes these
    // verdicts are right, and a wrong one reaches a real audience.
    tier: 'deep',
    effort: 'high',
    maxSearches: Math.min(4 + idea.claims.length * 2, 16),
    maxTokens: 8_000,
  })

  /**
   * Reconcile verdicts against the claims we actually sent.
   *
   * The model returns `claim` as free text, having just read pages that may be
   * written to manipulate it. Passing that echo downstream would give injected
   * prose a route into the writer's "VERIFIED MATERIAL" block and from there
   * into published slides. So the verdict supplies only the judgement —
   * verdict, confidence, reasoning, sources — and the claim text always comes
   * from our own input.
   *
   * A count mismatch means the ordering contract was broken and the mapping
   * cannot be trusted, so the whole verification is rejected rather than
   * guessed at.
   */
  if (result.data.verdicts.length !== idea.claims.length) {
    throw new Error(
      `Verification returned ${result.data.verdicts.length} verdicts for ` +
        `${idea.claims.length} claims. Refusing to guess the mapping.`,
    )
  }

  const verdicts = result.data.verdicts.map((v, i) => ({
    ...v,
    claim: idea.claims[i]!.text,
    // isCore is an editorial decision made at ideation, not something the
    // verifier may downgrade to get a claim past the gate.
    isCore: idea.claims[i]!.isCore,
    sources: v.sources.filter((s) => isSafeSourceUrl(s.url)),
  }))

  return {
    verification: { verdicts, caveats: result.data.caveats },
    searched: result.searched,
    cost: costOf(result),
  }
}

/**
 * Only http(s) sources survive.
 *
 * Source URLs are rendered as links on an authenticated reviewer's screen, so
 * a `javascript:` or `data:` URL returned by a manipulated verifier must never
 * become clickable.
 */
function isSafeSourceUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/* ─── Stage 3: write ─────────────────────────────────────────────────────── */

export interface WriteInput {
  niche: NichePack
  idea: Idea
  verification: Verification
  /** Slide count. Defaults to the format's minimum plus one. */
  slideCount?: number
}

export async function write(
  input: WriteInput,
  provider: LlmProvider = getProvider(),
): Promise<{ draft: Draft; roles: string[]; cost: StageCost }> {
  const { niche, idea, verification } = input

  // Only formats the niche actually carries. Falling back to the built-in
  // registry made the niche's format restriction bypassable by any built-in
  // id, quietly contradicting the filter applied at ideation.
  const format = niche.formats.find((f) => f.id === idea.format)
  if (!format) {
    throw new Error(
      `Format "${idea.format}" is not available in niche "${niche.slug}". ` +
        `Available: ${niche.formats.map((f) => f.id).join(', ')}`,
    )
  }

  const count = input.slideCount ?? Math.min(format.minSlides + 1, format.maxSlides)
  const plan = planSlides(format, count)
  if (!plan.ok) throw new Error(plan.error)

  // Spell out each slide's role, purpose and character budget. Budgets are the
  // difference between copy that typesets and copy the renderer has to shrink
  // until it is unreadable at thumbnail size.
  const slidePlan = plan.roles
    .map((roleId, i) => {
      const role = format.roles.find((r) => r.id === roleId)!
      const budgets = [
        role.headlineBudget ? `headline ≤ ${role.headlineBudget} chars` : null,
        role.bodyBudget ? `body ≤ ${role.bodyBudget} chars` : null,
      ]
        .filter(Boolean)
        .join(', ')
      return `Slide ${i + 1} — role "${roleId}": ${role.purpose}${budgets ? ` (${budgets})` : ''}`
    })
    .join('\n')

  // Only claims that survived verification are shown. The writer cannot use
  // what it cannot see, which is the point.
  const usable = verification.verdicts.filter(
    (v) => v.verdict === 'supported' || v.verdict === 'disputed',
  )
  const evidence = usable
    .map(
      (v) =>
        `- [${v.verdict}, confidence ${v.confidence}] ${v.claim}` +
        (v.sources.length ? `\n    sources: ${v.sources.map((s) => s.title).join('; ')}` : ''),
    )
    .join('\n')

  const prompt = [
    `Title: ${idea.title}`,
    `Premise: ${idea.premise}`,
    `Angle: ${idea.angle}`,
    '',
    'VERIFIED MATERIAL — write only what these support:',
    evidence || '(none verified — do not invent any factual content)',
    verification.caveats.length
      ? `\nCaveats found during verification, respect them:\n${verification.caveats
          .map((c) => `- ${c}`)
          .join('\n')}`
      : '',
    '',
    `Produce exactly ${plan.roles.length} slides in this order:`,
    slidePlan,
    '',
    'Every slide needs altText. Claims marked "disputed" must be presented as contested,',
    'never as settled fact.',
    niche.promptOverrides.write ?? '',
  ]
    .filter(Boolean)
    .join('\n')

  const result = await provider.generate(draftSchema, {
    system: writeSystem(niche),
    prompt,
    tier: 'balanced',
    effort: 'high',
    maxTokens: 8_000,
  })

  return { draft: result.data, roles: plan.roles, cost: costOf(result) }
}

/* ─── Channel setup ──────────────────────────────────────────────────────── */

export interface GenerateNicheInput {
  /** One or two sentences describing the channel, in the operator's words. */
  description: string
  /** BCP-47 tag to write audience, voice and seeds in. */
  language?: string
  /** Format ids the model may choose from. Passed in, never invented. */
  formatIds: string[]
  /** Theme ids the model may choose from. */
  themeIds: string[]
}

/**
 * "Describe your channel in a sentence" → a full configuration.
 *
 * The prompt for this has existed since the beginning and nothing ever called
 * it, which left `presets.ts` describing an intended path that did not exist.
 * This is that path.
 *
 * `formatIds` and `themeIds` are supplied by the caller rather than read here,
 * because this package does not depend on @claimfold/templates and must not
 * start to. It also means the model chooses from a list rather than inventing
 * ids, so a generated channel cannot ask for slide structures nothing can
 * render — the same reason `ideate` filters unknown formats out.
 *
 * The result is a starting point, not an answer. Every caller should put it in
 * front of a person before it produces anything.
 */
export async function generateNiche(
  input: GenerateNicheInput,
  provider: LlmProvider = getProvider(),
): Promise<{ niche: GeneratedNiche; cost: StageCost }> {
  const prompt = [
    `Channel description: ${input.description}`,
    input.language ? `Write audience, voice and topic seeds in: ${input.language}` : '',
    '',
    'Return one configuration. Choose formats and a theme from the allowed ids only.',
  ]
    .filter(Boolean)
    .join('\n')

  const result = await provider.generate(generatedNicheSchema, {
    system: generateNicheSystem(input.formatIds, input.themeIds),
    prompt,
    // One short structured answer that a person reviews immediately, so the
    // cheap tier is the right call — unlike verification, nothing downstream
    // depends on this being right without being read.
    tier: 'balanced',
    effort: 'medium',
    maxTokens: 4_000,
  })

  return { niche: result.data, cost: costOf(result) }
}

/**
 * A generated channel, turned into something the database will accept.
 *
 * Three things are decided here rather than by the model, and each is a rule the
 * product does not let a configuration talk its way out of:
 *
 * `requireSources` is always on. It is what makes a post "materially
 * transformed" under Instagram's originality policy, and a channel that
 * generated itself is exactly the one that should not be able to switch it off.
 *
 * `minConfidence` is clamped to the floor the schema enforces anyway, so a
 * model that returns 0.2 produces a valid channel rather than a validation
 * error the operator has to interpret.
 *
 * Formats are resolved from the built-ins by id, so an id the model invented
 * disappears here instead of failing later at slide planning.
 */
export function nichePackFromGenerated(
  generated: GeneratedNiche,
  formats: SlideFormat[],
): NichePackInput {
  const chosen = formats.filter((format) => generated.formatIds.includes(format.id))

  return {
    slug: generated.slug,
    name: generated.name,
    description: generated.description,
    language: generated.language,
    audience: generated.audience,
    voice: generated.voice,
    topicSeeds: generated.topicSeeds,
    // Falls back to every built-in rather than to none: a channel with no
    // formats cannot produce anything, and that is a worse outcome than one
    // whose format list is broader than the model intended.
    formats: chosen.length > 0 ? chosen : formats,
    hashtagSets: generated.hashtagSets,
    themeId: generated.themeId,
    promptOverrides: {},
    rules: {
      requireSources: true,
      publicInterest: generated.publicInterest,
      minConfidence: Math.min(1, Math.max(0.5, generated.suggestedMinConfidence)),
      forbiddenTopics: generated.forbiddenTopics,
      requireAdLabel: true,
    },
    cadence: {
      postsPerWeek: 4,
      preferredTimes: ['18:30', '12:00'],
      timezone: 'Europe/Berlin',
    },
  }
}
