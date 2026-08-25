import { cookies, headers } from 'next/headers'

import { de } from './messages/de.ts'
import { en, type Messages } from './messages/en.ts'
import { es } from './messages/es.ts'
import { fr } from './messages/fr.ts'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  fromAcceptLanguage,
  isLocale,
  LOCALES,
  LOCALE_LABELS,
  toLocale,
  type Locale,
} from './locales.ts'

/**
 * Reading the interface language on the server.
 *
 * Every page here is a Server Component, so the language is resolved once per
 * request and the right strings are rendered directly. No dictionary is sent
 * to the browser and there is no flash of the wrong language.
 *
 * The choice lives in a cookie rather than the database. It describes a
 * browser, not an account: two people sharing one workspace can reasonably
 * want different interface languages, and a cookie gets that right without a
 * migration or a per-user settings table.
 */

const CATALOGUES: Record<Locale, Messages> = { en, de, fr, es }

/**
 * Which language to render in.
 *
 * An explicit choice wins. Failing that the browser's own preference is
 * honoured — someone whose browser is set to French should not have to find a
 * setting to be spoken to in French. English is the last resort.
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies()
  const chosen = jar.get(LOCALE_COOKIE)?.value
  if (isLocale(chosen)) return chosen

  const header = (await headers()).get('accept-language')
  return fromAcceptLanguage(header) ?? DEFAULT_LOCALE
}

/** The strings for this request. */
export async function getMessages(): Promise<Messages> {
  return CATALOGUES[await getLocale()]
}

/** Both at once, for the common case where a page needs the tag for `<html lang>`. */
export async function getTranslation(): Promise<{ locale: Locale; t: Messages }> {
  const locale = await getLocale()
  return { locale, t: CATALOGUES[locale] }
}

/**
 * A language's own name, for showing which language a channel writes in.
 *
 * Falls back to the tag itself rather than to English: a channel may be
 * configured for a language the dashboard does not speak, and showing `sv` is
 * more honest than silently calling it English.
 */
export function languageName(tag: string): string {
  const locale = toLocale(tag)
  return locale ? LOCALE_LABELS[locale] : tag
}

export { DEFAULT_LOCALE, isLocale, LOCALES, LOCALE_COOKIE, LOCALE_LABELS, toLocale, type Locale }
export type { Messages }
