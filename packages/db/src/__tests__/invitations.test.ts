import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  acceptInvitation,
  createInvitation,
  hasPendingInvitationForEmail,
  isInvitationPending,
  listPendingInvitations,
  revokeInvitation,
} from '../repositories/members.ts'
import { invitation, member, organization, user } from '../schema/index.ts'
import { createTestDatabase, useSharedDatabase, type TestDatabase } from '../testing.ts'

/**
 * Redeeming an invitation, against a real Postgres.
 *
 * This is the only way into a workspace other than being its first user, so
 * every refusal here is load-bearing: an invitation names one person, and a
 * link that admits whoever opens it admits whoever the operator accidentally
 * forwarded it to — on a product where a member can publish under the
 * business's own name.
 *
 * None of it was covered. The web app's test asserted that the `returnTo`
 * query parameter is shaped like an invitation path, which is a string
 * function; the email match, the expiry boundary, the already-a-member path
 * and the single-use guarantee — the four behaviours that make the flow safe
 * rather than merely present — had no test at all.
 *
 * These tables sit outside row-level security on purpose: an invitee is by
 * definition not yet a member of the organization they are joining, so a
 * tenant-scoped query could not see the row that admits them. See the note at
 * the top of `repositories/members.ts`.
 */

const ORG = 'org_invites'
const OTHER_ORG = 'org_elsewhere'
const INVITER = 'user_inviter'
const INVITEE = { id: 'user_invitee', email: 'invitee@example.com' }
const STRANGER = { id: 'user_stranger', email: 'stranger@example.com' }

let harness: Awaited<ReturnType<typeof createTestDatabase>>
let db: TestDatabase
let restore: () => void

beforeAll(async () => {
  harness = await createTestDatabase()
  db = harness.db
  restore = useSharedDatabase(db)

  await db.insert(organization).values([
    { id: ORG, name: 'Invites', slug: 'invites' },
    { id: OTHER_ORG, name: 'Elsewhere', slug: 'elsewhere' },
  ])
  await db.insert(user).values([
    { id: INVITER, name: 'Inviter', email: 'inviter@example.com' },
    { id: INVITEE.id, name: 'Invitee', email: INVITEE.email },
    { id: STRANGER.id, name: 'Stranger', email: STRANGER.email },
  ])
})

afterAll(async () => {
  restore()
  await harness.close()
})

beforeEach(async () => {
  await db.delete(member)
  await db.delete(invitation)
})

/** An invitation for the standard invitee, at `editor` unless told otherwise. */
async function invite(overrides: { email?: string; role?: 'admin' | 'editor' | 'viewer' } = {}) {
  return createInvitation({
    orgId: ORG,
    email: overrides.email ?? INVITEE.email,
    role: overrides.role ?? 'editor',
    inviterId: INVITER,
  })
}

async function membershipsOf(userId: string) {
  return db
    .select({ orgId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId))
}

describe('creating an invitation', () => {
  it('mints a token long and random enough to be a credential', async () => {
    const token = await invite()

    // 32 bytes, base64url. The sign-in page's `returnTo` allowlist accepts
    // 32–128 characters from exactly this alphabet, so a change to either end
    // that broke the other would fail here rather than in a browser.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const other = await invite({ email: 'someone-else@example.com' })
    expect(other).not.toBe(token)
  })

  it('normalises the invited address, because people type their own inconsistently', async () => {
    const token = await createInvitation({
      orgId: ORG,
      email: '  Invitee@Example.COM ',
      role: 'editor',
      inviterId: INVITER,
    })

    const [row] = await db.select().from(invitation).where(eq(invitation.id, token))
    expect(row?.email).toBe('invitee@example.com')
  })
})

describe('redeeming an invitation', () => {
  it('adds the membership at the invited role', async () => {
    const token = await invite({ role: 'admin' })

    const result = await acceptInvitation(token, INVITEE)

    expect(result).toMatchObject({ ok: true, orgId: ORG })
    expect(await membershipsOf(INVITEE.id)).toEqual([{ orgId: ORG, role: 'admin' }])
  })

  it('refuses somebody else, however they got hold of the link', async () => {
    const token = await invite()

    const result = await acceptInvitation(token, STRANGER)

    expect(result).toEqual({ ok: false, reason: 'wrong_email', invitedEmail: INVITEE.email })
    expect(await membershipsOf(STRANGER.id)).toEqual([])
    // And crucially the invitation survives: a stranger opening the link must
    // not burn it for the person it was actually for.
    expect(await isInvitationPending(token)).toBe(true)
  })

  it('matches the address case-insensitively', async () => {
    const token = await invite()

    const result = await acceptInvitation(token, {
      id: INVITEE.id,
      email: 'INVITEE@Example.com',
    })

    expect(result).toMatchObject({ ok: true })
  })

  it('works only once', async () => {
    const token = await invite()

    expect(await acceptInvitation(token, INVITEE)).toMatchObject({ ok: true })
    // Same person, same link, second time: the token is spent.
    expect(await acceptInvitation(token, INVITEE)).toEqual({ ok: false, reason: 'invalid' })
    expect(await membershipsOf(INVITEE.id)).toHaveLength(1)
  })

  it('spends the token when the person is already a member', async () => {
    await db.insert(member).values({
      id: 'member_existing',
      organizationId: ORG,
      userId: INVITEE.id,
      role: 'viewer',
    })
    const token = await invite({ role: 'admin' })

    const result = await acceptInvitation(token, INVITEE)

    expect(result).toEqual({ ok: false, reason: 'already_member', orgId: ORG })
    // Their existing role is left alone — an invitation is not a promotion —
    // but the link is consumed rather than left redeemable.
    expect(await membershipsOf(INVITEE.id)).toEqual([{ orgId: ORG, role: 'viewer' }])
    expect(await isInvitationPending(token)).toBe(false)
  })

  it('refuses an expired invitation', async () => {
    const token = await invite()
    await db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(invitation.id, token))

    expect(await acceptInvitation(token, INVITEE)).toEqual({ ok: false, reason: 'invalid' })
    expect(await membershipsOf(INVITEE.id)).toEqual([])
  })

  it('refuses a revoked invitation', async () => {
    const token = await invite()
    expect(await revokeInvitation(ORG, token)).toBe(true)

    expect(await acceptInvitation(token, INVITEE)).toEqual({ ok: false, reason: 'invalid' })
    expect(await membershipsOf(INVITEE.id)).toEqual([])
  })

  it('refuses a token that never existed', async () => {
    expect(await acceptInvitation('n'.repeat(43), INVITEE)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('will not let one workspace revoke another workspace’s invitation', async () => {
    const token = await invite()

    expect(await revokeInvitation(OTHER_ORG, token)).toBe(false)
    expect(await isInvitationPending(token)).toBe(true)
  })
})

describe('what the sign-in screen is allowed to ask', () => {
  /*
    Two different questions, deliberately keyed differently.

    `isInvitationPending` takes the token and decides whether to offer the
    sign-up toggle at all. `hasPendingInvitationForEmail` takes the address and
    is what actually lets an account be created while registration is closed.
    Holding a valid link is therefore not enough to register — which is the
    property that keeps a forwarded link from becoming an open door.
  */
  it('separates "this link is live" from "this person may register"', async () => {
    const token = await invite()

    expect(await isInvitationPending(token)).toBe(true)
    expect(await hasPendingInvitationForEmail(INVITEE.email)).toBe(true)
    expect(await hasPendingInvitationForEmail(STRANGER.email)).toBe(false)
  })

  it('stops offering registration once the invitation is spent', async () => {
    const token = await invite()
    await acceptInvitation(token, INVITEE)

    expect(await isInvitationPending(token)).toBe(false)
    expect(await hasPendingInvitationForEmail(INVITEE.email)).toBe(false)
  })

  it('ignores an expired invitation for both questions', async () => {
    const token = await invite()
    await db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(invitation.id, token))

    expect(await isInvitationPending(token)).toBe(false)
    expect(await hasPendingInvitationForEmail(INVITEE.email)).toBe(false)
  })
})

describe('the pending list an admin sees', () => {
  it('shows only this workspace’s live invitations', async () => {
    const mine = await invite()
    await createInvitation({
      orgId: OTHER_ORG,
      email: 'elsewhere@example.com',
      role: 'editor',
      inviterId: INVITER,
    })
    const spent = await invite({ email: 'spent@example.com' })
    await revokeInvitation(ORG, spent)

    const pending = await listPendingInvitations(ORG)

    expect(pending.map((row) => row.id)).toEqual([mine])
  })
})
