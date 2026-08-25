/** @jsxImportSource react */
import type { SlideContent } from '@claimfold/db'

import { fontStack } from './font-stack.ts'
import { AutoFit, Kicker, Rule, Slide, Spacer } from './layout.tsx'
import { CANVAS, TYPE, type Theme } from './themes.ts'

/**
 * The five template families.
 *
 * Structural note: the hook, sources and CTA slides are rendered the SAME way
 * across every family, while the body slides differ. That is deliberate —
 * carousels read as a set, and varying the opening and closing slides makes a
 * feed look incoherent, while varying the middle keeps it from looking
 * templated. Consistency where the eye lands first, variety where attention
 * has already been earned.
 */

export interface SlideRenderProps {
  theme: Theme
  /** Role id from the niche's format definition. */
  role: string
  content: SlideContent
  page: number
  total: number
  watermark?: string
  showSafeZone?: boolean
  /**
   * Already-resolved source for `content.imageAssetId`.
   *
   * The slide stores an asset id; turning that into something an `<img>` can
   * load is the caller's job, and the two callers deliberately do it
   * differently. The renderer inlines the bytes as a `data:` URI, because the
   * render browser makes no network requests at all. The dashboard preview
   * points at `/assets/…` on its own origin, because inlining half a megabyte
   * per slide into a page with ten previews would be silly. Same pixels, two
   * routes — and this prop is where that seam lives, rather than inside the
   * template where it would be invisible.
   */
  imageSrc?: string
}

const headingCase = (theme: Theme, text: string) =>
  theme.headingCase === 'upper' ? text.toUpperCase() : text

/* ─── Shared slides ──────────────────────────────────────────────────────── */

function HookSlide({ theme, content, ...rest }: SlideRenderProps) {
  return (
    <Slide theme={theme} {...rest}>
      {content.kicker ? <Kicker theme={theme}>{content.kicker}</Kicker> : null}
      <Spacer />
      <AutoFit scale="hook" theme={theme} display>
        {headingCase(theme, content.headline ?? '')}
      </AutoFit>
      {content.body ? (
        <>
          <Rule theme={theme} />
          <AutoFit scale="body" theme={theme} color={theme.colors.muted} maxSize={38}>
            {content.body}
          </AutoFit>
        </>
      ) : null}
      <Spacer />
    </Slide>
  )
}

function SourcesSlide({ theme, content, ...rest }: SlideRenderProps) {
  const items = content.items ?? []
  return (
    <Slide theme={theme} {...rest}>
      <Kicker theme={theme}>{content.kicker ?? 'Sources'}</Kicker>
      <AutoFit scale="heading" theme={theme} display maxSize={56}>
        {headingCase(theme, content.headline ?? 'Where this comes from')}
      </AutoFit>
      <Rule theme={theme} />
      {/*
        Centred in the remaining space rather than top-aligned. A sources slide
        usually carries three or four short lines, and pinning them to the top
        leaves a dead void down the middle that reads as an unfinished slide —
        the one place a carousel most needs to look deliberate, since it is the
        slide that makes the whole post checkable.
      */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 26,
        }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 20,
              alignItems: 'baseline',
              fontSize: 33,
              lineHeight: 1.32,
              color: theme.colors.text,
            }}
          >
            <span
              style={{
                fontFamily: fontStack(theme.fonts.mono ?? theme.fonts.body),
                fontSize: 24,
                color: theme.colors.accent,
                flexShrink: 0,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span>{item}</span>
          </div>
        ))}
      </div>
      {content.footnote ? (
        <div
          style={{
            fontSize: 24,
            color: theme.colors.muted,
            lineHeight: 1.4,
            borderTop: `2px solid ${theme.colors.rule}`,
            paddingTop: 22,
          }}
        >
          {content.footnote}
        </div>
      ) : null}
    </Slide>
  )
}

function CtaSlide({ theme, content, ...rest }: SlideRenderProps) {
  return (
    <Slide theme={theme} {...rest}>
      <Spacer />
      <div style={{ textAlign: 'center' }}>
        <AutoFit scale="heading" theme={theme} display align="center" maxSize={64}>
          {headingCase(theme, content.headline ?? '')}
        </AutoFit>
        {content.body ? (
          <div style={{ marginTop: 32 }}>
            <AutoFit
              scale="body"
              theme={theme}
              align="center"
              color={theme.colors.muted}
              maxSize={36}
            >
              {content.body}
            </AutoFit>
          </div>
        ) : null}
      </div>
      <Spacer />
    </Slide>
  )
}

/* ─── Body slides, per family ────────────────────────────────────────────── */

/** Editorial: one idea, lots of air. The default for explanatory content. */
function EditorialBody({ theme, content, ...rest }: SlideRenderProps) {
  return (
    <Slide theme={theme} {...rest}>
      {content.kicker ? <Kicker theme={theme}>{content.kicker}</Kicker> : null}
      {/*
        Centred as a block rather than pinned to the top. Body length varies
        enormously between slides, and top-alignment leaves a dead void under
        the short ones that reads as a layout bug rather than as whitespace.
      */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <AutoFit scale="heading" theme={theme} display>
          {headingCase(theme, content.headline ?? '')}
        </AutoFit>
        <Rule theme={theme} />
        <AutoFit scale="body" theme={theme}>
          {content.body}
        </AutoFit>
      </div>
      {content.footnote ? (
        <div
          style={{
            fontSize: 24,
            color: theme.colors.muted,
            borderTop: `2px solid ${theme.colors.rule}`,
            paddingTop: 20,
          }}
        >
          {content.footnote}
        </div>
      ) : null}
    </Slide>
  )
}

/**
 * Split: two stacked panels. Carries any A-versus-B relationship — a belief and
 * its correction, two options compared, before and after. The lower panel is
 * tinted so the contrast is legible at thumbnail size.
 */
function SplitBody({ theme, content, ...rest }: SlideRenderProps) {
  const [top, bottom] = [content.items?.[0] ?? content.body ?? '', content.items?.[1] ?? '']

  return (
    <Slide theme={theme} {...rest}>
      {content.kicker ? <Kicker theme={theme}>{content.kicker}</Kicker> : null}
      <AutoFit scale="heading" theme={theme} display maxSize={62}>
        {headingCase(theme, content.headline ?? '')}
      </AutoFit>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          marginTop: 36,
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            // `1 1 auto`, not `1` (= `1 1 0`): flex-basis becomes the panel's
            // own content height, so a two-line belief and a five-line
            // correction size in proportion instead of both being forced to
            // half the slide. Spare space is still shared, so the pair stays
            // balanced without either panel reading as half-empty.
            flex: '1 1 auto',
            minHeight: 0,
            padding: 36,
            borderRadius: 20,
            border: `3px solid ${theme.colors.rule}`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <AutoFit scale="body" theme={theme} maxSize={40}>
            {top}
          </AutoFit>
        </div>

        {bottom ? (
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              padding: 36,
              borderRadius: 20,
              background: theme.colors.accent,
              color: theme.colors.onAccent,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <AutoFit scale="body" theme={theme} color={theme.colors.onAccent} maxSize={40}>
              {bottom}
            </AutoFit>
          </div>
        ) : null}
      </div>

      {content.footnote ? (
        <div style={{ fontSize: 24, color: theme.colors.muted, marginTop: 24 }}>
          {content.footnote}
        </div>
      ) : null}
    </Slide>
  )
}

/** List: an indexed entry with a prominent position badge. */
function ListBody({ theme, content, ...rest }: SlideRenderProps) {
  const badge = content.figure ?? String(rest.page - 1)

  return (
    <Slide theme={theme} {...rest}>
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', minHeight: 0 }}>
        <div
          style={{
            fontFamily: fontStack(theme.fonts.display),
            fontSize: 108,
            lineHeight: 0.9,
            fontWeight: 700,
            color: theme.colors.accent,
            letterSpacing: '-0.04em',
            flexShrink: 0,
          }}
        >
          {badge}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AutoFit scale="heading" theme={theme} display maxSize={62}>
            {headingCase(theme, content.headline ?? '')}
          </AutoFit>
        </div>
      </div>

      <Rule theme={theme} />
      <AutoFit scale="body" theme={theme}>
        {content.body}
      </AutoFit>
      <Spacer />

      {content.items?.length ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            borderTop: `2px solid ${theme.colors.rule}`,
            paddingTop: 24,
          }}
        >
          {content.items.map((item, i) => (
            <div key={i} style={{ fontSize: 28, color: theme.colors.muted, lineHeight: 1.3 }}>
              {item}
            </div>
          ))}
        </div>
      ) : null}
    </Slide>
  )
}

/** Timeline: a dated moment on a rail, so the sequence is visible at a glance. */
function TimelineBody({ theme, content, ...rest }: SlideRenderProps) {
  return (
    <Slide theme={theme} {...rest}>
      <div style={{ display: 'flex', gap: 32, flex: 1, minHeight: 0 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            flexShrink: 0,
            paddingTop: 12,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: theme.colors.accent,
              flexShrink: 0,
            }}
          />
          <div style={{ width: 4, flex: 1, background: theme.colors.rule, marginTop: 12 }} />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontFamily: fontStack(theme.fonts.mono ?? theme.fonts.body),
              fontSize: 34,
              letterSpacing: '0.06em',
              color: theme.colors.accent,
              marginBottom: 18,
            }}
          >
            {content.figure ?? content.kicker ?? ''}
          </div>

          <AutoFit scale="heading" theme={theme} display maxSize={62}>
            {headingCase(theme, content.headline ?? '')}
          </AutoFit>

          <div style={{ marginTop: 28, minHeight: 0 }}>
            <AutoFit scale="body" theme={theme}>
              {content.body}
            </AutoFit>
          </div>
          <Spacer />
        </div>
      </div>
    </Slide>
  )
}

/** Figure: one number, sized to dominate. The highest stop-rate layout. */
function FigureBody({ theme, content, ...rest }: SlideRenderProps) {
  const isReveal = Boolean(content.figure)

  if (!isReveal) return <EditorialBody theme={theme} content={content} {...rest} />

  return (
    <Slide theme={theme} {...rest}>
      <Spacer />
      <div style={{ textAlign: 'center' }}>
        <div
          data-autofit=""
          data-autofit-min={TYPE.figure.min}
          data-autofit-max={TYPE.figure.max}
          style={{
            fontFamily: fontStack(theme.fonts.display),
            fontSize: TYPE.figure.max,
            fontWeight: TYPE.figure.weight,
            lineHeight: TYPE.figure.lineHeight,
            letterSpacing: TYPE.figure.tracking,
            color: theme.colors.accent,
            whiteSpace: 'nowrap',
          }}
        >
          {content.figure}
        </div>
        {content.figureLabel ? (
          <div
            style={{
              marginTop: 28,
              fontFamily: fontStack(theme.fonts.mono ?? theme.fonts.body),
              fontSize: 30,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: theme.colors.muted,
            }}
          >
            {content.figureLabel}
          </div>
        ) : null}
      </div>

      {content.headline ? (
        <div style={{ marginTop: 56, textAlign: 'center' }}>
          <AutoFit scale="heading" theme={theme} display align="center" maxSize={58}>
            {headingCase(theme, content.headline)}
          </AutoFit>
        </div>
      ) : null}

      {content.body ? (
        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <AutoFit scale="body" theme={theme} align="center" maxSize={36}>
            {content.body}
          </AutoFit>
        </div>
      ) : null}
      <Spacer />
    </Slide>
  )
}

/**
 * Photo: a picture behind the copy.
 *
 * The scrim is not styling, it is the legibility control. Every other
 * foreground/background pair in this product is a known colour pair that can be
 * measured against WCAG AA before it ships — a photograph cannot be, because
 * its brightness varies across the frame and nobody is going to sample it. So
 * text never sits on the image directly: it sits on a wash of the theme's own
 * background colour, which is the pair that was already verified.
 *
 * Falls back to the editorial layout with no image, mirroring `FigureBody`. A
 * slide that has lost its picture should still read as a slide.
 */
function PhotoBody({ theme, content, imageSrc, ...rest }: SlideRenderProps) {
  if (!imageSrc) return <EditorialBody theme={theme} content={content} {...rest} />

  return (
    <Slide theme={theme} {...rest}>
      <img
        src={imageSrc}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: CANVAS.width,
          height: CANVAS.height,
          maxWidth: 'none',
          objectFit: 'cover',
        }}
      />
      {/*
        Bottom-weighted rather than flat. A flat wash heavy enough to carry text
        at the bottom also flattens the whole picture, so there is no point
        having chosen one; a gradient keeps the top of the frame legible as an
        image and the bottom legible as text. The last stop is opaque, which is
        what guarantees the copy sits on the measured pair rather than on
        whatever the photograph happens to be doing there.
      */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to bottom, transparent 0%, ${theme.colors.background}66 38%, ${theme.colors.background} 78%)`,
        }}
      />

      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
      >
        {content.kicker ? <Kicker theme={theme}>{content.kicker}</Kicker> : null}
        <AutoFit scale="heading" theme={theme} display maxSize={64}>
          {headingCase(theme, content.headline ?? '')}
        </AutoFit>
        {content.body ? (
          <>
            <Rule theme={theme} />
            <AutoFit scale="body" theme={theme} maxSize={38}>
              {content.body}
            </AutoFit>
          </>
        ) : null}
      </div>
    </Slide>
  )
}

/* ─── Dispatch ───────────────────────────────────────────────────────────── */

const BODY_TEMPLATES = {
  editorial: EditorialBody,
  split: SplitBody,
  list: ListBody,
  timeline: TimelineBody,
  figure: FigureBody,
  photo: PhotoBody,
} as const

export type TemplateId = keyof typeof BODY_TEMPLATES

export const TEMPLATE_IDS = Object.keys(BODY_TEMPLATES) as TemplateId[]

export function isTemplateId(id: string): id is TemplateId {
  return id in BODY_TEMPLATES
}

export interface RenderSlideProps extends SlideRenderProps {
  templateId: string
}

/**
 * Pick a layout for one slide.
 *
 * Role wins over template for hook/sources/cta, so those stay consistent across
 * a carousel no matter which family the format chose.
 */
export function SlideView({ templateId, ...props }: RenderSlideProps) {
  if (props.role === 'hook') return <HookSlide {...props} />
  if (props.role === 'sources') return <SourcesSlide {...props} />
  if (props.role === 'cta') return <CtaSlide {...props} />

  const Body = BODY_TEMPLATES[isTemplateId(templateId) ? templateId : 'editorial']
  return <Body {...props} />
}
