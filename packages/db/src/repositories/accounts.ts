import { asc, eq } from 'drizzle-orm'

import { withOrg } from '../rls.ts'
import { igAccounts, niches } from '../schema/index.ts'

/**
 * Tenant-scoped reads over connected Instagram accounts.
 *
 * Deliberately read-only and deliberately narrow. Writing to this table means
 * handling encrypted tokens and per-organization Meta app secrets, which the
 * OAuth routes already do with the care that requires; nothing else should be
 * able to. What was missing was the ability to *ask* which accounts exist, which
 * is what binding a channel to one needs.
 *
 * Never returns a token or a secret. The two encrypted columns are excluded from
 * every projection here on purpose — a helper that returned them would eventually
 * be called from something that logs its arguments.
 */

/** An account as the interface needs to talk about one. */
export interface AccountSummary {
  id: string
  username: string
  igUserId: string
  status: string
  tokenExpiresAt: Date
}

const SUMMARY = {
  id: igAccounts.id,
  username: igAccounts.username,
  igUserId: igAccounts.igUserId,
  status: igAccounts.status,
  tokenExpiresAt: igAccounts.tokenExpiresAt,
}

/**
 * Every account in the workspace, in a stable order.
 *
 * Ordered by username so a picker does not reshuffle itself between page loads,
 * which is the sort of thing that makes somebody choose the wrong entry.
 * Includes accounts that are not `connected`: a picker that silently hides a
 * broken account is a picker that cannot explain why publishing stopped.
 */
export async function listAccounts(orgId: string): Promise<AccountSummary[]> {
  return withOrg(orgId, async (tx) => {
    return tx.select(SUMMARY).from(igAccounts).orderBy(asc(igAccounts.username))
  })
}

/** One account by id, or null. Used to check what a channel points at. */
export async function getAccount(
  orgId: string,
  accountId: string,
): Promise<AccountSummary | null> {
  return withOrg(orgId, async (tx) => {
    const [row] = await tx.select(SUMMARY).from(igAccounts).where(eq(igAccounts.id, accountId)).limit(1)
    return row ?? null
  })
}

/**
 * The account to give a new channel when there is no choice to make.
 *
 * Returns an id only when the workspace has exactly ONE connected account. With
 * none there is nothing to pick, and with several picking for somebody would be
 * guessing — which is the thing the publish worker refuses to do, for the good
 * reason that the wrong guess publishes to the wrong audience under a real name.
 */
/**
 * Which channels publish to this account.
 *
 * `niches.ig_account_id` is `ON DELETE set null`, so removing an account — via
 * Meta's data-deletion callback, the only path that deletes one — silently
 * leaves every channel pointing at it unpublishable. The failure then surfaces
 * per post, at scheduled publish time, as "no connected account is resolved",
 * which is a long way from the action that caused it.
 *
 * `restrict` would fail at the right moment but make the deletion callback
 * impossible to satisfy, and Meta's deletion request is not optional. So the
 * dependency is surfaced instead: the interface names the channels while the
 * operator is looking at the account, before anything happens to it.
 */
export async function channelsUsingAccount(
  orgId: string,
  accountId: string,
): Promise<{ id: string; name: string }[]> {
  return withOrg(orgId, async (tx) =>
    tx
      .select({ id: niches.id, name: niches.name })
      .from(niches)
      .where(eq(niches.igAccountId, accountId))
      .orderBy(niches.name),
  )
}

export async function soleConnectedAccountId(orgId: string): Promise<string | null> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({ id: igAccounts.id })
      .from(igAccounts)
      .where(eq(igAccounts.status, 'connected'))
      .limit(2)

    return rows.length === 1 ? rows[0]!.id : null
  })
}
