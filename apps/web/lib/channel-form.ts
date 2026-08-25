import type { NicheWrite } from '@claimfold/db'
import {
  BUILT_IN_FORMATS,
  validateNichePack,
  type ValidationFailure,
} from '@claimfold/niches'

import { formText } from './form.ts'

/**
 * Reading a channel off the editor form.
 *
 * A channel drives every prompt in the pipeline and holds the fact-check bar, so
 * this is a trust boundary rather than a form parser. Two rules follow from that.
 *
 * Everything goes through `validateNichePack` before it can reach the database —
 * the same function the gate and the generator use, so the three cannot form
 * different opinions about the same channel. And the fields that could disable
 * the gate are not simply "validated": `minConfidence` has a floor of 0.5 in the
 * schema, and `promptOverrides` has no `verify` slot at all, so a channel cannot
 * instruct the verifier to approve everything. Neither of those is enforced here;
 * they are enforced in packages/niches, and this only has to not route around
 * them.
 */

/** One value per line, blanks dropped. How people actually type a list. */
function lines(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Comma or space separated, for the fields that are a single short list. */
function words(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((word) => word.trim())
    .filter(Boolean)
}

export type ChannelFormResult =
  | { ok: true; niche: NicheWrite }
  | { ok: false; errors: ValidationFailure[] }

/**
 * What the editor gets back from a save that was refused.
 *
 * Lives here rather than beside the action it belongs to, because a
 * `'use server'` module may only export async functions. A plain object export
 * from one is not a type error — TypeScript is perfectly happy — it is a runtime
 * failure Next raises while rendering the page, which is why this only shows up
 * when someone opens the screen.
 */
export interface ChannelFormState {
  /** Field-level failures, keyed by the dotted path `validateNichePack` reports. */
  errors: Array<{ path: string; message: string }>
  /** A failure that belongs to no single field. */
  message?: string
}

export const EMPTY_CHANNEL_STATE: ChannelFormState = { errors: [] }

export function readChannelForm(form: FormData): ChannelFormResult {
  /**
   * Formats are resolved from the built-ins by id, never taken as free text.
   *
   * A format defines the slide roles the renderer dispatches on and the budgets
   * the writer works to. Accepting an arbitrary id would let a channel ask for a
   * structure nothing can render, which surfaces mid-generation after the money
   * has been spent.
   */
  const chosenIds = new Set(
    form.getAll('formatIds').filter((value): value is string => typeof value === 'string'),
  )
  const formats = BUILT_IN_FORMATS.filter((format) => chosenIds.has(format.id))

  const minConfidenceRaw = Number(formText(form, 'minConfidence'))
  const postsPerWeekRaw = Number(formText(form, 'postsPerWeek'))

  const ideate = formText(form, 'promptIdeate').trim()
  const write = formText(form, 'promptWrite').trim()

  const candidate = {
    slug: formText(form, 'slug').trim(),
    name: formText(form, 'name').trim(),
    description: formText(form, 'description').trim(),
    language: formText(form, 'language').trim(),
    audience: formText(form, 'audience').trim(),
    voice: formText(form, 'voice').trim(),
    topicSeeds: lines(formText(form, 'topicSeeds')),
    formats,
    // Absent rather than empty-string: `promptOverridesSchema` is strict, and an
    // empty override would otherwise append a blank line to every prompt.
    promptOverrides: {
      ...(ideate ? { ideate } : {}),
      ...(write ? { write } : {}),
    },
    hashtagSets: lines(formText(form, 'hashtagSets')).map(words),
    themeId: formText(form, 'themeId').trim(),
    rules: {
      requireSources: formText(form, 'requireSources') === 'on',
      publicInterest: formText(form, 'publicInterest') === 'on',
      minConfidence: Number.isFinite(minConfidenceRaw) ? minConfidenceRaw : 0,
      forbiddenTopics: lines(formText(form, 'forbiddenTopics')),
      requireAdLabel: formText(form, 'requireAdLabel') === 'on',
    },
    cadence: {
      postsPerWeek: Number.isInteger(postsPerWeekRaw) ? postsPerWeekRaw : 0,
      preferredTimes: words(formText(form, 'preferredTimes')),
      timezone: formText(form, 'timezone').trim(),
    },
  }

  const parsed = validateNichePack(candidate)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }

  return {
    ok: true,
    niche: {
      ...parsed.pack,
      watermark: formText(form, 'watermark').trim().slice(0, 40),
      accentColor: formText(form, 'accentColor').trim() || null,
      // Empty string means "none chosen", which is a legitimate state for a
      // channel that has no account connected yet.
      igAccountId: formText(form, 'igAccountId').trim() || null,
      isDefault: formText(form, 'isDefault') === 'on',
    },
  }
}

/** Turn a stored channel back into the shape the form fields expect. */
export function channelFormDefaults(row: {
  slug: string
  name: string
  description: string
  language: string
  audience: string
  voice: string
  topicSeeds: string[]
  formats: Array<{ id: string }>
  promptOverrides: { ideate?: string; write?: string }
  hashtagSets: string[][]
  themeId: string
  rules: {
    requireSources: boolean
    publicInterest: boolean
    minConfidence: number
    forbiddenTopics: string[]
    requireAdLabel: boolean
  }
  cadence: { postsPerWeek: number; preferredTimes: string[]; timezone: string }
  watermark: string
  accentColor: string | null
  igAccountId: string | null
  isDefault: boolean
}) {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    language: row.language,
    audience: row.audience,
    voice: row.voice,
    topicSeeds: row.topicSeeds.join('\n'),
    formatIds: row.formats.map((format) => format.id),
    promptIdeate: row.promptOverrides.ideate ?? '',
    promptWrite: row.promptOverrides.write ?? '',
    hashtagSets: row.hashtagSets.map((set) => set.join(' ')).join('\n'),
    themeId: row.themeId,
    requireSources: row.rules.requireSources,
    publicInterest: row.rules.publicInterest,
    requireAdLabel: row.rules.requireAdLabel,
    minConfidence: row.rules.minConfidence,
    forbiddenTopics: row.rules.forbiddenTopics.join('\n'),
    postsPerWeek: row.cadence.postsPerWeek,
    preferredTimes: row.cadence.preferredTimes.join(' '),
    timezone: row.cadence.timezone,
    watermark: row.watermark,
    accentColor: row.accentColor ?? '',
    igAccountId: row.igAccountId ?? '',
    isDefault: row.isDefault,
  }
}

export type ChannelFormDefaults = ReturnType<typeof channelFormDefaults>
