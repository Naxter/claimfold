'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import type { SlideContent } from '@claimfold/db'
import type { ContentField } from '@claimfold/templates'

import { saveSlideAction, saveSlideLayoutAction } from '../app/posts/[id]/actions.ts'
import type { Messages } from '../lib/i18n/messages/en.ts'
import { ActionButton } from './action-button.tsx'
import { SlidePreview } from './slide-preview.tsx'

/**
 * Editing one slide, next to the thing being edited.
 *
 * Two properties are doing the work here.
 *
 * **It is a real form.** Every input has a name and posts to a server action, so
 * the whole editor works with JavaScript switched off. What the client adds is
 * the live preview beside it — and that only costs a re-render, because
 * `SlidePreview` draws the same React components the publish pipeline
 * screenshots. Nothing is approximated and nothing round-trips.
 *
 * **The fields come from the layout, not from this component.** Which inputs
 * appear is decided by `contentFieldsFor` in @claimfold/templates, checked
 * against the templates themselves by `fields.test.ts`. A field no layout reads
 * is a box where typing does nothing, which is the most quietly infuriating kind
 * of interface bug, and it is the one this arrangement makes impossible.
 *
 * Copy and layout are two separate forms on purpose. Saving copy stamps the
 * slide as edited by hand, which raises a warning on the review screen because
 * the claims below it were read against the earlier wording. Changing the layout
 * touches no claim and must raise nothing — a warning that fires when someone
 * picks a different look is a warning people learn to click past.
 */

export interface EditableSlide {
  id: string
  index: number
  role: string
  content: SlideContent
  altText: string
  templateId: string | null
  /** ISO string. Posted back as the optimistic lock. */
  updatedAt: string
}

export interface UploadOption {
  id: string
  /** Storage path, turned into a URL on this origin. */
  path: string
}

type EditLabels = Messages['review']['edit']

export function SlideEditor({
  slide,
  postId,
  postTemplateId,
  themeId,
  accentColor,
  watermark,
  lang,
  total,
  fields,
  budgets,
  layoutOptions,
  uploads,
  labels,
}: {
  slide: EditableSlide
  postId: string
  postTemplateId: string
  themeId: string
  accentColor: string | null
  watermark: string
  lang: string
  total: number
  fields: ContentField[]
  /** Soft per-role character budgets from the niche's format. */
  budgets: { headline?: number; body?: number }
  /** Empty when the role fixes the layout, which hides the picker entirely. */
  layoutOptions: string[]
  uploads: UploadOption[]
  labels: EditLabels
}) {
  const [content, setContent] = useState<SlideContent>(() => seedContent(slide.content, fields))
  const [altText, setAltText] = useState(slide.altText)
  /** Preview of a file chosen but not yet uploaded. */
  const [pendingImage, setPendingImage] = useState<string | null>(null)

  // An object URL is a handle to memory, not a string. Without the revoke, a
  // few minutes of picking photos leaks every one of them.
  useEffect(() => {
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage)
    }
  }, [pendingImage])

  const set = (key: string, value: unknown) =>
    setContent((current) => {
      const next = { ...current }
      if (value === '' || value === undefined) delete next[key]
      else next[key] = value
      return next
    })

  const items = Array.isArray(content.items) ? content.items : []
  const setItems = (next: string[]) => set('items', next.length > 0 ? next : undefined)

  const pathById = new Map(uploads.map((upload) => [upload.id, upload.path]))
  const chosenPath =
    typeof content.imageAssetId === 'string' ? pathById.get(content.imageAssetId) : undefined
  const previewImage = pendingImage ?? (chosenPath ? `/assets/${chosenPath}` : undefined)

  const effectiveTemplate = slide.templateId ?? postTemplateId

  return (
    <div className="grid gap-[var(--sp-5)] sm:grid-cols-[260px_minmax(0,1fr)]">
      <div>
        <SlidePreview
          templateId={effectiveTemplate}
          themeId={themeId}
          accentColor={accentColor}
          role={slide.role}
          content={content}
          page={slide.index + 1}
          total={total}
          watermark={watermark || undefined}
          lang={lang}
          imageSrc={previewImage}
        />
        <p className="mt-1.5 text-xs text-subtle">
          {slide.index + 1}. {slide.role}
        </p>
      </div>

      <div className="min-w-0">
        <form action={saveSlideAction} className="space-y-[var(--sp-4)]">
          <input type="hidden" name="postId" value={postId} />
          <input type="hidden" name="slideId" value={slide.id} />
          <input type="hidden" name="expectedUpdatedAt" value={slide.updatedAt} />

          <h3 className="text-xs font-medium tracking-wide text-subtle uppercase">
            {labels.tabText}
          </h3>

          {fields.map((field) => (
            <Field
              key={`${field.key}-${field.meaning ?? ''}`}
              field={field}
              content={content}
              items={items}
              set={set}
              setItems={setItems}
              budgets={budgets}
              uploads={uploads}
              previewImage={previewImage}
              onPickFile={(url) => setPendingImage(url)}
              labels={labels}
            />
          ))}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">{labels.altText}</span>
            <textarea
              name="altText"
              rows={2}
              required
              maxLength={1000}
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              className="field w-full"
            />
            <span className="mt-1 block text-xs text-subtle">{labels.altTextHint}</span>
          </label>

          <div className="flex flex-wrap items-center gap-[var(--sp-4)]">
            <ActionButton idle={labels.save} busy={labels.saving} className="btn" />
            <Link href={`/posts/${postId}#slide-${slide.index + 1}`} className="btn btn-ghost">
              {labels.cancel}
            </Link>
          </div>
        </form>

        {layoutOptions.length > 0 ? (
          <form
            action={saveSlideLayoutAction}
            className="mt-[var(--sp-5)] border-t border-rule pt-[var(--sp-5)]"
          >
            <input type="hidden" name="postId" value={postId} />
            <input type="hidden" name="slideId" value={slide.id} />

            <h3 className="mb-[var(--sp-4)] text-xs font-medium tracking-wide text-subtle uppercase">
              {labels.tabLook}
            </h3>

            <div className="flex flex-wrap items-end gap-[var(--sp-4)]">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-muted">{labels.layout}</span>
                <select
                  name="templateId"
                  defaultValue={slide.templateId ?? ''}
                  className="field w-full"
                >
                  <option value="">{labels.layoutInherit}</option>
                  {layoutOptions.map((id) => (
                    <option key={id} value={id}>
                      {labels.layouts[id] ?? id}
                    </option>
                  ))}
                </select>
              </label>
              <ActionButton
                idle={labels.apply}
                busy={labels.applying}
                className="btn btn-ghost shrink-0"
              />
            </div>
          </form>
        ) : (
          <p className="mt-[var(--sp-5)] border-t border-rule pt-[var(--sp-5)] text-xs text-subtle">
            {labels.layoutFixed}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Move a split slide's copy into the two panels before showing it.
 *
 * `SplitBody` renders `items[0] ?? body`, so the pipeline may legitimately have
 * written the top panel's text into `body`. Without this, the panels would open
 * empty, the person would see their text in the preview but not in the form, and
 * saving would drop it — content loss caused by opening an editor and pressing
 * Save. The panels are the one source of truth from here on, which is also why
 * saving writes `items` and lets `body` go.
 */
function seedContent(content: SlideContent, fields: ContentField[]): SlideContent {
  if (!fields.some((field) => field.kind === 'pair')) return content

  const items = Array.isArray(content.items) ? content.items : []
  if (items.length > 0 || typeof content.body !== 'string' || !content.body) return content

  const { body, ...rest } = content
  return { ...rest, items: [body] }
}

/** One labelled input, or the small cluster that `items` and pictures need. */
function Field({
  field,
  content,
  items,
  set,
  setItems,
  budgets,
  uploads,
  previewImage,
  onPickFile,
  labels,
}: {
  field: ContentField
  content: SlideContent
  items: string[]
  set: (key: string, value: unknown) => void
  setItems: (next: string[]) => void
  budgets: { headline?: number; body?: number }
  uploads: UploadOption[]
  previewImage: string | undefined
  onPickFile: (url: string) => void
  labels: EditLabels
}) {
  if (field.kind === 'image') {
    return (
      <fieldset className="space-y-[var(--sp-3)]">
        <legend className="mb-1 text-xs font-medium text-muted">{labels.picture}</legend>

        <input
          type="file"
          name="picture"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/tiff"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onPickFile(URL.createObjectURL(file))
          }}
          className="field w-full"
        />

        {uploads.length > 0 && (
          <>
            <span className="block text-xs text-subtle">{labels.pictureRecent}</span>
            <div className="flex flex-wrap gap-[var(--sp-3)]">
              <label className="choice-tile cursor-pointer">
                <input
                  type="radio"
                  name="imageAssetId"
                  value=""
                  defaultChecked={!content.imageAssetId}
                  onChange={() => set('imageAssetId', undefined)}
                  className="peer sr-only"
                />
                <span className="flex h-14 w-14 items-center justify-center rounded border border-rule text-xs text-subtle peer-checked:border-accent peer-checked:text-accent">
                  {labels.pictureNone}
                </span>
              </label>

              {uploads.map((upload, position) => (
                <label key={upload.id} className="choice-tile cursor-pointer">
                  <input
                    type="radio"
                    name="imageAssetId"
                    value={upload.id}
                    defaultChecked={content.imageAssetId === upload.id}
                    onChange={() => set('imageAssetId', upload.id)}
                    // The image below carries `alt=""`, correctly — these are
                    // decorative thumbnails of one another. That left the radio
                    // with no accessible name at all, so every option announced
                    // as unlabelled. There is nothing meaningful to say about a
                    // photograph we have never seen, so the label is positional,
                    // which is at least distinguishable.
                    aria-label={labels.pictureOption.replace('{n}', String(position + 1))}
                    className="peer sr-only"
                  />
                  {/* Not next/image: the runtime container deletes Next's sharp,
                      and apps/web/lib/__tests__/no-next-image.test.ts keeps it
                      that way. These are already small and content-hashed. */}
                  <img
                    src={`/assets/${upload.path}`}
                    alt=""
                    className="h-14 w-14 rounded border border-rule object-cover peer-checked:border-accent peer-checked:ring-2 peer-checked:ring-accent"
                  />
                </label>
              ))}
            </div>
          </>
        )}

        {previewImage && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" name="removePicture" value="1" />
            {labels.pictureRemove}
          </label>
        )}

        <span className="block text-xs text-subtle">{labels.pictureHint}</span>
      </fieldset>
    )
  }

  if (field.kind === 'pair') {
    return (
      <div className="space-y-[var(--sp-4)]">
        {[labels.panelTop, labels.panelBottom].map((label, position) => (
          <label key={label} className="block">
            <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
            <textarea
              name="items"
              rows={2}
              value={items[position] ?? ''}
              onChange={(event) => {
                // Both panels always post, so the empty one keeps its position
                // rather than shifting the other panel up into it.
                const next = [items[0] ?? '', items[1] ?? '']
                next[position] = event.target.value
                setItems(next)
              }}
              className="field w-full"
            />
          </label>
        ))}
      </div>
    )
  }

  if (field.kind === 'list') {
    return (
      <fieldset className="space-y-[var(--sp-3)]">
        <legend className="mb-1 text-xs font-medium text-muted">{labels.items}</legend>
        {[...items, ''].map((item, position) => (
          <div key={position} className="flex gap-2">
            <input
              name="items"
              value={item}
              maxLength={300}
              placeholder={position === items.length ? labels.addLine : undefined}
              onChange={(event) => {
                const next = [...items]
                next[position] = event.target.value
                setItems(next.filter((line, i) => line !== '' || i < items.length))
              }}
              className="field min-w-0 flex-1"
            />
          </div>
        ))}
      </fieldset>
    )
  }

  const label = labelFor(field, labels)
  const budget = field.key === 'headline' ? budgets.headline : field.key === 'body' ? budgets.body : undefined
  const value = typeof content[field.key] === 'string' ? (content[field.key] as string) : ''

  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {budget ? (
          /* The niche's soft budget, shown rather than enforced: the renderer
             shrinks type to fit, so going over costs a smaller headline, not a
             broken slide. Over budget is worth seeing, not worth blocking. */
          <span className={`text-xs ${value.length > budget ? 'text-warn' : 'text-subtle'}`}>
            {value.length} / {budget}
          </span>
        ) : null}
      </span>
      {field.kind === 'paragraph' ? (
        <textarea
          name={field.key}
          rows={4}
          maxLength={2000}
          value={value}
          onChange={(event) => set(field.key, event.target.value)}
          className="field w-full"
        />
      ) : (
        <input
          name={field.key}
          maxLength={300}
          value={value}
          onChange={(event) => set(field.key, event.target.value)}
          className="field w-full"
        />
      )}
    </label>
  )
}

/**
 * `figure` is the position badge on a numbered slide and the date on a timeline.
 * One label for both would be wrong in one of the two places, which is why the
 * fields map carries a `meaning` and the wording lives in the catalogue.
 */
function labelFor(field: ContentField, labels: EditLabels): string {
  switch (field.key) {
    case 'headline':
      return labels.headline
    case 'body':
      return labels.body
    case 'kicker':
      return labels.kicker
    case 'footnote':
      return labels.footnote
    case 'figureLabel':
      return labels.figureLabel
    case 'figure':
      if (field.meaning === 'badge') return labels.figureBadge
      if (field.meaning === 'date') return labels.figureDate
      return labels.figure
    default:
      return labels.items
  }
}
