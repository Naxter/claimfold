/**
 * The languages the dashboard speaks.
 *
 * Two different "languages" exist in this product and conflating them would be
 * a mistake:
 *
 * - **Interface language** — the buttons, labels and help text a person reads
 *   while working. That is what this file is about.
 * - **Output language** — what the carousel itself is written in. That belongs
 *   to the niche, because one install is meant to run a German channel and an
 *   English one side by side. A niche's language always wins.
 *
 * The interface language seeds the second when a new niche is created, and it
 * is the fallback when nothing else says otherwise. It never overrides a niche
 * that has already made its choice.
 */

/**
 * Where the chosen interface language is stored.
 *
 * Declared here rather than beside the server-side reader, because the error
 * boundary is a client component that has to resolve the language for itself —
 * importing it from a module that also touches `next/headers` would drag the
 * server import into the browser bundle.
 */
export const LOCALE_COOKIE = 'claimfold_locale'

export const LOCALES = ['en', 'de', 'fr', 'es'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/** Names written in each language, because a language picker nobody can read is useless. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Best match for a BCP-47 tag.
 *
 * Region is dropped: `de-AT` and `de-CH` both get German, which is right for
 * interface text. Currency and date formatting keep the full tag elsewhere,
 * where the region genuinely matters.
 */
export function toLocale(tag: string | undefined | null): Locale | undefined {
  if (!tag) return undefined
  const base = tag.toLowerCase().split('-')[0]
  return isLocale(base) ? base : undefined
}

/**
 * Pick a language from an `Accept-Language` header.
 *
 * Quality values are honoured, because a browser sending
 * `fr;q=0.9, en;q=1.0` is stating a preference and ignoring it would be rude.
 */
export function fromAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (!header) return undefined

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params
        .map((p) => /^q=([\d.]+)$/.exec(p.trim())?.[1])
        .find((value) => value !== undefined)
      return { tag: tag?.trim() ?? '', quality: q === undefined ? 1 : Number(q) }
    })
    .filter((entry) => entry.tag && Number.isFinite(entry.quality))
    .sort((a, b) => b.quality - a.quality)

  for (const entry of ranked) {
    const match = toLocale(entry.tag)
    if (match) return match
  }
  return undefined
}
