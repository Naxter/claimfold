import { CANVAS, SlideView, applyAccent, getTheme } from '@claimfold/templates'
import type { SlideContent } from '@claimfold/db'

/**
 * Live slide preview.
 *
 * Renders the SAME React components the publish pipeline screenshots, at full
 * 1080×1350, then scales the result with a CSS transform. Scaling rather than
 * re-laying-out at a smaller size is the point: type sizes, line breaks and
 * spacing stay proportionally identical, so what a reviewer approves is what
 * gets published.
 *
 * The one thing it cannot reproduce is the browser-side auto-fit pass, which
 * runs during rendering. Copy near a budget limit may therefore look slightly
 * larger here than in the final JPEG — never smaller, so nothing is hidden.
 */
export function SlidePreview({
  templateId,
  themeId,
  accentColor,
  role,
  content,
  page,
  total,
  watermark,
  lang,
  imageSrc,
  width = 260,
  showSafeZone = false,
}: {
  templateId: string
  themeId: string
  /** Channel accent override. Must be the same one the renderer will use. */
  accentColor?: string | null
  role: string
  content: SlideContent
  page: number
  total: number
  watermark?: string
  lang?: string
  /**
   * Where to load `content.imageAssetId` from — here, a URL on this origin.
   *
   * The renderer inlines the same bytes as a `data:` URI instead, because the
   * render browser makes no network requests. Same pixels, two routes, and this
   * is the seam: a preview that pointed at a URL the renderer could not reach
   * would be the one divergence this component exists to avoid.
   */
  imageSrc?: string
  /** Rendered width in CSS pixels; height follows the 4:5 ratio. */
  width?: number
  showSafeZone?: boolean
}) {
  const scale = width / CANVAS.width
  const theme = applyAccent(getTheme(themeId), accentColor)

  return (
    <div
      className="overflow-hidden rounded-md border border-rule bg-raised"
      style={{ width, height: CANVAS.height * scale }}
      // Language belongs on the wrapper too: hyphenation in the preview must
      // match the render, or line breaks differ between what is reviewed and
      // what is published.
      lang={lang}
    >
      <div className="slide-scale" style={{ transform: `scale(${scale})` }}>
        <SlideView
          templateId={templateId}
          theme={theme}
          role={role}
          content={content}
          page={page}
          total={total}
          watermark={watermark}
          imageSrc={imageSrc}
          showSafeZone={showSafeZone}
        />
      </div>
    </div>
  )
}
