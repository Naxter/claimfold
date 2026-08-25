'use server'

import { headers } from 'next/headers'

import { acceptInvitation } from '@claimfold/db'

import { auth } from '../../../lib/auth.ts'

export type JoinInvitationResult =
  | { ok: true; orgId: string }
  | { ok: false; reason: 'invalid' | 'unauthenticated' }
  | { ok: false; reason: 'wrong_email'; invitedEmail: string; currentEmail: string }

/**
 * Adds the membership only. The browser then asks Better Auth to make that
 * workspace active, so its session cookie is updated by Better Auth's own
 * route handler instead of a hand-written session-table update.
 */
export async function acceptInvitationAction(token: string): Promise<JoinInvitationResult> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { ok: false, reason: 'unauthenticated' }

  const result = await acceptInvitation(token, {
    id: session.user.id,
    email: session.user.email,
  })

  if (result.ok) return { ok: true, orgId: result.orgId }
  if (result.reason === 'already_member') return { ok: true, orgId: result.orgId }
  if (result.reason === 'wrong_email') {
    return {
      ok: false,
      reason: 'wrong_email',
      invitedEmail: result.invitedEmail,
      currentEmail: session.user.email,
    }
  }

  return { ok: false, reason: 'invalid' }
}
