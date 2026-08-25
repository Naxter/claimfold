import Link from 'next/link'
import { LicenseBanner } from './license-banner.tsx'
import type { ReactNode } from 'react'

import { listUserWorkspaces } from '@claimfold/db'

import { APP_NAME } from '../lib/app-name.ts'
import { getMessages } from '../lib/i18n/index.ts'
import { getPreferences } from '../lib/preferences.server.ts'
import type { ActiveSession } from '../lib/session.ts'
import { CommandPalette, type PaletteItem } from './command-palette.tsx'
import { NavDrawer } from './nav-drawer.tsx'
import { NavLink } from './nav-link.tsx'
import { SidebarToggle } from './sidebar-toggle.tsx'
import { WorkspaceSwitcher } from './workspace-switcher.tsx'

/** The content column, made inert while the narrow-width drawer is open. */
const CONTENT_ID = 'shell-content'

/**
 * The application shell.
 *
 * A left rail and a thin top bar, which is the settled convention for this
 * kind of tool. That is the reason to use it: in product design familiarity is
 * a feature, and an inventive navigation costs every user a learning tax to
 * buy nothing. The invention budget belongs in the information hierarchy.
 *
 * The rail collapses to icons and the choice persists, because the people who
 * live in a tool all week want the pixels back.
 */

interface NavItem {
  href: string
  label: string
  icon: ReactNode
  /** Extra path prefixes this entry stays marked for. */
  owns?: string[]
}

export async function Shell({
  session,
  children,
  title,
  actions,
  /** Wide views (the board, tables) opt out of the reading-width container. */
  bleed = false,
}: {
  /**
   * `null` only from `loading.tsx`, where resolving the real session would put
   * a database round trip in front of the very thing that exists to appear
   * before one. The rail then shows a placeholder where the workspace goes.
   *
   * Deliberately the same component rather than a second shell built to match:
   * a copy drifts, and this one carries the nav, the palette and the collapse
   * behaviour that would have to be kept in step by hand.
   */
  session: ActiveSession | null
  children: ReactNode
  title?: string
  actions?: ReactNode
  bleed?: boolean
}) {
  const [t, prefs, workspaces] = await Promise.all([
    getMessages(),
    getPreferences(),
    session ? listUserWorkspaces(session.userId) : Promise.resolve([]),
  ])

  const items: NavItem[] = [
    // A post detail page belongs to the board — that is where you came from
    // and where Back returns you.
    { href: '/', label: t.nav.board, icon: <IconBoard />, owns: ['/posts'] },
    { href: '/topics', label: t.nav.topics, icon: <IconTopics /> },
    { href: '/generate', label: t.nav.generate, icon: <IconCreate /> },
    { href: '/niches', label: t.nav.niches, icon: <IconChannels /> },
    /*
      Unconditional, like every other entry.

      This was gated on `can(session, 'publish')`, which was wrong twice over.

      It flickered: `loading.tsx` renders this shell with `session={null}` on
      purpose, to keep the skeleton free of a database round trip. So during
      every route transition the capability check saw no session, the entry
      vanished, and it reappeared when the page resolved. It was the only
      conditional item in the rail, so it was the only one that blinked.

      And the reasoning behind the gate was false. The comment claimed a rail
      entry leading to a screen that refuses you is worse than none — but
      /members refuses nobody. It shows the roster to everyone and hides only
      the management controls, which is exactly the graceful degradation that
      makes a permanent nav entry correct.
    */
    { href: '/members', label: t.nav.members, icon: <IconMembers /> },
    // The wizard is settings with the reasoning attached, so it marks Settings
    // rather than leaving the rail blank for five screens.
    { href: '/settings', label: t.nav.settings, icon: <IconSettings />, owns: ['/setup'] },
  ]

  // The palette gets the same list the rail does, plus the destinations that
  // have no permanent nav entry because they are visited once.
  const paletteItems: PaletteItem[] = [
    ...items.map((item) => ({ href: item.href, label: item.label, group: t.palette.goTo })),
    { href: '/setup', label: t.palette.setupTitle, group: t.palette.goTo },
  ]

  return (
    <div className="shell min-h-screen">
      <a href="#main" className="skip-link">
        {t.appearance.skipToContent}
      </a>

      {/* ── Rail ───────────────────────────────────────────────────────
          One element, two behaviours. Wide: a grid column. Narrow: a drawer
          that slides over the content. See `.shell` in globals.css — the
          markup does not branch, so a nav item cannot exist on one and not
          the other. */}
      <aside className="shell-rail border-rule bg-raised flex h-screen flex-col border-r">
        <div className="border-rule flex h-[var(--topbar-h)] shrink-0 items-center gap-4 border-b px-5">
          <Link
            href="/"
            className="text-fg sidebar-label min-w-0 truncate text-sm font-semibold tracking-tight"
          >
            {APP_NAME}
          </Link>
          <div className="rail-collapse ml-auto">
            <SidebarToggle
              collapsed={prefs.sidebarCollapsed}
              collapseLabel={t.appearance.toggleSidebar}
              expandLabel={t.appearance.expandSidebar}
            />
          </div>
        </div>

        {/* Named for what the landmark IS, not for one of the things inside it.
            Labelling it with an item's own text made assistive tech announce
            the whole rail as "Board navigation". */}
        <nav className="flex-1 overflow-y-auto p-4" aria-label={t.nav.landmark}>
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  {...(item.owns ? { owns: item.owns } : {})}
                />
              </li>
            ))}
          </ul>
        </nav>

        {/* Which workspace you are acting as. Publishing to the wrong account
            is unrecoverable, so this must never require a click to discover —
            including when the rail is collapsed, which is exactly when it is
            easiest to forget. The name and address are hidden on collapse; the
            initial is not, and it carries the full name in its tooltip and in
            the accessibility tree. */}
        <div className="border-rule flex items-center gap-[var(--sp-5)] border-t p-[var(--sp-5)]">
          {session ? (
            <>
              <span
                title={`${session.orgName} — ${session.email}`}
                className="bg-accent-weak text-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-1)] text-xs font-semibold"
              >
                <span aria-hidden="true">
                  {session.orgName.trim().charAt(0).toUpperCase() || '?'}
                </span>
                <span className="visually-hidden">{session.orgName}</span>
              </span>
              <div className="sidebar-label min-w-0">
                <p className="text-fg truncate text-sm font-medium">{session.orgName}</p>
                <p className="text-subtle truncate text-xs">{session.email}</p>
                {workspaces.length > 1 && (
                  <WorkspaceSwitcher
                    workspaces={workspaces}
                    activeId={session.orgId}
                    labels={{
                      select: t.workspace.select,
                      failed: t.workspace.failed,
                    }}
                  />
                )}
              </div>
            </>
          ) : (
            /* Same box, same heights, so the rail does not resettle when the
               real name arrives. */
            <>
              <span className="skeleton h-7 w-7 shrink-0" />
              <div className="sidebar-label min-w-0 flex-1 space-y-1">
                <span className="skeleton block h-3 w-24" />
                <span className="skeleton block h-2.5 w-32" />
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div id={CONTENT_ID} className="flex min-w-0 flex-col">
        <header className="border-rule bg-raised sticky top-0 z-[var(--z-shell)] flex h-[var(--topbar-h)] shrink-0 items-center gap-[var(--sp-5)] border-b px-[var(--sp-6)] sm:px-7">
          <NavDrawer
            openLabel={t.appearance.openMenu}
            closeLabel={t.appearance.closeMenu}
            contentId={CONTENT_ID}
          />
          {title && <h1 className="truncate">{title}</h1>}
          <div className="ml-auto flex shrink-0 items-center gap-[var(--sp-5)]">
            <CommandPalette items={paletteItems} t={t.palette} />
            {actions}
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-[var(--sp-6)] py-[var(--sp-7)] sm:px-7">
          <div className={bleed ? '' : 'mx-auto w-full max-w-[76rem]'}>
            {/* Persistent, on every screen, and only when there is something to
                say. `.env.example` has promised an Ed25519-verified licence key
                since the first commit and nothing read it — so setting one did
                nothing and an expired one said nothing. Note that no feature is
                gated on the result: this reports, it does not restrict. */}
            <LicenseBanner t={t.license} />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  idea: 'bg-idle-weak text-muted',
  drafted: 'bg-idle-weak text-muted',
  // Neutral, not accent. The accent is the selection colour — it marks the
  // current nav item and the highlighted palette row — so painting a status
  // with it makes "this post reached the render step" look like "this row is
  // selected". Both are waiting states that no one acts on, which is what
  // `idle` already means; the badge text is what tells them apart.
  checked: 'bg-idle-weak text-muted',
  rendered: 'bg-idle-weak text-muted',
  review: 'bg-warn-weak text-warn',
  approved: 'bg-ok-weak text-ok',
  scheduled: 'bg-ok-weak text-ok',
  publishing: 'bg-ok-weak text-ok',
  published: 'bg-ok-weak text-ok',
  failed: 'bg-err-weak text-err',
  rejected: 'bg-err-weak text-err',
}

/**
 * The lifecycle badge.
 *
 * The stored status stays an English identifier — it is a database enum and a
 * contract between the web app and the worker. Only the label a person reads
 * is translated, and an unknown status shows the raw value rather than an
 * empty badge.
 *
 * Colour is never the only signal here: the word is always present, which is
 * what makes the badge readable to the roughly one man in twelve who cannot
 * separate two of these hues.
 */
export async function StatusBadge({ status }: { status: string }) {
  const t = await getMessages()

  return (
    <span className={`badge ${STATUS_STYLES[status] ?? 'bg-idle-weak text-muted'}`}>
      {t.status[status] ?? status}
    </span>
  )
}

/* ── Icons ────────────────────────────────────────────────────────────────
   Drawn inline rather than pulled from an icon package. Five icons do not
   justify a dependency, and a set drawn to one grid at one stroke weight sits
   better than a generic library at 16px. */

function icon(children: ReactNode) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      {children}
    </svg>
  )
}

/** Columns of cards — the board. */
function IconBoard() {
  return icon(
    <>
      <rect x="1.75" y="2.75" width="3.5" height="10.5" rx="1" />
      <rect x="6.25" y="2.75" width="3.5" height="6.5" rx="1" />
      <rect x="10.75" y="2.75" width="3.5" height="8.5" rx="1" />
    </>,
  )
}

/** A magnifier over a list — finding subjects. */
function IconTopics() {
  return icon(
    <>
      <circle cx="7" cy="7" r="4.25" />
      <line x1="10.2" y1="10.2" x2="13.5" y2="13.5" />
    </>,
  )
}

/** A plus — making something new. */
function IconCreate() {
  return icon(
    <>
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </>,
  )
}

/** Stacked layers — a channel's configuration. */
function IconChannels() {
  return icon(
    <>
      <path d="M8 1.75 14.25 5 8 8.25 1.75 5Z" />
      <path d="M1.75 8 8 11.25 14.25 8" />
      <path d="M1.75 11 8 14.25 14.25 11" />
    </>,
  )
}

/** Sliders — settings. */
function IconMembers() {
  return icon(
    <>
      <circle cx="6" cy="6" r="2.5" />
      <path d="M1.5 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
      <path d="M11 4.2a2.5 2.5 0 0 1 0 4.6" />
      <path d="M12.5 10.4c1.3.5 2 1.7 2 3.6" />
    </>,
  )
}

function IconSettings() {
  return icon(
    <>
      <line x1="2" y1="4.5" x2="14" y2="4.5" />
      <line x1="2" y1="11.5" x2="14" y2="11.5" />
      <circle cx="6" cy="4.5" r="1.75" />
      <circle cx="10.5" cy="11.5" r="1.75" />
    </>,
  )
}
