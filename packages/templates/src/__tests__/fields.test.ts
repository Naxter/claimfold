import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  ALL_CONTENT_FIELD_KEYS,
  contentFieldsFor,
  roleFixesLayout,
  type ContentFieldKey,
} from '../fields.ts'
import { TEMPLATE_IDS } from '../templates.tsx'

/**
 * The fields map, checked against the templates themselves.
 *
 * `fields.ts` decides which inputs the slide editor offers. If a template starts
 * reading a content key the map does not list, the editor silently stops being
 * able to edit part of the slide — text visible in the preview with no box to
 * change it, and no error anywhere. That is the kind of drift a comment cannot
 * prevent, so this reads the source and fails the build instead.
 *
 * Same technique as `apps/web/lib/__tests__/no-next-image.test.ts` and the
 * contrast suite: assert against the artefact rather than against a copy of it.
 */

const SOURCE = readFileSync(fileURLToPath(new URL('../templates.tsx', import.meta.url)), 'utf8')

/** Every `content.x` and `content['x']` read in a block of source. */
function keysRead(source: string): Set<string> {
  const found = new Set<string>()
  for (const match of source.matchAll(/content\.(\w+)/g)) found.add(match[1]!)
  for (const match of source.matchAll(/content\[['"](\w+)['"]\]/g)) found.add(match[1]!)
  return found
}

/** The body of one top-level `function Name(...)` declaration. */
function functionBlock(name: string): string {
  const start = SOURCE.indexOf(`function ${name}(`)
  if (start === -1) throw new Error(`No function ${name} in templates.tsx`)

  const next = SOURCE.slice(start + 1).search(/\nfunction \w+\(|\nconst BODY_TEMPLATES/)
  return next === -1 ? SOURCE.slice(start) : SOURCE.slice(start, start + 1 + next)
}

/**
 * Reads that are real but deliberately not offered as fields.
 *
 * Each one is a fallback rather than a field somebody edits, and each has a
 * different reason — which is why this is a list with notes rather than a
 * loosened assertion.
 */
const DOCUMENTED_FALLBACKS: Record<string, ContentFieldKey[]> = {
  // `items[0] ?? body`. The editor migrates `body` into the top panel when it
  // opens (see `seedContent` in apps/web/components/slide-editor.tsx), so the
  // panels are the only thing anyone edits.
  split: ['body'],
  // Degrades to the editorial layout when there is no figure, which reads
  // `kicker` and `footnote`. Offering them on a figure slide would be offering
  // fields that only appear once the layout has given up.
  figure: ['kicker', 'footnote'],
  // Same degradation, for a slide whose picture is missing.
  photo: ['kicker', 'footnote', 'body'],
}

describe('the fields map covers what the templates read', () => {
  it('knows every content key any template touches', () => {
    const unknown = [...keysRead(SOURCE)].filter(
      (key) => !(ALL_CONTENT_FIELD_KEYS as string[]).includes(key),
    )

    expect(
      unknown,
      'a template reads a content key the editor has no field for — add it to fields.ts',
    ).toEqual([])
  })

  const BODY_FUNCTIONS: Record<string, string> = {
    editorial: 'EditorialBody',
    split: 'SplitBody',
    list: 'ListBody',
    timeline: 'TimelineBody',
    figure: 'FigureBody',
    photo: 'PhotoBody',
  }

  it.each(TEMPLATE_IDS)('%s offers every field its layout reads directly', (templateId) => {
    const offered = new Set(contentFieldsFor('body', templateId).map((field) => field.key))
    const allowed = DOCUMENTED_FALLBACKS[templateId] ?? []

    const missing = [...keysRead(functionBlock(BODY_FUNCTIONS[templateId]!))].filter(
      (key) => !offered.has(key as ContentFieldKey) && !allowed.includes(key as ContentFieldKey),
    )

    expect(missing, `${templateId} renders these but the editor cannot reach them`).toEqual([])
  })

  const ROLE_FUNCTIONS: Record<string, string> = {
    hook: 'HookSlide',
    sources: 'SourcesSlide',
    cta: 'CtaSlide',
  }

  it.each(Object.keys(ROLE_FUNCTIONS))('the %s role offers every field it reads', (role) => {
    const offered = new Set(contentFieldsFor(role, 'editorial').map((field) => field.key))

    const missing = [...keysRead(functionBlock(ROLE_FUNCTIONS[role]!))].filter(
      (key) => !offered.has(key as ContentFieldKey),
    )

    expect(missing).toEqual([])
  })
})

describe('roles that ignore the layout', () => {
  it('are exactly the three shared slides', () => {
    // These dispatch on role in `SlideView`, so a layout picker on them would be
    // a control that does nothing. The editor hides it based on this.
    expect(['hook', 'sources', 'cta'].every(roleFixesLayout)).toBe(true)
    expect(roleFixesLayout('evidence')).toBe(false)
  })

  it('return the same fields whatever layout is passed', () => {
    for (const templateId of TEMPLATE_IDS) {
      expect(contentFieldsFor('hook', templateId)).toEqual(contentFieldsFor('hook', 'editorial'))
    }
  })
})

describe('an unknown layout', () => {
  it('falls back to editorial rather than offering nothing', () => {
    // `posts.templateId` is free text — a niche can name a layout that no longer
    // exists — and an editor with no fields at all would look broken.
    expect(contentFieldsFor('evidence', 'no-such-layout')).toEqual(
      contentFieldsFor('evidence', 'editorial'),
    )
  })
})
