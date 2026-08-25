import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from '../../../lib/auth.ts'
import { getMessages } from '../../../lib/i18n/index.ts'
import { JoinInviteButton } from './join-invite-button.tsx'

export const dynamic = 'force-dynamic'

/**
 * Redeeming an invitation is an explicit action, not a side effect of opening
 * a URL. Link previews and security scanners commonly fetch a shared URL; they
 * must never be able to spend the membership token on the recipient's behalf.
 *
 * This deliberately asks Better Auth for the raw session instead of
 * `getActiveSession`: a newly registered invitee has a session but no workspace
 * membership yet, which is precisely the state this page exists to resolve.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const t = await getMessages()
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(`/invite/${token}`)}`)
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-[var(--sp-7)]">
      <div className="panel max-w-prose p-[var(--sp-8)]">
        <h1 className="mb-[var(--sp-5)]">{t.invite.joinTitle}</h1>
        <p className="prose mb-[var(--sp-7)] text-sm">{t.invite.joinPrompt}</p>
        <JoinInviteButton
          token={token}
          labels={{
            join: t.invite.join,
            joining: t.invite.joining,
            invalid: t.invite.invalid,
            alreadyMember: t.invite.alreadyMember,
            wrongEmail: t.invite.wrongEmail,
            activateFailed: t.invite.activateFailed,
          }}
        />
      </div>
    </main>
  )
}
