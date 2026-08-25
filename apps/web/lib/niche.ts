import type { NicheRow } from '@claimfold/db'
import { validateNichePack, type NichePack, type ValidationFailure } from '@claimfold/niches'

/**
 * Database row → validated niche pack.
 *
 * Niches are stored as loose `jsonb`, so nothing in Postgres stops a
 * hand-edited row from carrying a format with impossible slide counts or a
 * confidence floor of 5. Every consumer must therefore validate before
 * trusting, and every consumer must validate the SAME WAY — otherwise the gate
 * and the generator can form different opinions about the same niche, which is
 * precisely the class of bug the gate exists to prevent.
 *
 * Fields are listed explicitly rather than spread: a row carries `id`, `orgId`
 * and timestamps that are not part of the pack, and `.strict()` on the schema
 * would reject them.
 */
export function packFromRow(
  row: NicheRow,
): { ok: true; pack: NichePack } | { ok: false; errors: ValidationFailure[] } {
  return validateNichePack({
    slug: row.slug,
    name: row.name,
    description: row.description,
    language: row.language,
    audience: row.audience,
    voice: row.voice,
    topicSeeds: row.topicSeeds,
    formats: row.formats,
    promptOverrides: row.promptOverrides,
    hashtagSets: row.hashtagSets,
    themeId: row.themeId,
    rules: row.rules,
    cadence: row.cadence,
  })
}

/** Human-readable reason a niche could not be used. */
export function describeNicheErrors(errors: ValidationFailure[]): string {
  return errors.map((e) => `${e.path} ${e.message}`).join('; ')
}
