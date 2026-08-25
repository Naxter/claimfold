import { cache } from 'react'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { and, asc, eq } from 'drizzle-orm'

import { db, schema } from '@claimfold/db'

import { auth } from './auth.ts'

/**
 * Resolving "which organization is this request acting as".
 *
 * This is the most security-sensitive function in the web app. Every
 * tenant-scoped query downstream trusts the org id it returns, and row-level
 * security will faithfully enforce access to whatever org it is handed. RLS
 * protects against a forgotten WHERE clause; it cannot protect against being
 * told the wrong tenant in the first place.
 *
 * So membership is verified on every request rather than trusted from the
 * session cookie. `activeOrganizationId` is user-influenceable state, and a
 * stale or tampered value must not become access.
 */

export interface ActiveSession {
  userId: string
  email: string
  name: string
  orgId: string
  orgName: string
  role: string
}

/**
 * Signed out, signed in with nowhere to be, or fully resolved.
 *
 * The middle case used to be folded into the first, and that cost a person
 * their account. An invitee signs up, which deliberately does NOT create a
 * workspace — theirs comes from the invitation — and if the redemption then
 * does not happen (an expired token, a revoked one, or simply closing the tab)
 * they hold a session with no membership. `null` sent them to `/sign-in`, where
 * signing in succeeded and returned them to `/`, which sent them to `/sign-in`.
 * A loop, on a screen that told them nothing, with no way out but the original
 * invitation link.
 *
 * The same state is reachable without any invitation: the first user on a fresh
 * install creates their workspace in a second call after sign-up, and anything
 * that interrupts between the two leaves the operator locked out of their own
 * box.
 *
 * So the distinction is carried rather than collapsed, and `/no-workspace`
 * handles the middle.
 */
export type SessionState =
  | { kind: 'anonymous' }
  | { kind: 'orgless'; userId: string; email: string; name: string }
  | { kind: 'active'; session: ActiveSession }

/**
 * Wrapped in React's `cache`, so this runs ONCE per request no matter how many
 * times it is called. It is called a lot: every page calls `requireSession`,
 * `can()` reads the result, and the review page reaches it through several
 * independent paths — each of which was doing a Better Auth lookup plus a
 * member↔organization join. On the heaviest page in the app that was the same
 * two queries repeated for a value that cannot change mid-request.
 *
 * `cache` is per-request and per-render, not a shared or timed cache: two
 * concurrent requests never see each other's session, which is the property
 * that makes this safe to apply to the most security-sensitive function here.
 * Nothing about the membership check is skipped — it just is not repeated.
 */
export const resolveSession = cache(async (): Promise<SessionState> => {
  const result = await auth.api.getSession({ headers: await headers() })
  if (!result?.user) return { kind: 'anonymous' }

  const userId = result.user.id
  const requested = result.session?.activeOrganizationId ?? null

  // Verify membership rather than trusting the session's stored org id.
  const memberships = await db
    .select({
      orgId: schema.member.organizationId,
      role: schema.member.role,
      orgName: schema.organization.name,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(
      requested
        ? and(eq(schema.member.userId, userId), eq(schema.member.organizationId, requested))
        : eq(schema.member.userId, userId),
    )
    // A missing active organization can happen in an older session. Choose the
    // oldest membership deterministically until the person selects one, never
    // whichever row the database happened to return first.
    .orderBy(asc(schema.member.createdAt))
    .limit(1)

  const membership = memberships[0]
  if (!membership) {
    /*
      Either the user belongs to nothing yet, or the session names an org they
      are not a member of. Still never "pick another" — being removed from the
      workspace you were last in must not silently drop you into a different
      one. But it is no longer "you are a stranger" either: the person is
      authenticated, and `/no-workspace` can tell them which of the two it is
      and offer the way out. That page is also how someone removed from their
      active workspace reaches the switcher again, which lives inside the shell
      they can no longer render.
    */
    return {
      kind: 'orgless',
      userId,
      email: result.user.email,
      name: result.user.name,
    }
  }

  return {
    kind: 'active',
    session: {
      userId,
      email: result.user.email,
      name: result.user.name,
      orgId: membership.orgId,
      orgName: membership.orgName,
      role: membership.role,
    },
  }
})

/**
 * Returns null when signed out or without a usable organization.
 *
 * Kept because most callers genuinely only need "is there a tenant context",
 * and collapsing the two failures is right for them. Anything that has to act
 * differently on the two — which is the page redirects, and only them — reads
 * `resolveSession` instead.
 */
export async function getActiveSession(): Promise<ActiveSession | null> {
  const state = await resolveSession()
  return state.kind === 'active' ? state.session : null
}

/** Where a signed-in person with no usable workspace is sent. */
export const NO_WORKSPACE_PATH = '/no-workspace'

/** Same, but redirects instead of returning null. For pages. */
export async function requireSession(): Promise<ActiveSession> {
  const state = await resolveSession()
  if (state.kind === 'active') return state.session

  // Signing in again cannot fix a missing membership, so sending an orgless
  // person to the sign-in screen is the loop this distinction exists to break.
  redirect(state.kind === 'orgless' ? NO_WORKSPACE_PATH : '/sign-in')
}

/** For route handlers, which should answer 401 rather than redirect. */
export async function requireSessionOr401(): Promise<ActiveSession | Response> {
  const session = await getActiveSession()
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthenticated' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }
  return session
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response
}
