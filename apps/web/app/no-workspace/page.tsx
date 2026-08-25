import type { Metadata } from 'next'

import { redirect } from 'next/navigation'

import { getMessages } from '../../lib/i18n/index.ts'
import { resolveSession } from '../../lib/session.ts'
import { NoWorkspaceControls } from './no-workspace-controls.tsx'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).noWorkspace.title }
}

/**
 * Signed in, but a member of nothing.
 *
 * The state this page exists for is not exotic. An invitee's workspace comes
 * from their invitation, so signing up deliberately creates none — and if the
 * redemption then does not happen, the account is real and belongs nowhere.
 * Before this page, that person was redirected to `/sign-in`, where signing in
 * worked and returned them to `/`, which redirected them to `/sign-in`.
 *
 * Three ways out, in the order they are most likely to be the right one:
 * redeem the invitation that was meant to bring you here, start a workspace of
 * your own, or sign out and let somebody else use the browser.
 *
 * Outside the shell on purpose. Every navigation the shell offers leads to a
 * page that would bounce straight back here, and a sidebar full of dead links
 * is a worse answer than no sidebar.
 */
export default async function NoWorkspacePage() {
  const state = await resolveSession()
  const t = await getMessages()

  if (state.kind === 'anonymous') redirect('/sign-in')
  // Arriving here with a workspace means the situation resolved — most likely
  // in another tab. Nothing to do but carry on.
  if (state.kind === 'active') redirect('/')

  return (
    <main className="flex min-h-screen items-center justify-center p-[var(--sp-7)]">
      <div className="panel w-full max-w-prose p-[var(--sp-8)]">
        <h1 className="mb-[var(--sp-5)]">{t.noWorkspace.title}</h1>
        <p className="prose mb-[var(--sp-7)] text-sm">{t.noWorkspace.explain(state.email)}</p>

        <NoWorkspaceControls
          suggestedName={t.signIn.workspaceNameTemplate.replace(
            '{owner}',
            state.name || state.email.split('@')[0]!,
          )}
          suggestedSlug={state.email.split('@')[0]!.replace(/[^a-z0-9]/gi, '-').toLowerCase()}
          labels={{
            pasteLabel: t.noWorkspace.pasteLabel,
            pasteHint: t.noWorkspace.pasteHint,
            pasteAction: t.noWorkspace.pasteAction,
            pasteInvalid: t.noWorkspace.pasteInvalid,
            startTitle: t.noWorkspace.startTitle,
            startHint: t.noWorkspace.startHint,
            startAction: t.noWorkspace.startAction,
            startFailed: t.noWorkspace.startFailed,
            signOut: t.noWorkspace.signOut,
            working: t.common.loading,
          }}
        />
      </div>
    </main>
  )
}
