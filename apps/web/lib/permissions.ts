import type { ActiveSession } from './session.ts'

/**
 * What each role may do.
 *
 * `member.role` has been resolved into every session since sessions existed, and
 * `rg "session.role"` found **zero** references anywhere in the product. So the
 * four roles were decoration: a member stored as `viewer` could approve a post,
 * override a claim verdict and schedule a publish to a real audience. The enum,
 * the column and the field were all there; nothing ever asked.
 *
 * Three capabilities rather than one per action, because the interesting line is
 * not "which button" but "what kind of harm":
 *
 * - `publish` — anything that can put something in front of an audience, or take
 *   editorial responsibility for it. Approving, rejecting, overriding a claim
 *   verdict, changing which account a post goes to. Irreversible and outward
 *   facing.
 * - `edit` — changing content and configuration. Recoverable, and visible to
 *   whoever approves afterwards.
 * - `read` — everyone with a membership.
 *
 * A `viewer` gets `read` only, which is what the word means. An `editor` can
 * write and generate but not sign off — the useful shape for a freelancer or an
 * agency's junior. `admin` and `owner` can do everything.
 *
 * Enforced in the server actions, never only in the interface. A hidden button is
 * a courtesy; a server action is a public endpoint.
 */

export type Capability = 'read' | 'edit' | 'publish'

const CAPABILITIES: Record<string, Capability[]> = {
  owner: ['read', 'edit', 'publish'],
  admin: ['read', 'edit', 'publish'],
  editor: ['read', 'edit'],
  viewer: ['read'],
}

/**
 * Unknown roles get read only.
 *
 * Better Auth's organization plugin lets a role string be anything, and this
 * install's own `memberRole` enum could gain a value before this map does. An
 * unrecognised role must therefore fail closed — the same reasoning as the gate
 * refusing a post whose channel will not validate: not knowing the rules is not
 * the same as there being none.
 */
export function can(session: Pick<ActiveSession, 'role'>, capability: Capability): boolean {
  return (CAPABILITIES[session.role] ?? ['read']).includes(capability)
}

/**
 * True when this member may look but not change.
 *
 * Kept because the interface needs the question answered in one word; `can` is
 * what every enforcement site calls.
 */
export function isReadOnly(session: Pick<ActiveSession, 'role'>): boolean {
  return !can(session, 'edit')
}

/*
  Removed: `requireCapability`, `NotPermittedError` and `requireReadableSession`.

  All three were exported, none was ever called — every page and action uses
  `requireSession` plus `can`. Guards that look deployed and are not are worse
  than no guards: the next person adding an action reads this file, sees a
  ready-made enforcement helper, and reasonably assumes the codebase's
  convention is to use it — when the actual convention, and the one ADR 0005
  documents, is the explicit `can(session, ...)` check at the top of the action.

  `requireReadableSession` was also misleading in a second way: it redirected a
  member without `read`, and every role has `read`, so it could never redirect
  anybody.
*/
