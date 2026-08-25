'use client'

import { useState } from 'react'

import type { SlideContent } from '@claimfold/db'
import { THEMES, checkAccent, getTheme } from '@claimfold/templates'

import { saveAppearanceAction } from '../app/posts/[id]/actions.ts'
import type { Messages } from '../lib/i18n/messages/en.ts'
import { ActionButton } from './action-button.tsx'
import { SlidePreview } from './slide-preview.tsx'

/**
 * How every slide in the post looks.
 *
 * Three controls that were all already built and none of which had a switch: the
 * theme has been a column since the first migration, the renderer has accepted a
 * watermark from the beginning, and the accent is one colour swapped into a
 * theme. What was missing was this panel.
 *
 * Each theme is previewed as this post's own first slide rather than as a
 * swatch. That is free — the preview is the same component the publish pipeline
 * screenshots — and a swatch cannot tell you that Bold sets headlines in upper
 * case while Paper does not.
 *
 * The contrast reading next to the colour field is the same calculation the
 * server refuses the save with. Showing it live means someone picking a brand
 * colour finds out here, while they are looking at the slide, instead of after a
 * round trip that throws their choice away.
 */
export function AppearancePanel({
  postId,
  themeId,
  accentColor,
  watermark,
  sample,
  labels,
}: {
  postId: string
  themeId: string
  accentColor: string | null
  watermark: string
  /** This post's first slide, so the previews show real copy. */
  sample: {
    templateId: string
    role: string
    content: SlideContent
    total: number
    lang: string
    imageSrc?: string
  }
  labels: Messages['review']['edit']
}) {
  const [theme, setTheme] = useState(themeId)
  const [accent, setAccent] = useState(accentColor ?? '')
  const [mark, setMark] = useState(watermark)

  const verdict = accent.trim() ? checkAccent(getTheme(theme), accent.trim()) : { ok: true as const }

  return (
    <form
      action={saveAppearanceAction}
      className="mb-[var(--sp-6)] rounded-[var(--radius-2)] border border-rule bg-raised p-[var(--sp-5)]"
    >
      <input type="hidden" name="postId" value={postId} />

      <h3 className="mb-[var(--sp-4)] text-xs font-medium tracking-wide text-subtle uppercase">
        {labels.appearance}
      </h3>

      <div className="mb-[var(--sp-5)] flex flex-wrap gap-[var(--sp-4)]">
        {THEMES.map((option) => (
          <label key={option.id} className="choice-tile cursor-pointer">
            <input
              type="radio"
              name="themeId"
              value={option.id}
              checked={theme === option.id}
              onChange={() => setTheme(option.id)}
              /*
                The label's content is an entire rendered slide, so without this
                each option announced the whole sample carousel's copy before
                getting to the theme's name. `aria-label` overrides that with
                the only part that identifies the choice.
              */
              aria-label={option.name}
              className="peer sr-only"
            />
            {/* `aria-hidden`: the preview is a picture of the choice, and it
                has already been announced by name above. */}
            <span
              aria-hidden
              className="block rounded-[var(--radius-2)] border-2 border-transparent p-1 peer-checked:border-accent"
            >
              <SlidePreview
                templateId={sample.templateId}
                themeId={option.id}
                accentColor={accent.trim() && verdict.ok ? accent.trim() : null}
                role={sample.role}
                content={sample.content}
                page={1}
                total={sample.total}
                watermark={mark || undefined}
                lang={sample.lang}
                imageSrc={sample.imageSrc}
                width={132}
              />
              <span className="mt-1 block text-center text-xs text-muted">{option.name}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-[var(--sp-4)]">
        <label className="min-w-0 basis-48">
          <span className="mb-1 block text-xs font-medium text-muted">{labels.accent}</span>
          <input
            name="accentColor"
            value={accent}
            onChange={(event) => setAccent(event.target.value)}
            placeholder={getTheme(theme).colors.accent}
            className="field w-full"
          />
          <span
            className={`mt-1 block text-xs ${verdict.ok ? 'text-subtle' : 'text-warn'}`}
            /* Announced because it is the one field where the value being
               rejected is not visible in the field itself. */
            aria-live="polite"
          >
            {verdict.ok
              ? labels.accentHint
              : verdict.reason === 'unparseable'
                ? '#B4472B'
                : `${verdict.ratio.toFixed(1)}:1 · ${verdict.floor.toFixed(1)}:1`}
          </span>
        </label>

        <label className="min-w-0 basis-48">
          <span className="mb-1 block text-xs font-medium text-muted">{labels.watermark}</span>
          <input
            name="watermark"
            value={mark}
            maxLength={40}
            onChange={(event) => setMark(event.target.value)}
            className="field w-full"
          />
          <span className="mt-1 block text-xs text-subtle">{labels.watermarkHint}</span>
        </label>

        <ActionButton
          idle={labels.apply}
          busy={labels.applying}
          disabled={!verdict.ok}
          className="btn btn-ghost shrink-0"
        />
      </div>
    </form>
  )
}
