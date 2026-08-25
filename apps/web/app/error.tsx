'use client'

import { useEffect } from 'react'

import { ERROR_MESSAGES, type ErrorMessages } from '../lib/i18n/error-messages.ts'
import { isLocale, LOCALE_COOKIE } from '../lib/i18n/locales.ts'

/**
 * What a person sees when a page throws.
 *
 * Without this file Next renders its own bare "Application error: a
 * server-side exception has occurred", which tells a creator nothing and
 * offers them nothing to do. This says where the fault lies — the server, not
 * their browser — and gives them the two moves worth trying.
 *
 * `reset()` re-renders the failed segment rather than reloading the document,
 * which is the cheaper of the two and usually enough for a transient failure.
 *
 * An error boundary must be a client component receiving only `{ error, reset }`,
 * so the language cannot be handed in from the server the way every other
 * screen gets it. It is read from the same cookie instead.
 *
 * **This used to import all four full message catalogues.** The comment here
 * argued that was acceptable because the chunk "is only ever fetched when
 * something has already gone wrong" — which is not how an error boundary
 * works. It sits in the root layout's client graph, so its chunk is referenced
 * from the initial HTML and loads on every page, error or not. That was
 * ~60 KB gzipped on every cold load to render four strings. `error-messages.ts`
 * holds just those four, in all four languages, at under a kilobyte.
 */

/**
 * The reader's language, resolved without a server.
 *
 * Cookie first, then the browser's own preference. The second half is not
 * optional: the interface language is only written to a cookie when someone
 * changes it in settings, so a German user who never touched that setting has
 * no cookie at all — they are served German from `Accept-Language`. Reading
 * only the cookie meant this screen appeared in English for exactly those
 * people. Caught by seeing it happen, not by reasoning about it.
 */
function readMessages(): ErrorMessages {
  if (typeof document === 'undefined') return ERROR_MESSAGES.en

  const cookie = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
    ?.split('=')[1]
  if (isLocale(cookie)) return ERROR_MESSAGES[cookie]

  // `navigator.languages` is the client-side equivalent of Accept-Language,
  // already ordered by preference.
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split('-')[0]
    if (isLocale(base)) return ERROR_MESSAGES[base]
  }
  return ERROR_MESSAGES.en
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = readMessages()

  useEffect(() => {
    // The digest is what ties this screen to a line in the server log.
    // Without it, "it broke" cannot be matched against the terminal output.
    console.error('Page error', error.digest ?? '(no digest)', error)
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center p-[var(--sp-7)]">
      <div className="panel max-w-prose p-[var(--sp-8)]">
        <h1 className="mb-[var(--sp-5)]">{t.title}</h1>
        <p className="prose mb-[var(--sp-7)] text-sm">{t.body}</p>

        <div className="flex flex-wrap items-center gap-[var(--sp-5)]">
          <button type="button" onClick={reset} className="btn">
            {t.retry}
          </button>
          <a href="/" className="btn btn-ghost">
            {t.back}
          </a>
        </div>

        {/* Shown, not hidden: it is the only handle a person has when asking
            why, and it is meaningless to anyone without the server log. */}
        {error.digest && (
          <p className="text-subtle mt-[var(--sp-7)] font-mono text-xs">{error.digest}</p>
        )}
      </div>
    </main>
  )
}
