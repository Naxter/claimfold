import { eq } from 'drizzle-orm'

import { needsAttention, tierFor, verifyLicense, type LicenseStatus } from '@claimfold/crypto'
import { db, organization } from '@claimfold/db'

/**
 * The licence, as this process sees it.
 *
 * Verified once and remembered, because `LICENSE_KEY` is read from the
 * environment and cannot change while the process lives. Ed25519 verification is
 * microseconds, so this is not really about speed — it is so the answer cannot
 * differ between two renders of the same page.
 *
 * NOTHING IS GATED ON THIS. It drives one banner. Enforcing tiers is a pricing
 * decision, and a half-built gate that locks an operator out of their own
 * workspace would be worse than the honest banner this replaces nothing with.
 */

let cached: LicenseStatus | null = null

export function licenseStatus(): LicenseStatus {
  cached ??= verifyLicense(process.env['LICENSE_KEY'] ?? '')
  return cached
}

/**
 * Keep `organization.licenseTier` in step with the key.
 *
 * The column's own comment has always said it is "cached from the licence key at
 * boot", and nothing ever wrote it. There is no boot hook in a Next app, so it is
 * synced from the settings page — the one screen where somebody is looking at
 * licence state anyway — rather than on every request, which would be a database
 * write per page view for a value that changes when a process restarts.
 *
 * Written only when it differs, so the common case is a read.
 */
export async function syncLicenseTier(orgId: string): Promise<void> {
  const tier = tierFor(licenseStatus())

  const [row] = await db
    .select({ tier: organization.licenseTier })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1)

  if (row && row.tier !== tier) {
    await db.update(organization).set({ licenseTier: tier }).where(eq(organization.id, orgId))
  }
}

/** Whether the banner should appear at all. */
export function licenseNeedsAttention(): boolean {
  return needsAttention(licenseStatus())
}

export { tierFor }
