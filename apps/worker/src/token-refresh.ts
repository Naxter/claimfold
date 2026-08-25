import { and, lte, eq } from 'drizzle-orm'

import { decryptSecret, encryptSecret, redact } from '@claimfold/crypto'
import { igAccounts, withOrg, withoutTenantScope } from '@claimfold/db'
import { refreshLongLivedToken } from '@claimfold/ig'

/**
 * Keeping Instagram tokens alive.
 *
 * Long-lived tokens last 60 days and can only be refreshed while still valid
 * and at least 24 hours old. Miss that window and there is no recovery — the
 * operator must go through consent again, and any scheduled posts fail
 * meanwhile. So refreshing happens with weeks to spare, not days.
 *
 * A refresh restarts the 60 days from now, so running this daily keeps a token
 * alive indefinitely as long as the install is up.
 */

/** Refresh once a token is inside this window of expiring. */
const REFRESH_WHEN_WITHIN_DAYS = 20

/** Flag in the dashboard before it becomes an outage. */
const WARN_WHEN_WITHIN_DAYS = 7

export interface RefreshOutcome {
  accountId: string
  username: string
  status: 'refreshed' | 'warned' | 'expired' | 'error'
  detail?: string
}

export async function refreshExpiringTokens(now = new Date()): Promise<RefreshOutcome[]> {
  const threshold = new Date(now.getTime() + REFRESH_WHEN_WITHIN_DAYS * 86_400_000)

  const due = await withoutTenantScope(async (tx) => {
    return tx
      .select({
        id: igAccounts.id,
        orgId: igAccounts.orgId,
        username: igAccounts.username,
        encryptedToken: igAccounts.encryptedToken,
        tokenExpiresAt: igAccounts.tokenExpiresAt,
        lastRefreshedAt: igAccounts.lastRefreshedAt,
        status: igAccounts.status,
      })
      .from(igAccounts)
      .where(and(lte(igAccounts.tokenExpiresAt, threshold)))
      .limit(100)
  })

  const outcomes: RefreshOutcome[] = []

  for (const account of due) {
    // Already dead. Nothing to refresh; the operator must reconnect.
    if (account.tokenExpiresAt <= now) {
      await setStatus(account.orgId, account.id, 'token_expired', 'Token expired. Reconnect the account.')
      outcomes.push({ accountId: account.id, username: account.username, status: 'expired' })
      continue
    }

    // The API refuses to refresh a token younger than 24 hours. Warn rather
    // than churn: a freshly-issued token is not at risk anyway.
    const refreshedRecently =
      account.lastRefreshedAt && now.getTime() - account.lastRefreshedAt.getTime() < 86_400_000
    if (refreshedRecently) continue

    try {
      const current = decryptSecret(account.encryptedToken, 'ig_access_token', account.orgId)
      const refreshed = await refreshLongLivedToken(current)

      await withOrg(account.orgId, async (tx) => {
        await tx
          .update(igAccounts)
          .set({
            encryptedToken: encryptSecret(
              refreshed.accessToken,
              'ig_access_token',
              account.orgId,
            ),
            tokenExpiresAt: refreshed.expiresAt,
            lastRefreshedAt: now,
            status: 'connected',
            lastError: null,
            updatedAt: now,
          })
          .where(eq(igAccounts.id, account.id))
      })

      outcomes.push({ accountId: account.id, username: account.username, status: 'refreshed' })
    } catch (error) {
      const detail = redact(error instanceof Error ? error.message : String(error))
      const daysLeft = (account.tokenExpiresAt.getTime() - now.getTime()) / 86_400_000

      await setStatus(
        account.orgId,
        account.id,
        daysLeft <= WARN_WHEN_WITHIN_DAYS ? 'token_expiring' : 'error',
        detail,
      )

      outcomes.push({
        accountId: account.id,
        username: account.username,
        status: daysLeft <= WARN_WHEN_WITHIN_DAYS ? 'warned' : 'error',
        detail,
      })
    }
  }

  return outcomes
}

async function setStatus(
  orgId: string,
  accountId: string,
  status: 'connected' | 'token_expiring' | 'token_expired' | 'error' | 'disconnected',
  lastError: string | null,
): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx
      .update(igAccounts)
      .set({ status, lastError, updatedAt: new Date() })
      .where(eq(igAccounts.id, accountId))
  })
}
