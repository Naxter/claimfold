import type { Messages } from './i18n/messages/en.ts'

/**
 * The board's columns, and one that is deliberately gone.
 *
 * There used to be an "Approved" column of its own, and nothing could ever put
 * a post in it. `approvePost` writes `scheduled`, and the worker sweeps up any
 * legacy `approved` row as immediately due — so the column was a labelled empty
 * space on the main screen of every new install, promising a stage that does
 * not exist. Approving *is* scheduling; the board now says so.
 *
 * `approved` rides along with `scheduled` rather than being dropped entirely,
 * because rows written before that change still carry it and a post nobody can
 * see is worse than a post in a slightly generous column.
 *
 * `drafted`, `checked` and `rendered` are likewise unreachable — `saveDraft`
 * writes only `review` or `rejected` — and stay listed for the same reason.
 *
 * **Its own module so the skeleton cannot disagree with the page.** `page.tsx`
 * defined this list privately and `loading.tsx` hardcoded five columns against
 * it, so the placeholder promised a board one column wider than the one that
 * arrived. The grid class below is shared for the same reason: the two files
 * had drifted to different track sizes as well.
 */
export const BOARD_COLUMNS: Array<{
  key: keyof Messages['board']['columns']
  statuses: string[]
}> = [
  { key: 'review', statuses: ['review', 'drafted', 'checked', 'rendered'] },
  { key: 'scheduled', statuses: ['scheduled', 'publishing', 'approved'] },
  { key: 'published', statuses: ['published'] },
  { key: 'closed', statuses: ['rejected', 'failed'] },
]

/**
 * The track sizing, shared between the board and its skeleton.
 *
 * A responsive grid reflowed these columns onto two rows at every width below
 * 1536px, which is where most people actually are. That breaks the only thing a
 * board is for: the columns are a left-to-right sequence through the pipeline,
 * and a sequence that wraps stops being one. Every board-shaped interface
 * scrolls sideways for this reason.
 *
 * The 11rem floor is measured, not guessed: four columns plus three 16px gaps
 * fit inside the content area of a 1280px window, which is the width most
 * people are actually at. Wider and it scrolls on the common case for no
 * reason; narrower and the cards stop being readable. Below 1280 it scrolls,
 * which is correct.
 */
export const BOARD_GRID_CLASS =
  'grid grid-flow-col auto-cols-[minmax(11rem,1fr)] gap-[var(--sp-6)] pb-[var(--sp-5)]'
