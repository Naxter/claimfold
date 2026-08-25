import { cookies } from 'next/headers'

import {
  DENSITIES,
  DENSITY_COOKIE,
  SIDEBAR_COOKIE,
  THEMES,
  THEME_COOKIE,
  type Preferences,
} from './preferences.ts'

/**
 * Read the display preferences for this request.
 *
 * Split from `preferences.ts` so the cookie names can be imported by the
 * client-side toggles without dragging `next/headers` into the browser bundle.
 * That failure is worth naming: it typechecks cleanly and only appears at
 * runtime, as an error pointing at the far end of an import chain rather than
 * at the component that caused it. The `.server` suffix is the reminder.
 */

function one<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export async function getPreferences(): Promise<Preferences> {
  const jar = await cookies()
  return {
    theme: one(jar.get(THEME_COOKIE)?.value, THEMES, 'system'),
    density: one(jar.get(DENSITY_COOKIE)?.value, DENSITIES, 'comfortable'),
    sidebarCollapsed: jar.get(SIDEBAR_COOKIE)?.value === 'collapsed',
  }
}
