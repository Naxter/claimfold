'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  createInvitation,
  removeMember,
  revokeInvitation,
  setMemberRole,
  type MemberRole,
} from '@claimfold/db'

import { readAppUrl } from '../../lib/app-url.ts'
import { formText } from '../../lib/form.ts'
import { getMessages } from '../../lib/i18n/index.ts'
import { can } from '../../lib/permissions.ts'
import { requireSession } from '../../lib/session.ts'
import type { InviteFormState } from './invite-state.ts'

/**
 * Managing who is in the workspace.
 *
 * Four roles have existed in the schema since sessions did, and until now three
 * of them were unreachable: there was no way to add a second person, so every
 * install had exactly one `owner` and the entire capability system was
 * enforcement over a population of one. ADR 0005 says as much.
 *
 * Everything here requires `publish`. Adding someone who can put posts in front
 * of an audience under the business's name is not an editing decision, and
 * `admin` is the lowest role that should be able to make it.
 */

const ROLES: MemberRole[] = ['owner', 'admin', 'editor', 'viewer']

function isAssignableRole(value: string): value is Exclude<MemberRole, 'owner'> {
  return ROLES.includes(value as MemberRole) && value !== 'owner'
}

function back(message?: string): never {
  const suffix = message ? `?error=${encodeURIComponent(message)}` : ''
  redirect(`/members${suffix}`)
}

export async function inviteMemberAction(
  _previous: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const session = await requireSession()
  const t = await getMessages()

  if (!can(session, 'publish')) return { error: t.members.errors.notPermitted }

  const email = formText(formData, 'email').trim().toLowerCase()
  const role = formText(formData, 'role')

  // Deliberately shallow. A regex that decides what a valid address looks like
  // is a regex that eventually rejects somebody's real one, and the address is
  // only used to match against whoever accepts.
  if (!email.includes('@') || email.length < 3) return { error: t.members.errors.badEmail }
  if (!isAssignableRole(role)) return { error: t.members.errors.badRole }

  const token = await createInvitation({
    orgId: session.orgId,
    email,
    role,
    inviterId: session.userId,
  })

  // Refreshes the pending-invitations list. The returned link is not part of
  // that payload and never reaches the URL.
  revalidatePath('/members')
  return { link: `${readAppUrl().replace(/\/+$/, '')}/invite/${token}` }
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  const t = await getMessages()

  if (!can(session, 'publish')) back(t.members.errors.notPermitted)

  const token = formText(formData, 'token')
  if (token) await revokeInvitation(session.orgId, token)

  revalidatePath('/members')
  back()
}

export async function setRoleAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  const t = await getMessages()

  if (!can(session, 'publish')) back(t.members.errors.notPermitted)

  const userId = formText(formData, 'userId')
  const role = formText(formData, 'role')
  if (!userId || !isAssignableRole(role)) back(t.members.errors.badRole)

  /*
    You cannot change your own role.

    Not paternalism: an admin demoting themselves to `viewer` removes their own
    ability to undo it, and on a self-hosted install there is no support desk to
    reverse it. The same reason owners cannot be demoted at all.
  */
  if (userId === session.userId) back(t.members.errors.notYourself)

  if (!(await setMemberRole(session.orgId, userId, role))) back(t.members.errors.cannotChangeOwner)

  revalidatePath('/members')
  back()
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  const t = await getMessages()

  if (!can(session, 'publish')) back(t.members.errors.notPermitted)

  const userId = formText(formData, 'userId')
  if (!userId) back()
  if (userId === session.userId) back(t.members.errors.notYourself)

  if (!(await removeMember(session.orgId, userId))) back(t.members.errors.cannotChangeOwner)

  revalidatePath('/members')
  back()
}
