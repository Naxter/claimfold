import { licenseStatus } from '../lib/license.server.ts'
import type { Messages } from '../lib/i18n/messages/en.ts'

/**
 * What the licence key says, when it says something worth reading.
 *
 * Silent in the two normal cases: no key at all (evaluation, which is the honest
 * default for a self-hosted install nobody has paid for) and a valid current key.
 * A banner on every screen for a state that is fine is a banner people stop
 * seeing.
 *
 * Three states do get shown, and they are deliberately different:
 *
 * - **expired** — the signature was genuine, the date has passed. Amber, because
 *   this is a renewal conversation, not a fault.
 * - **invalid** — the signature does not match, or the key is not readable. Red,
 *   because either somebody was sold something fake or a paste went wrong, and
 *   both need looking at.
 * - **unverifiable** — a key is set but this build carries no public key to check
 *   it against. Neutral, and phrased as our problem rather than theirs, because
 *   it is: it means the build was shipped without `LICENSE_PUBLIC_KEY`.
 *
 * Nothing is restricted in any of these states. Everything keeps working exactly
 * as it did — the product's own decision doc says the research stage, the gate and
 * the review screen are free forever, and turning limits on is a separate,
 * deliberate change.
 */
export function LicenseBanner({ t }: { t: Messages['license'] }) {
  const status = licenseStatus()

  if (status.state === 'evaluation' || status.state === 'valid') return null

  const tone =
    status.state === 'invalid'
      ? 'border-err bg-err-weak text-err'
      : status.state === 'expired'
        ? 'border-warn bg-warn-weak text-warn'
        : 'border-rule bg-sunken text-muted'

  const message =
    status.state === 'expired'
      ? t.expired(status.payload.licensee, status.payload.expiresAt ?? '')
      : status.state === 'invalid'
        ? t.invalid(status.reason)
        : t.unverifiable

  return (
    <div
      className={`mb-[var(--sp-6)] rounded-[var(--radius-2)] border p-[var(--sp-4)] text-sm ${tone}`}
      role="status"
    >
      <p>{message}</p>
      <p className="mt-1 text-xs opacity-80">{t.nothingRestricted}</p>
    </div>
  )
}
