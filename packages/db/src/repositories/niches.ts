import { and, asc, eq, isNotNull, isNull, ne } from 'drizzle-orm'

import { withOrg, type TenantTx } from '../rls.ts'
import { niches } from '../schema/index.ts'
import type { NicheRules, PostingCadence, PromptOverrides, SlideFormat } from '../types.ts'

/**
 * Tenant-scoped access to niche configuration.
 *
 * A niche is the whole topic setup stored as data — language, voice, seeds,
 * slide formats, editorial rules. Reading it is a tenant operation like any
 * other, so it goes through `withOrg` and row-level security rather than a
 * hand-written `WHERE org_id`.
 */

export type NicheRow = typeof niches.$inferSelect

/**
 * A complete channel, as the editor and the generator both produce one.
 *
 * Deliberately the whole thing rather than a partial: a channel is a coherent
 * configuration, and half-saving one leaves the fact-check rules describing a
 * different channel from the prompts. Callers pass a pack that has already been
 * through `validateNichePack`, which is what stops a hand-edited `minConfidence`
 * of 5 from sailing past every threshold.
 */
export interface NicheWrite {
  slug: string
  name: string
  description: string
  language: string
  audience: string
  voice: string
  topicSeeds: string[]
  formats: SlideFormat[]
  promptOverrides: PromptOverrides
  hashtagSets: string[][]
  themeId: string
  rules: NicheRules
  cadence: PostingCadence
  watermark?: string
  accentColor?: string | null
  /** Which connected account this channel publishes to. Null means none chosen. */
  igAccountId?: string | null
  isDefault?: boolean
}

export type NicheWriteResult =
  | { ok: true; id: string }
  /** Another channel in this workspace already uses that slug. */
  | { ok: false; reason: 'slug_taken' }
  | { ok: false; reason: 'missing' }

/**
 * Exactly one default per workspace.
 *
 * Enforced here rather than by a partial unique index because the transition is
 * a swap, not an insert: two rows are briefly both default while the update runs,
 * and a constraint would refuse the legitimate change. Clearing first inside the
 * same transaction gives the same guarantee without that problem.
 */
async function clearOtherDefaults(tx: TenantTx, keepId?: string): Promise<void> {
  await tx
    .update(niches)
    .set({ isDefault: false })
    .where(keepId ? ne(niches.id, keepId) : undefined)
}

export async function createNiche(orgId: string, input: NicheWrite): Promise<NicheWriteResult> {
  return withOrg(orgId, async (tx) => {
    /**
     * `onConflictDoNothing` rather than a prior existence check.
     *
     * The check-then-insert version loses the race between two simultaneous
     * creates, and the unique index would then surface as an unhandled database
     * error rather than as "that name is taken". Letting the index decide is
     * both correct and simpler — the same reasoning as the one-running-job-per-
     * kind index in schema/core.ts.
     */
    const [row] = await tx
      .insert(niches)
      .values({
        orgId,
        slug: input.slug,
        name: input.name,
        description: input.description,
        language: input.language,
        audience: input.audience,
        voice: input.voice,
        topicSeeds: input.topicSeeds,
        formats: input.formats,
        promptOverrides: input.promptOverrides,
        hashtagSets: input.hashtagSets,
        themeId: input.themeId,
        rules: input.rules,
        cadence: input.cadence,
        watermark: input.watermark ?? '',
        accentColor: input.accentColor ?? null,
        igAccountId: input.igAccountId ?? null,
        isDefault: input.isDefault ?? false,
      })
      .onConflictDoNothing()
      .returning({ id: niches.id })

    if (!row) return { ok: false, reason: 'slug_taken' }

    if (input.isDefault) await clearOtherDefaults(tx, row.id)

    return { ok: true, id: row.id }
  })
}

export async function updateNiche(
  orgId: string,
  nicheId: string,
  input: NicheWrite,
): Promise<NicheWriteResult> {
  return withOrg(orgId, async (tx) => {
    // Pre-checked so the caller can say "that name is taken" rather than
    // surfacing a constraint violation. The unique index is still the authority
    // if two edits race; that case ends up as a generic failure, which is the
    // right trade for a form one person fills in.
    const [clash] = await tx
      .select({ id: niches.id })
      .from(niches)
      .where(and(eq(niches.slug, input.slug), ne(niches.id, nicheId)))
      .limit(1)

    if (clash) return { ok: false, reason: 'slug_taken' }

    const [row] = await tx
      .update(niches)
      .set({
        slug: input.slug,
        name: input.name,
        description: input.description,
        language: input.language,
        audience: input.audience,
        voice: input.voice,
        topicSeeds: input.topicSeeds,
        formats: input.formats,
        promptOverrides: input.promptOverrides,
        hashtagSets: input.hashtagSets,
        themeId: input.themeId,
        rules: input.rules,
        cadence: input.cadence,
        ...(input.watermark !== undefined ? { watermark: input.watermark } : {}),
        ...(input.accentColor !== undefined ? { accentColor: input.accentColor } : {}),
        ...(input.igAccountId !== undefined ? { igAccountId: input.igAccountId } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        updatedAt: new Date(),
      })
      .where(eq(niches.id, nicheId))
      .returning({ id: niches.id })

    if (!row) return { ok: false, reason: 'missing' }

    if (input.isDefault) await clearOtherDefaults(tx, nicheId)

    return { ok: true, id: row.id }
  })
}

/**
 * Retire a channel without deleting it.
 *
 * Deleting is not on offer, and not because it is hard: `posts.nicheId` is
 * `onDelete: 'restrict'`, so a channel that has ever produced a post cannot go
 * without taking the editorial record of those posts with it. Archiving is what
 * the schema was built for — `listNiches` has always filtered on `archivedAt`
 * and nothing ever set it.
 */
export async function archiveNiche(orgId: string, nicheId: string): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const [row] = await tx
      .update(niches)
      .set({ archivedAt: new Date(), isDefault: false, updatedAt: new Date() })
      .where(and(eq(niches.id, nicheId), isNull(niches.archivedAt)))
      .returning({ id: niches.id })

    return Boolean(row)
  })
}

export async function restoreNiche(orgId: string, nicheId: string): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const [row] = await tx
      .update(niches)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(niches.id, nicheId))
      .returning({ id: niches.id })

    return Boolean(row)
  })
}

/** Archived channels, so a retired one can be found again. */
export async function listArchivedNiches(orgId: string): Promise<NicheRow[]> {
  return withOrg(orgId, async (tx) => {
    return tx
      .select()
      .from(niches)
      .where(isNotNull(niches.archivedAt))
      .orderBy(asc(niches.name))
  })
}

/** Active niches, default first, then alphabetical. Archived ones are hidden. */
export async function listNiches(orgId: string): Promise<NicheRow[]> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(niches)
      .where(isNull(niches.archivedAt))
      .orderBy(asc(niches.name))

    // `isDefault` first. Sorted in JS rather than SQL because Postgres orders
    // booleans false-first and the inverse reads worse than three lines here.
    return [...rows].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
  })
}

export async function getNiche(orgId: string, nicheId: string): Promise<NicheRow | null> {
  return withOrg(orgId, async (tx) => {
    const [row] = await tx.select().from(niches).where(eq(niches.id, nicheId)).limit(1)
    return row ?? null
  })
}

/**
 * The two channel-wide appearance settings.
 *
 * Deliberately narrow. Everything else about a niche drives the model, and a
 * function that could write `rules` or `promptOverrides` from the same form as a
 * colour picker is one careless field name away from editing the fact-check
 * bar. `accentColor` is validated for contrast before it reaches here — this
 * function records a decision, it does not make one.
 */
export async function updateNicheAppearance(
  orgId: string,
  nicheId: string,
  patch: { watermark?: string; accentColor?: string | null },
): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx
      .update(niches)
      .set({
        ...(patch.watermark !== undefined ? { watermark: patch.watermark } : {}),
        ...(patch.accentColor !== undefined ? { accentColor: patch.accentColor } : {}),
        updatedAt: new Date(),
      })
      .where(eq(niches.id, nicheId))
  })
}
