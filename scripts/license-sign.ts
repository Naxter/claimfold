import { createPrivateKey, sign } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

import { signedBytes, toBase64Url } from '@claimfold/crypto'

/**
 * `npm run license:sign -- --tier solo --to "Acme GmbH" [--months 12]`
 *
 * Issues one licence key. Vendor-side only: it needs the private half, which
 * lives in the gitignored file `license:keygen` wrote.
 *
 * The payload is deliberately small — an id, a tier, who it is for, and when it
 * runs out. Nothing about machines or seat counts, because a self-hosted key that
 * is bound to hardware breaks the first time somebody moves their server, and
 * that support ticket costs more than the licence.
 */

const KEY_FILE = resolve(process.cwd(), '.license-signing-key.json')
if (!existsSync(KEY_FILE)) {
  console.error('\n  No signing key. Run: npm run license:keygen\n')
  process.exit(1)
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

const tier = arg('tier')
const licensee = arg('to')
const months = Number(arg('months') ?? 12)

const TIERS = ['evaluation', 'solo', 'studio', 'agency']
if (!tier || !TIERS.includes(tier)) {
  console.error(`\n  --tier must be one of: ${TIERS.join(', ')}\n`)
  process.exit(1)
}
if (!licensee) {
  console.error('\n  --to is required, so a key can be traced to whoever holds it.\n')
  process.exit(1)
}

const now = new Date()

/**
 * `--months 0` means perpetual, which is a real thing to sell.
 *
 * A NEGATIVE number produces a date in the past rather than a perpetual licence.
 * The first version treated anything not greater than zero as perpetual, so
 * `--months -6` — the obvious way to mint an already-expired key for testing —
 * silently produced the opposite of what was asked for.
 */
const expiresAt =
  months === 0
    ? null
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, now.getUTCDate()))
        .toISOString()
        .slice(0, 10)

const payload = {
  id: randomUUID(),
  tier,
  licensee,
  issuedAt: now.toISOString().slice(0, 10),
  expiresAt,
}

const { privateKeyPem } = JSON.parse(readFileSync(KEY_FILE, 'utf8')) as { privateKeyPem: string }
const payloadPart = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'))
const signature = sign(null, signedBytes(payloadPart), createPrivateKey(privateKeyPem))

console.log(`\n  ${licensee} — ${tier}${expiresAt ? `, expires ${expiresAt}` : ', perpetual'}\n`)
console.log(`LICENSE_KEY=CLAIMFOLD-1.${payloadPart}.${toBase64Url(signature)}\n`)
