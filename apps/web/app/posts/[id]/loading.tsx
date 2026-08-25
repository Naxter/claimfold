import { Shell } from '../../../components/shell.tsx'
import { getMessages } from '../../../lib/i18n/index.ts'

/**
 * The review page while it loads.
 *
 * This is the slowest page in the app — it re-runs the whole gate before it can
 * render — and it is reached by clicking a card, so the old behaviour left the
 * board on screen looking unclicked for the entire evaluation.
 *
 * The two-column split and the slide strip are reproduced at their real sizes,
 * because a reviewer's eye goes to the same place every time and that place
 * should not move once the content lands.
 *
 * Three details here are copied from page.tsx rather than chosen, and all three
 * were wrong before — which made this file cause the layout shift it exists to
 * prevent:
 *
 *  - the breakpoint and the evidence column width (`xl` / 420px, not `lg` /
 *    22rem). Between 1024px and 1280px the skeleton was two columns and the
 *    content arrived as one; above 1280px the column jumped 352px → 420px.
 *  - the wrapping header row. This reproduced the `shrink-0` layout page.tsx
 *    explicitly abandoned, with a comment, because it ran 122px off a phone
 *    screen — so the skeleton reintroduced the horizontal scroll on every load.
 *  - a heading. `Shell` was given no title and there was no `<h1>`, so the
 *    loading state had an empty heading outline.
 */
export default async function ReviewLoading() {
  const t = await getMessages()

  return (
    <Shell session={null} title={t.review.loadingTitle}>
      <div role="status" aria-label={t.appearance.loading}>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-[var(--sp-5)]">
          <div className="min-w-0 flex-1 basis-72 space-y-2">
            <span className="skeleton block h-3 w-28" />
            <span className="skeleton block h-6 w-2/3" />
            <span className="skeleton block h-3 w-52" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="skeleton block h-[var(--control-h)] w-40" />
            <span className="skeleton block h-[var(--control-h)] w-28" />
            <span className="skeleton block h-[var(--control-h)] w-24" />
          </div>
        </div>

        {/* The gate verdict. Sized for the panel, not for one line: it is the
            first thing read, and having it grow after arriving would push the
            slides down exactly as they are being looked at. */}
        <div className="skeleton mb-6 h-24 w-full" />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <span className="skeleton block h-3 w-20" />
            <div className="flex gap-4 overflow-hidden">
              {[0, 1, 2].map((slide) => (
                <div key={slide} className="skeleton h-[270px] w-[216px] shrink-0" />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <span className="skeleton block h-3 w-40" />
            {[0, 1, 2, 3].map((claim) => (
              <div key={claim} className="skeleton h-20 w-full" />
            ))}
          </div>
        </div>
      </div>
    </Shell>
  )
}
