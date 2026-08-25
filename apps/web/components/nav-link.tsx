'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * A sidebar entry that knows whether it is the current section.
 *
 * Marked three ways on purpose, because one is never enough:
 *
 * - `aria-current="page"`, which is what a screen reader announces.
 * - A filled background and full-strength text, so it reads as selected.
 * - A bar down the leading edge, which is the only one of the three that
 *   survives the sidebar being collapsed to icons.
 *
 * Colour alone would have been the easy version and the wrong one — it is the
 * signal that disappears for anyone who cannot separate the accent from the
 * surrounding grey.
 */
export function NavLink({
  href,
  label,
  icon,
  owns,
}: {
  href: string
  label: string
  icon: ReactNode
  /**
   * Path prefixes this entry answers for, beyond its own href.
   *
   * Declared rather than derived, because deriving it from the href alone was
   * wrong in both directions. `/posts/abc` matched no entry, so reviewing a
   * post left the whole rail unmarked — the one screen where knowing where you
   * are matters most. And a bare `startsWith` would let `/topics` claim a
   * future `/topics-archive`, which is why the match below is on a segment
   * boundary rather than on characters.
   */
  owns?: string[]
}) {
  const pathname = usePathname()

  const active = [href, ...(owns ?? [])].some((path) =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`),
  )

  return (
    <Link
      href={href}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center gap-3 rounded-[var(--radius-1)] px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-selected text-fg font-medium'
          : 'text-muted hover:bg-hover hover:text-fg'
      }`}
    >
      {active && (
        <span
          aria-hidden="true"
          className="bg-accent absolute inset-y-1 left-0 w-[2px] rounded-full"
        />
      )}
      <span className={active ? 'text-accent shrink-0' : 'text-subtle shrink-0'}>{icon}</span>
      <span className="sidebar-label truncate">{label}</span>
    </Link>
  )
}
