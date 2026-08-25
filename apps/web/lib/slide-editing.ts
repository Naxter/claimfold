import { normaliseSlideContent, slideContentEditSchema } from '@claimfold/content'
import type { SlideContent } from '@claimfold/db'
import { contentFieldsFor, type ContentField } from '@claimfold/templates'

import { formText } from './form.ts'

/**
 * Reading an edited slide off a form.
 *
 * The important property is that this is driven by the LAYOUT, not by the form.
 * Only the fields the chosen template actually renders are read, so a hand-made
 * POST cannot plant `figure` on an editorial slide — a value no template would
 * ever draw, invisible in every preview, and still part of the render hash. That
 * combination produces a slide which re-rasterises on every publish to make a
 * byte-identical JPEG, forever, with nothing anywhere looking wrong.
 */

/**
 * Statuses where editing is refused.
 *
 * `scheduled` is in the list because the publish worker may be seconds from
 * claiming the post; changing the copy underneath it would mean the reviewer
 * approved one carousel and Instagram received another. Stopping the post first
 * is a deliberate speed bump rather than an obstacle.
 */
const LOCKED_STATUSES = new Set(['published', 'publishing', 'scheduled'])

export function isEditable(status: string): boolean {
  return !LOCKED_STATUSES.has(status)
}

export type SlideFormResult =
  | { ok: true; content: SlideContent }
  /** A field arrived that this layout does not use. */
  | { ok: false }

export function readSlideContentForm(form: FormData, fields: ContentField[]): SlideFormResult {
  const raw: Record<string, unknown> = {}

  for (const field of fields) {
    if (field.key === 'items') {
      const items = form
        .getAll('items')
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
      if (items.length > 0) raw['items'] = items
      continue
    }

    const value = formText(form, field.key).trim()
    // Empty and absent are the same slide but hash differently, so an empty
    // field must never become an empty string in the stored object. See
    // `normaliseSlideContent`, which is the other half of this rule.
    if (value) raw[field.key] = value
  }

  const parsed = slideContentEditSchema.safeParse(raw)
  if (!parsed.success) return { ok: false }

  return { ok: true, content: normaliseSlideContent(parsed.data) }
}

/** The fields this slide's editor should offer, layout and role considered. */
export function fieldsForSlide(
  role: string,
  slideTemplateId: string | null,
  postTemplateId: string,
): ContentField[] {
  return contentFieldsFor(role, slideTemplateId ?? postTemplateId)
}

/**
 * Hashtags as people actually type them.
 *
 * Spaces, commas, newlines and a leading `#` all appear in real input, and the
 * publish step adds the `#` back itself — so storing them with one would give
 * `##tag` on every post.
 */
export function parseHashtags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((tag) => tag.replace(/^#+/, '').trim())
        .filter(Boolean)
        .map((tag) => tag.slice(0, 60)),
    ),
  ].slice(0, 30)
}
