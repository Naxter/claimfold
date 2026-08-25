'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * The navigation rail as a drawer, below 768px.
 *
 * This component owns nothing visual except the trigger and the scrim. The
 * panel itself is the same `<aside>` the wide layout renders; all this does is
 * put `data-nav="open"` on `<html>`, and the stylesheet decides what that means
 * at the current width. Keeping the markup single-source is the reason a link
 * added to the rail cannot go missing on phones.
 *
 * What it has to get right is the parts CSS cannot reach:
 *
 * - **Escape closes it.** A panel that covers the screen and can only be
 *   dismissed by aiming at the 40% of it that is scrim is a trap on a phone.
 * - **Navigating closes it.** Otherwise every tap leaves the drawer sitting
 *   over the page it just loaded.
 * - **The content behind goes `inert`.** That is what stops Tab walking out of
 *   the open drawer and into a page nobody can see. `inert` rather than a
 *   hand-written focus trap: the browser already implements this correctly,
 *   including for screen-reader virtual cursors, which a key handler does not.
 * - **Focus moves in and comes back.** Opening moves focus into the panel;
 *   closing returns it to the trigger, so the keyboard does not lose its place.
 */
export function NavDrawer({
  openLabel,
  closeLabel,
  /** id of the element to make inert while the drawer is open. */
  contentId,
}: {
  openLabel: string
  closeLabel: string
  contentId: string
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const [lastPath, setLastPath] = useState(pathname)
  const triggerRef = useRef<HTMLButtonElement>(null)
  /** So the close branch can tell a real dismissal from the first render. */
  const wasOpen = useRef(false)

  // Close on navigation, adjusted during render rather than in an effect.
  // Keyed on the path rather than on the click, because a link inside the
  // drawer, the command palette and the browser's own Back button all have to
  // end the same way — and an effect would paint the new page with the drawer
  // still over it for one frame before closing it.
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    const root = document.documentElement
    const content = document.getElementById(contentId)

    if (open) {
      root.dataset['nav'] = 'open'
      content?.setAttribute('inert', '')
      // The first link in the rail, not the panel itself: landing on a
      // container announces nothing and needs an extra key press to get going.
      document.querySelector<HTMLElement>('.shell-rail a, .shell-rail button')?.focus()
      wasOpen.current = true
      return
    }

    delete root.dataset['nav']
    content?.removeAttribute('inert')

    /*
      Focus is restored here and not in the Escape handler, which is where it
      was and where it silently did nothing.

      The trigger sits in the top bar — inside the content column — and that
      column is `inert` while the drawer is open. Calling `.focus()` on an
      element in an inert subtree is a no-op, so closing with Escape dropped
      focus onto `<body>` and a keyboard user restarted from the top of the
      page. Only after `inert` is gone can the trigger take focus.

      Guarded on `wasOpen` so a fresh page load, which also runs this branch,
      does not yank focus to the menu button.
    */
    if (wasOpen.current) {
      triggerRef.current?.focus()
      wasOpen.current = false
    }

    return () => {
      delete root.dataset['nav']
      content?.removeAttribute('inert')
    }
  }, [open, contentId])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-label={openLabel}
        className="btn btn-quiet nav-trigger h-[var(--control-h)] w-[var(--control-h)] shrink-0 px-0"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
          <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.3" />
          <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.3" />
          <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>

      {open && (
        <button
          type="button"
          className="nav-scrim"
          onClick={() => setOpen(false)}
        >
          <span className="visually-hidden">{closeLabel}</span>
        </button>
      )}
    </>
  )
}
