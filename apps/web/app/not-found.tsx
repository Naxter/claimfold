import Link from 'next/link'

import { getMessages } from '../lib/i18n/index.ts'

/**
 * What a person sees when a post, channel or recording does not exist.
 *
 * `notFound()` is called from three places — the review page, the channel
 * editor and the evidence record — and without this file all three landed on
 * Next's built-in 404: English whatever the reader's language, no shell, no
 * navigation, and no way back other than the browser's own button. That is the
 * same gap `error.tsx` was written to close; it just was never done for the
 * missing-page half.
 *
 * A server component, unlike `error.tsx`. An error boundary has to be a client
 * component receiving only `{ error, reset }`, which is why that file reads the
 * cookie by hand and pulls all four catalogues into its chunk. Nothing forces
 * that here, so this uses the ordinary server-side language resolution and
 * ships one catalogue.
 *
 * Deliberately says nothing about what was missing. A 404 that distinguishes
 * "no such post" from "not your post" is an existence oracle for ids belonging
 * to other tenants.
 */
export default async function NotFound() {
  const t = await getMessages()

  return (
    <main className="flex min-h-screen items-center justify-center p-[var(--sp-7)]">
      <div className="panel max-w-prose p-[var(--sp-8)]">
        <h1 className="mb-[var(--sp-5)]">{t.errors.notFoundTitle}</h1>
        <p className="prose mb-[var(--sp-7)] text-sm">{t.errors.notFoundBody}</p>

        <Link href="/" className="btn">
          {t.errors.pageBack}
        </Link>
      </div>
    </main>
  )
}
