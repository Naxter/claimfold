import type { Metadata } from 'next'
import Link from 'next/link'

import { countPostsByStatus, listPosts, type PostSummary } from '@claimfold/db'

import { Shell, StatusBadge } from '../components/shell.tsx'
import { APP_NAME } from '../lib/app-name.ts'
import { BOARD_COLUMNS, BOARD_GRID_CLASS } from '../lib/board-columns.ts'
import { getLocale, getMessages, type Locale, type Messages } from '../lib/i18n/index.ts'
import { loadReadiness } from '../lib/instagram-setup.ts'
import { requireSession } from '../lib/session.ts'

export const dynamic = 'force-dynamic'

/**
 * A tab you can tell apart from the other eight.
 *
 * `absolute`, unlike every other page, because Next does not apply a title
 * template to the segment that declares it — and this page shares a segment
 * with the root layout. Left as a plain title it produced the one tab in the
 * product with no product name on it.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: { absolute: `${(await getMessages()).board.title} · ${APP_NAME}` } }
}


/**
 * The board.
 *
 * Columns by state rather than a list by date, because the question a reviewer
 * opens this page with is "what needs me?", not "what happened recently".
 *
 * Kept as columns rather than converted to a table: a table is the right form
 * for scanning many rows on shared attributes, and this is a small number of
 * items whose most important attribute is which pile they are in. The columns
 * *are* the information.
 */
/**
 * How many cards are fetched, at most.
 *
 * Named rather than inlined because two things depend on it: the query, and
 * the line that admits the list is capped. When only the query knew the number,
 * the board could show a hundred fewer cards than it counted and say nothing.
 */
const BOARD_LIMIT = 200

// The column definitions live in lib/board-columns.ts so app/loading.tsx draws
// a skeleton with the same shape. They were separate, and disagreed.
const COLUMNS = BOARD_COLUMNS

export default async function BoardPage() {
  const session = await requireSession()
  const t = await getMessages()
  const locale = await getLocale()
  /*
    Three independent reads, run together.

    They were three sequential awaits — each one its own `withOrg` transaction,
    each waiting for the last to finish, and none of them needing anything the
    others return. The review page had already been fixed this way; the board
    had not.

    - `listPosts` returns a page plus a cursor. The board draws one page — it is
      a kanban view, not an archive — but the cap is no longer silent:
      `nextCursor` is the difference between "that is everything" and "there is
      more you cannot see from here", and the notice below says which.
    - `countPostsByStatus` counts in the database rather than from `posts`,
      which is a capped page. Deriving the heading numbers from the fetched rows
      makes them stop being true at exactly the point they start mattering.
    - `loadReadiness` is only consulted for the empty state, which is the one
      moment the answer changes what to offer: a fresh install has nothing to
      review and nowhere to publish, and pointing it at Create first buries the
      setup it needs.
  */
  const [{ posts, nextCursor }, counts, { account }] = await Promise.all([
    listPosts(session.orgId, { limit: BOARD_LIMIT }),
    countPostsByStatus(session.orgId),
    loadReadiness(session.orgId),
  ])

  return (
    <Shell
      session={session}
      title={t.board.title}
      bleed
      actions={
        <Link href="/generate" className="btn">
          {t.board.createPost}
        </Link>
      }
    >
      {posts.length === 0 ? (
        <EmptyState connected={account !== null} t={t} />
      ) : (
        /* One row that scrolls, not a grid that wraps.
         *
         * The track sizing and the reasoning behind it now live with the column
         * definitions, in lib/board-columns.ts. */
        <>
          {nextCursor && (
            <p className="text-subtle mb-[var(--sp-5)] text-xs">{t.board.capped(BOARD_LIMIT)}</p>
          )}
          <div className={`${BOARD_GRID_CLASS} overflow-x-auto`}>
          {COLUMNS.map((column) => {
            const items = posts.filter((p) => column.statuses.includes(p.status))
            const total = column.statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0)
            return (
              <section key={column.key} className="min-w-0">
                <h2 className="mb-[var(--sp-5)] flex items-center gap-[var(--sp-4)]">
                  <span className="label">{t.board.columns[column.key]}</span>
                  <span className="bg-sunken text-muted rounded-[var(--radius-1)] px-[var(--sp-3)] text-xs">
                    {total}
                  </span>
                </h2>
                <div className="flex flex-col gap-[var(--sp-4)]">
                  {items.map((post) => (
                    <PostCard key={post.id} post={post} t={t} locale={locale} />
                  ))}
                </div>
              </section>
            )
          })}
          </div>
        </>
      )}
    </Shell>
  )
}

function PostCard({
  post,
  t,
  locale,
}: {
  post: PostSummary
  t: Messages
  locale: Locale
}) {
  return (
    <Link
      href={`/posts/${post.id}`}
      className="panel hover:border-rule-strong block p-[var(--sp-5)] transition-colors"
    >
      <div className="mb-[var(--sp-4)] flex items-center gap-[var(--sp-3)]">
        <StatusBadge status={post.status} />
        {/* Surfaced on the card, not buried in the detail view: an unresolved
            core claim is the single reason a post should not be waved through.
            Kept to two words so it stays one line in every language — this
            wrapped to three lines in German at the first real width test. */}
        {post.unresolvedClaims > 0 && (
          <span className="badge bg-err-weak text-err">
            {t.board.unresolved(post.unresolvedClaims)}
          </span>
        )}
      </div>

      <p className="text-fg mb-[var(--sp-4)] line-clamp-3 text-sm leading-snug font-medium">
        {post.hook || post.title || '—'}
      </p>

      <div className="text-subtle flex flex-wrap items-center gap-x-[var(--sp-4)] text-xs">
        <span className="truncate">{post.nicheName}</span>
        <span>{t.board.slideCount(post.slideCount)}</span>
        {post.scheduledAt && (
          <span>
            {new Date(post.scheduledAt).toLocaleString(locale, {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </span>
        )}
      </div>
    </Link>
  )
}

/**
 * Creating works without Instagram; publishing does not. So an unconnected
 * install is offered both, in the order they will be needed, rather than one
 * button that produces a post with nowhere to go.
 */
function EmptyState({ connected, t }: { connected: boolean; t: Messages }) {
  return (
    <div className="border-rule mx-auto max-w-xl rounded-[var(--radius-2)] border border-dashed p-[var(--sp-9)] text-center">
      <p className="text-fg mb-[var(--sp-4)] text-sm font-medium">{t.board.empty.title}</p>
      <p className="prose text-subtle mx-auto mb-[var(--sp-7)] text-sm">{t.board.empty.body}</p>

      <div className="flex flex-wrap items-center justify-center gap-[var(--sp-5)]">
        <Link href="/generate" className="btn">
          {t.board.empty.createFirst}
        </Link>
        {!connected && (
          <Link href="/setup" className="btn btn-ghost">
            {t.board.empty.setUpPublishing}
          </Link>
        )}
      </div>

      {!connected && (
        <p className="prose text-subtle mx-auto mt-[var(--sp-6)] text-xs">
          {t.board.empty.notConnected}
        </p>
      )}
    </div>
  )
}
