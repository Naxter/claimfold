'use client'

import { useEffect, useRef, useState } from 'react'

import { CANVAS } from '@claimfold/templates'
import type { SlideContent } from '@claimfold/db'

import { SlidePreview } from './slide-preview.tsx'

/**
 * A slide preview that is not built until someone can see it.
 *
 * The review page rendered a full `SlidePreview` for every slide — each one the
 * complete template tree at 1080×1350, scaled down with a CSS transform. For an
 * eight-slide carousel that is eight full DOM trees: measured at 562 KB of HTML
 * and roughly 430 ms of server render time, on a page whose first job is to show
 * a reviewer the gate verdict. Most of those slides are below the fold.
 *
 * The fidelity is not negotiable — `slide-preview.tsx` explains why the preview
 * lays out at full size and scales: a headline that wraps to three lines in the
 * published JPEG must wrap to three lines here, or the reviewer is approving
 * something they have not seen. So this does not make previews cheaper; it makes
 * them *later*, and only for slides nobody has scrolled to.
 *
 * **It takes props, not `children`.** That is the whole design. Handing a
 * server-rendered `<SlidePreview>` to a client component as `children` would
 * still render it on the server and serialise it into the RSC payload — the
 * work and the bytes would both remain, and only the appearance of laziness
 * would be gained. Passing the slide's plain data instead means the tree is
 * built in the browser, on demand, and the server sends a few hundred bytes of
 * JSON for it.
 *
 * `SlidePreview` is already in the client bundle — `slide-editor.tsx` and
 * `appearance-panel.tsx` both import it — so this adds no new code to download.
 */
export function DeferredPreview(props: {
  templateId: string
  themeId: string
  accentColor?: string | null
  role: string
  content: SlideContent
  page: number
  total: number
  watermark?: string
  lang?: string
  imageSrc?: string
  width?: number
}) {
  const width = props.width ?? 260
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    /*
      No IntersectionObserver — an old browser, or a test environment — means
      render immediately. Degrading to "never shows the slides" would be a
      correctness bug wearing an optimisation's clothes.

      Scheduled rather than set inline: a synchronous setState in an effect body
      is a cascading render, which is what `react-hooks/set-state-in-effect`
      exists to catch. A tick's delay costs nothing on a path that only runs
      where the observer is missing.
    */
    if (typeof IntersectionObserver === 'undefined') {
      const timer = setTimeout(() => setVisible(true), 0)
      return () => clearTimeout(timer)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      // Start building roughly one screen early, so scrolling stays smooth and
      // the placeholder is not something people normally see.
      { rootMargin: '600px 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // The exact final height, so nothing shifts when the real preview arrives.
  // Reserving the wrong height would trade a wait for a layout jump, which is
  // the worse of the two.
  const height = Math.round((width * CANVAS.height) / CANVAS.width)

  return (
    <div ref={ref} style={{ width, minHeight: height }}>
      {visible ? (
        <SlidePreview {...props} width={width} />
      ) : (
        <span className="skeleton block w-full" style={{ height }} aria-hidden />
      )}
    </div>
  )
}
