import type { SlideContent } from '@claimfold/db'
import { z } from 'zod'

/**
 * The write side of hand-editing a slide.
 *
 * Separate from `slideDraftSchema`, which describes what the writing model
 * returns, because the two have different jobs. The model's schema is permissive
 * about nulls because a model emits them; this one is strict about keys because
 * a form posts them, and a server action is a public endpoint.
 */

/**
 * Caps generous enough that real copy never meets them.
 *
 * They are not an editorial limit — the per-role `headlineBudget` and
 * `bodyBudget` in the niche's format are, and those are soft because the
 * renderer shrinks type to fit. These exist so a hand-crafted POST cannot write
 * a megabyte into a jsonb column that gets read back on every page load.
 */
export const slideContentEditSchema = z
  .object({
    headline: z.string().max(300).optional(),
    body: z.string().max(2_000).optional(),
    kicker: z.string().max(120).optional(),
    footnote: z.string().max(300).optional(),
    figure: z.string().max(40).optional(),
    figureLabel: z.string().max(80).optional(),
    items: z.array(z.string().max(300)).max(12).optional(),
    imageAssetId: z.string().uuid().optional(),
  })
  /*
    Rejected rather than stripped.

    `SlideContent` carries an index signature, so an unknown key would otherwise
    save happily, never appear in any preview — no template reads it — and still
    change the render hash. The result is a slide that re-rasterises on every
    publish to produce a byte-identical JPEG, forever, with nothing anywhere
    looking wrong. The pipeline only ever writes the eight keys above, so a
    rejection here means a bug rather than a person's mistake.
  */
  .strict()

export type SlideContentEdit = z.infer<typeof slideContentEditSchema>

/** Instagram's own ceiling. Also what the gate blocks an empty one on. */
export const MAX_ALT_TEXT = 1_000

/**
 * Trim, then delete what is left empty.
 *
 * The deleting is the part that matters, and it is not tidiness. An empty string
 * and an absent key describe the same slide and hash differently —
 * `computeRenderHash` sorts keys but has no opinion about empty values — so
 * `{headline: 'x', body: ''}` and `{headline: 'x'}` would each keep their own
 * cached image and neither would ever be reused. A form posts an empty string
 * for every field a person left blank, so without this every single edit would
 * plant one of those.
 */
export function normaliseSlideContent(input: SlideContentEdit): SlideContent {
  const out: SlideContent = {}

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) out[key] = trimmed
      continue
    }

    if (Array.isArray(value)) {
      const items = value.map((item) => item.trim()).filter(Boolean)
      if (items.length > 0) out[key] = items
    }
  }

  return out
}
