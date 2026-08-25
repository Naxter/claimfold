import { eq } from 'drizzle-orm'

import { igAccounts, withOrg } from '@claimfold/db'
import { describePublicUrl, publicUrlIsPublishable } from '@claimfold/storage'

import { readAppUrl } from './app-url.ts'

/**
 * The state both the settings page and the setup wizard render from.
 *
 * Shared deliberately: the wizard's last step and the settings page answer the
 * same question — "can this install publish?" — and two copies of that answer
 * would eventually disagree. The one that disagrees silently is the one a
 * buyer trusts right before a publish fails.
 */

/**
 * The redirect URI Meta must have registered, built the same way the connect
 * route builds it.
 *
 * The fallback matters: `APP_URL` is unset on a fresh checkout, and a wizard
 * that renders `undefined/api/instagram/callback` teaches the operator to
 * register a broken value. Falling back to the dev port shows something
 * plausible, and `redirectUriIsLocal` flags that it will not survive to
 * production.
 */
export function redirectUri(): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3100').replace(/\/+$/, '')
  return `${base}/api/instagram/callback`
}

/** True while the redirect URI still points at a machine only you can reach. */
export function redirectUriIsLocal(): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(redirectUri())
}

/**
 * The other two URLs Meta demands, which the wizard never mentioned.
 *
 * Both are REQUIRED fields on a Meta app configuration — an operator cannot
 * finish setting one up without pasting something into them — and the wizard
 * showed only the redirect URI. Someone following it exactly reached Meta's
 * form, found two boxes nobody had told them about, and either invented values
 * or stopped.
 *
 * Built the same way and from the same base as `redirectUri`, so all three
 * agree or all three are wrong together.
 */
export function deauthorizeUri(): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3100').replace(/\/+$/, '')
  return `${base}/api/instagram/deauthorize`
}

export function dataDeletionUri(): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3100').replace(/\/+$/, '')
  return `${base}/api/instagram/data-deletion`
}

/**
 * A public origin is needed twice: Instagram redirects the person back to it,
 * and the worker needs to be running when a scheduled post is due. This is a
 * configuration preflight, not a claim that Meta can reach the host from its
 * own network; the live-canary runbook covers that final external check.
 */
export function appUrlIsPublishable(
  env: Record<string, string | undefined> = process.env,
): { ok: boolean; reason?: string } {
  // Same predicate as the asset URL, deliberately. These two are read side by
  // side on the settings screen, and they used to carry separate copies of the
  // private-range list that had already drifted apart: this one knew about
  // Docker's 172.16/12 bridge and the asset one did not, so one address could
  // be green and red at the same time on the same panel.
  const result = describePublicUrl(readAppUrl(env))
  if (result.ok) return { ok: true }

  return {
    ok: false,
    reason: {
      // `readAppUrl` always returns a default, so 'missing' is unreachable
      // here. Handled rather than assumed away — the default is one edit from
      // being removed, and a silent `undefined` reason would read as passing.
      missing: 'APP_URL is not set',
      unparseable: 'APP_URL is not a valid URL',
      // Not "outside local development": this check refuses http *during* local
      // development too, which is correct — you cannot publish from a laptop —
      // and a message naming an exception the code does not make sends the
      // operator looking for a setting that would grant it.
      not_https: 'APP_URL must be a public HTTPS address before Instagram can redirect back to it',
      private:
        'APP_URL points at an address reachable only from this machine or network. ' +
        'Instagram redirects the browser here, so it must resolve from the public internet.',
    }[result.problem],
  }
}

export interface ReadinessState {
  /** Whether Meta can in principle redirect to a public, HTTPS app origin. */
  appUrl: ReturnType<typeof appUrlIsPublishable>
  /** The connected account, or null if consent has never completed. */
  account: { id: string; username: string; igUserId: string; tokenExpiresAt: Date } | null
  /** Whole days until the access token expires; null when there is no token. */
  daysLeft: number | null
  /** Whether slide images sit on an address Instagram's servers can fetch. */
  asset: ReturnType<typeof publicUrlIsPublishable>
}

/**
 * Read every publish precondition in one place.
 *
 * Only `status = 'connected'` counts. The connect route writes a placeholder
 * row with status `disconnected` before sending the operator to Meta, so a row
 * existing is not the same as a connection working — treating it as one would
 * put a green tick on a half-finished flow.
 */
export async function loadReadiness(orgId: string): Promise<ReadinessState> {
  const account = await withOrg(orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(igAccounts)
      .where(eq(igAccounts.status, 'connected'))
      .limit(1)
    return rows[0] ?? null
  })

  return {
    appUrl: appUrlIsPublishable(),
    account: account
      ? {
          id: account.id,
          username: account.username,
          igUserId: account.igUserId,
          tokenExpiresAt: account.tokenExpiresAt,
        }
      : null,
    daysLeft: account
      ? Math.floor((account.tokenExpiresAt.getTime() - Date.now()) / 86_400_000)
      : null,
    asset: publicUrlIsPublishable(),
  }
}

/** A token is healthy while there is comfortably more than one refresh cycle left. */
export function tokenIsHealthy(daysLeft: number | null): boolean {
  return daysLeft !== null && daysLeft > 7
}

/** Everything green — the install can publish. */
export function canPublish(state: ReadinessState): boolean {
  return state.appUrl.ok && state.asset.ok && state.account !== null && tokenIsHealthy(state.daysLeft)
}
