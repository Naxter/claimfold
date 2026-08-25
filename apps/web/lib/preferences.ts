/**
 * Display preferences that belong to a browser rather than to an account.
 *
 * Theme and row height describe a screen and the person in front of it — the
 * same account on a laptop in daylight and a monitor at night reasonably wants
 * different answers. So they live in cookies, read on the server and stamped
 * onto `<html>` before the first paint. That ordering matters: resolving them
 * in the browser instead would produce a flash of the wrong theme on every
 * navigation, which is the usual reason dark mode feels bolted on.
 *
 * This file holds ONLY the names and shapes, and imports nothing. The reader
 * lives in `preferences.server.ts` because it needs `next/headers`, and the
 * toggles that write these cookies are client components — importing a
 * constant from a module that also touches `next/headers` pulls the server
 * import into the browser bundle and the build fails at the far end of an
 * import chain nobody is looking at.
 */

export const THEME_COOKIE = 'claimfold_theme'
export const DENSITY_COOKIE = 'claimfold_density'
export const SIDEBAR_COOKIE = 'claimfold_sidebar'

/** `system` is the default and is not written as a `data-theme` attribute at
 *  all — the stylesheet's `prefers-color-scheme` block handles it. */
export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

/**
 * Row height. A real productivity setting, not a decoration: reviewing three
 * hundred records is nine screens compact against twenty comfortable.
 */
export const DENSITIES = ['compact', 'comfortable', 'spacious'] as const
export type Density = (typeof DENSITIES)[number]

export interface Preferences {
  theme: Theme
  density: Density
  sidebarCollapsed: boolean
}

