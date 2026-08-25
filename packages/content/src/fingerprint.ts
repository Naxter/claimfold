import { createHash } from 'node:crypto'

import type { Idea } from './schemas.ts'

/**
 * A stable identifier for "this is the same idea again".
 *
 * The premise is the thing being deduplicated, not the title: two runs will
 * happily produce "Vier Mittelalter-Irrtümer" and "Mittelalter: vier Irrtümer"
 * for identical content, so hashing the title would catch almost nothing.
 *
 * Normalisation is deliberately blunt — lowercase, strip everything that is
 * not a letter or digit, collapse whitespace. It will not catch a genuine
 * rephrasing, and it is not meant to: this is a cheap guard against the
 * obvious repeat, backed by feeding recent titles into ideation, which is
 * where actual variety comes from.
 *
 * Unicode-aware (`\p{L}\p{N}` with the `u` flag) because a German premise is
 * full of umlauts and a Latin-only class would hash "Wärme" and "Wrme" apart.
 */
export function ideaFingerprint(idea: Pick<Idea, 'premise'>): string {
  const normalised = idea.premise
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

  return createHash('sha256').update(normalised).digest('hex').slice(0, 32)
}
