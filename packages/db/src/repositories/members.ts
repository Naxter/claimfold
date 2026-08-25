import { randomBytes } from 'node:crypto'

import { and, asc, eq, gt, ne } from 'drizzle-orm'

import { db } from '../client.ts'
import { invitation, member, organization, user } from '../schema/index.ts'

/**
 * Workspace membership: who is in, and how someone new gets in.
 *
 * **Why this is unscoped.** `member`, `invitation` and `organization` sit
 * outside row-level security by necessity — RLS begins where tenant context
 * exists, and these tables are how tenant context is established in the first
 * place. Every function here therefore takes an `orgId` the caller has already
 * verified through `requireSession`, which re-checks membership on every
 * request rather than trusting a cookie. That is the same contract
 * `settings/actions.ts` operates under for `organization`.
 *
 * **Why invitations are links rather than emails.** A self-hosted install has
 * no SMTP — `auth.ts` disables email verification for exactly this reason, and
 * an operator locked out of their own box by an unsendable mail is a bad first
 * impression. So an invitation produces a URL the operator sends however they
 * already talk to the person. The link IS the secret, which is why the id is
 * 256 bits of randomness rather than a uuid.
 */

export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface WorkspaceMember {
  userId: string
  email: string
  name: string
  role: string
  joinedAt: Date
}

export interface PendingInvitation {
  id: string
  email: string
  role: string
  expiresAt: Date
}

/** A workspace the current person can act in, oldest membership first. */
export interface UserWorkspace {
  orgId: string
  orgName: string
  role: string
}

/** Everyone currently in the workspace, longest-standing first. */
export async function listMembers(orgId: string): Promise<WorkspaceMember[]> {
  return db
    .select({
      userId: member.userId,
      email: user.email,
      name: user.name,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(asc(member.createdAt))
}

/** Invitations that can still be accepted. Expired ones are not shown. */
export async function listPendingInvitations(orgId: string): Promise<PendingInvitation[]> {
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, orgId),
        eq(invitation.status, 'pending'),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitation.createdAt))
}

/**
 * Workspaces a person belongs to.
 *
 * This is deliberately unscoped: it is used to choose the tenant context
 * before tenant-scoped queries can run. Callers must supply the authenticated
 * user id rather than taking it from the browser.
 */
export async function listUserWorkspaces(userId: string): Promise<UserWorkspace[]> {
  return db
    .select({
      orgId: member.organizationId,
      orgName: organization.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
}

/**
 * Lets an invited person create their account while public registration is
 * closed. This does not grant membership: the secret invitation link is still
 * required and `acceptInvitation` still binds it to the same email address.
 */
export async function hasPendingInvitationForEmail(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.email, email.trim().toLowerCase()),
        eq(invitation.status, 'pending'),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1)

  return row !== undefined
}

/** Whether an invitation URL can still be used to join a workspace. */
export async function isInvitationPending(token: string): Promise<boolean> {
  const [row] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.id, token),
        eq(invitation.status, 'pending'),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1)

  return row !== undefined
}

/** A week. Long enough to reach someone on holiday, short enough to expire. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Create an invitation and return the token that stands for it.
 *
 * The token is the row's primary key, so accepting is a single indexed lookup
 * and there is no second table to keep in step. 256 bits from `randomBytes`,
 * base64url — this value travels through whatever chat app the operator uses,
 * and anyone holding it can join the workspace at the invited role.
 */
export async function createInvitation(input: {
  orgId: string
  email: string
  role: MemberRole
  inviterId: string
}): Promise<string> {
  const token = randomBytes(32).toString('base64url')

  await db.insert(invitation).values({
    id: token,
    organizationId: input.orgId,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    status: 'pending',
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    inviterId: input.inviterId,
  })

  return token
}

export async function revokeInvitation(orgId: string, token: string): Promise<boolean> {
  const revoked = await db
    .update(invitation)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(invitation.id, token),
        eq(invitation.organizationId, orgId),
        eq(invitation.status, 'pending'),
      ),
    )
    .returning()

  return revoked.length > 0
}

export type AcceptResult =
  | { ok: true; orgId: string; orgName: string }
  /** No such token, already used, revoked, or past its expiry. */
  | { ok: false; reason: 'invalid' }
  /** Signed in as somebody else. */
  | { ok: false; reason: 'wrong_email'; invitedEmail: string }
  /** Already in this workspace; nothing to do. */
  | { ok: false; reason: 'already_member'; orgId: string }

/**
 * Redeem an invitation for the signed-in user.
 *
 * The email must match. An invitation names a person, and a link that admits
 * whoever opens it is a link that admits whoever the operator accidentally
 * forwarded it to — on a product where a member can publish under the
 * business's own name. Checked case-insensitively, because people type their
 * own address inconsistently and that is not a security boundary.
 *
 * One transaction: the membership insert and the status flip must not be able
 * to disagree, or a token stays redeemable after it worked.
 */
export async function acceptInvitation(
  token: string,
  acceptingUser: { id: string; email: string },
): Promise<AcceptResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(invitation)
      .where(and(eq(invitation.id, token), eq(invitation.status, 'pending')))
      .limit(1)

    if (!row || row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'invalid' }

    if (row.email.toLowerCase() !== acceptingUser.email.toLowerCase()) {
      return { ok: false, reason: 'wrong_email', invitedEmail: row.email }
    }

    const [existing] = await tx
      .select({ id: member.id })
      .from(member)
      .where(
        and(eq(member.organizationId, row.organizationId), eq(member.userId, acceptingUser.id)),
      )
      .limit(1)

    if (existing) {
      // Consume the token anyway: it has served its purpose and should not
      // remain redeemable.
      await tx.update(invitation).set({ status: 'accepted' }).where(eq(invitation.id, token))
      return { ok: false, reason: 'already_member', orgId: row.organizationId }
    }

    await tx.insert(member).values({
      id: randomBytes(16).toString('hex'),
      organizationId: row.organizationId,
      userId: acceptingUser.id,
      role: row.role,
      createdAt: new Date(),
    })

    await tx.update(invitation).set({ status: 'accepted' }).where(eq(invitation.id, token))

    const [org] = await tx
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, row.organizationId))
      .limit(1)

    return { ok: true, orgId: row.organizationId, orgName: org?.name ?? 'workspace' }
  })
}

/**
 * Change what an existing member may do.
 *
 * Refuses to touch an `owner`. There is no "transfer ownership" flow, so
 * demoting the only owner would leave a workspace nobody can administer — and
 * the person doing it would have removed their own ability to undo it.
 */
export async function setMemberRole(
  orgId: string,
  userId: string,
  role: Exclude<MemberRole, 'owner'>,
): Promise<boolean> {
  const updated = await db
    .update(member)
    .set({ role })
    .where(
      and(
        eq(member.organizationId, orgId),
        eq(member.userId, userId),
        // The existing row must not be an owner. Enforced in the WHERE rather
        // than by reading first and deciding in JavaScript, so two admins
        // racing cannot both see a non-owner and both write.
        ne(member.role, 'owner'),
      ),
    )
    .returning()

  return updated.length > 0
}

/**
 * Remove someone from the workspace.
 *
 * Owners cannot be removed, for the same reason they cannot be demoted: there
 * is no ownership-transfer flow, so this would be the last action anyone could
 * take in that workspace.
 */
export async function removeMember(orgId: string, userId: string): Promise<boolean> {
  const removed = await db
    .delete(member)
    .where(
      and(eq(member.organizationId, orgId), eq(member.userId, userId), ne(member.role, 'owner')),
    )
    .returning()

  return removed.length > 0
}
