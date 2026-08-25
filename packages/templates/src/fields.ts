import { isTemplateId, type TemplateId } from './templates.tsx'

/**
 * Which content fields each layout actually reads.
 *
 * This exists because the alternative is an editor that guesses. Every template
 * uses a different subset of `SlideContent`, that subset lived only inside the
 * JSX, and a form offering a field the chosen layout ignores is a box where
 * typing does nothing — the most quietly infuriating kind of interface bug.
 *
 * `fields.test.ts` reads `templates.tsx` and fails if a template touches a
 * `content.*` key that is not listed here, so the two cannot drift apart. That
 * is the whole point of the file: not documentation, a checked contract.
 *
 * Roles win over templates for hook, sources and cta, exactly as `SlideView`
 * dispatches — those three are the same in every family so a carousel reads as
 * a set. Offering a layout picker on them would be offering a control that does
 * nothing.
 */

/** Keys of `SlideContent` a person can edit. */
export type ContentFieldKey =
  | 'kicker'
  | 'headline'
  | 'body'
  | 'footnote'
  | 'figure'
  | 'figureLabel'
  | 'items'
  | 'imageAssetId'

export interface ContentField {
  key: ContentFieldKey
  /**
   * How to render the input, and for `items`, how many.
   *
   * `pair` is the split layout's two panels — `items[0]` and `items[1]` with
   * their own labels — as opposed to `list`, an open-ended set of lines.
   */
  kind: 'line' | 'paragraph' | 'list' | 'pair' | 'image'
  /**
   * What the field means in this layout, when the generic name would mislead.
   *
   * `figure` is the big position badge on a list slide and the date on a
   * timeline slide. A single label for both would be wrong in one of the two
   * places, and the label itself has to come from the message catalogue rather
   * than from here — this package knows nothing about languages.
   */
  meaning?: 'badge' | 'date' | 'panels'
}

const KICKER: ContentField = { key: 'kicker', kind: 'line' }
const HEADLINE: ContentField = { key: 'headline', kind: 'line' }
const BODY: ContentField = { key: 'body', kind: 'paragraph' }
const FOOTNOTE: ContentField = { key: 'footnote', kind: 'line' }
const ITEMS_LIST: ContentField = { key: 'items', kind: 'list' }
const ITEMS_PAIR: ContentField = { key: 'items', kind: 'pair', meaning: 'panels' }
const FIGURE: ContentField = { key: 'figure', kind: 'line' }
const FIGURE_BADGE: ContentField = { key: 'figure', kind: 'line', meaning: 'badge' }
const FIGURE_DATE: ContentField = { key: 'figure', kind: 'line', meaning: 'date' }
const FIGURE_LABEL: ContentField = { key: 'figureLabel', kind: 'line' }
const IMAGE: ContentField = { key: 'imageAssetId', kind: 'image' }

/** Layouts are ignored for these roles. */
const ROLE_FIELDS: Record<string, ContentField[]> = {
  hook: [KICKER, HEADLINE, BODY],
  sources: [KICKER, HEADLINE, ITEMS_LIST, FOOTNOTE],
  cta: [HEADLINE, BODY],
}

const TEMPLATE_FIELDS: Record<TemplateId, ContentField[]> = {
  editorial: [KICKER, HEADLINE, BODY, FOOTNOTE],
  split: [KICKER, HEADLINE, ITEMS_PAIR, FOOTNOTE],
  list: [FIGURE_BADGE, HEADLINE, BODY, ITEMS_LIST],
  /*
    `kicker` is here because `TimelineBody` reads `content.figure ?? content.kicker`
    for the date line. Leaving it out would mean a slide whose date arrived in
    `kicker` shows a line of text the editor cannot reach — which is precisely
    the failure this map exists to prevent.
  */
  timeline: [FIGURE_DATE, KICKER, HEADLINE, BODY],
  figure: [FIGURE, FIGURE_LABEL, HEADLINE, BODY],
  photo: [IMAGE, KICKER, HEADLINE, BODY],
}

/** Whether this slide's layout is fixed by its role. */
export function roleFixesLayout(role: string): boolean {
  return role in ROLE_FIELDS
}

export function contentFieldsFor(role: string, templateId: string): ContentField[] {
  const byRole = ROLE_FIELDS[role]
  if (byRole) return byRole
  return TEMPLATE_FIELDS[isTemplateId(templateId) ? templateId : 'editorial']
}

/**
 * Every key any layout can read.
 *
 * The write-side allowlist. `SlideContent` carries an index signature, so
 * without this a mistyped field name would save happily, stay invisible in
 * every preview, and still change the render hash — a slide that re-renders
 * forever to produce an identical image.
 */
export const ALL_CONTENT_FIELD_KEYS: ContentFieldKey[] = [
  'kicker',
  'headline',
  'body',
  'footnote',
  'figure',
  'figureLabel',
  'items',
  'imageAssetId',
]
