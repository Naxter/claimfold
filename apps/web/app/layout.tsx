import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { APP_NAME } from '../lib/app-name.ts'
import { getLocale } from '../lib/i18n/index.ts'
import { getPreferences } from '../lib/preferences.server.ts'

import './globals.css'

/**
 * The template is the point.
 *
 * Every page used to render the literal title "Claimfold", so nine browser
 * tabs, the whole history menu and every bookmark were indistinguishable, and
 * a screen reader announced the same word after each navigation. `%s` lets each
 * page name itself and keeps the product name where a tab can still be
 * identified when it is truncated to four characters.
 */
export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Research, review and publish Instagram carousels.',
  robots: { index: false, follow: false },
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Language, theme and density are all resolved here, per request, and
  // stamped on <html> before anything paints. Doing it in the browser instead
  // is what produces the flash of the wrong theme on every navigation.
  const [locale, prefs] = await Promise.all([getLocale(), getPreferences()])

  return (
    <html
      lang={locale}
      // `system` is deliberately absent rather than written out: with no
      // attribute the stylesheet's prefers-color-scheme block takes over, so
      // "match my device" keeps working when the device changes at sunset.
      {...(prefs.theme === 'system' ? {} : { 'data-theme': prefs.theme })}
      data-density={prefs.density}
      {...(prefs.sidebarCollapsed ? { 'data-sidebar': 'collapsed' } : {})}
    >
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
