import { Shell } from '../components/shell.tsx'
import { BOARD_COLUMNS, BOARD_GRID_CLASS } from '../lib/board-columns.ts'
import { getMessages } from '../lib/i18n/index.ts'

/**
 * What the board looks like while it is being fetched.
 *
 * Without this file Next has no fallback to show, so clicking a nav item left
 * the *previous* page on screen, fully interactive, until the next one was
 * ready — a second of looking like the click did nothing, on the navigation
 * people use most.
 *
 * The skeleton is column-shaped rather than a spinner because the board is
 * column-shaped: the placeholder occupies the space the real cards will, so
 * arriving content fills in rather than shoves.
 *
 * `session={null}` keeps this free of a database round trip; only `getMessages`
 * is awaited, and that reads a cookie.
 */
export default async function BoardLoading() {
  const t = await getMessages()

  return (
    <Shell session={null} title={t.board.title} bleed>
      {/* Column count and track sizing both come from the same module the board
          itself uses. This file used to hardcode five columns against a board
          that renders four, so the placeholder promised a stage that does not
          exist and the layout shifted the moment real content arrived —
          defeating the point of the skeleton. */}
      <div
        role="status"
        aria-label={t.appearance.loading}
        className={`${BOARD_GRID_CLASS} overflow-hidden`}
      >
        {BOARD_COLUMNS.map((definition, column) => (
          <section key={definition.key}>
            <div className="mb-[var(--sp-5)] flex items-center gap-[var(--sp-4)]">
              <span className="skeleton block h-3 w-24" />
              <span className="skeleton block h-3 w-5" />
            </div>
            <div className="flex flex-col gap-[var(--sp-4)]">
              {/* Only the first two columns get cards. Five equal stacks would
                  promise a full board to an install that has three posts. */}
              {(column < 2 ? [0, 1] : []).map((card) => (
                <div key={card} className="skeleton h-[104px] w-full" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Shell>
  )
}
