'use client'

import { useState } from 'react'

import { SIDEBAR_COOKIE } from '../lib/preferences.ts'

/**
 * Collapse the sidebar to icons.
 *
 * Toggles one attribute on `<html>`; the width, the labels and the tooltips
 * all follow from `--sidebar-w` in the stylesheet. Written to a cookie so the
 * server renders the same state on the next navigation — a sidebar that
 * re-expands on every page load is worse than one that never collapses.
 */
export function SidebarToggle({
  collapsed: initial,
  collapseLabel,
  expandLabel,
}: {
  collapsed: boolean
  collapseLabel: string
  expandLabel: string
}) {
  const [collapsed, setCollapsed] = useState(initial)

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=${
      365 * 24 * 60 * 60
    }; samesite=lax`

    const root = document.documentElement
    if (next) root.dataset['sidebar'] = 'collapsed'
    else root.removeAttribute('data-sidebar')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!collapsed}
      title={collapsed ? expandLabel : collapseLabel}
      /* Square on `--control-h`, not on a literal 28px. The density setting
         moves every other control to 28/32/36 and this one stayed behind, so
         at spacious density it sat visibly smaller than the search button
         beside it. */
      className="btn btn-quiet h-[var(--control-h)] w-[var(--control-h)] shrink-0 px-0"
    >
      <span className="visually-hidden">{collapsed ? expandLabel : collapseLabel}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
        <rect
          x="1.75"
          y="2.75"
          width="12.5"
          height="10.5"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <line x1="6.25" y1="2.75" x2="6.25" y2="13.25" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </button>
  )
}
