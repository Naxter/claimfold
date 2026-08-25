import { generateKeyPairSync } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * `npm run license:keygen`
 *
 * Creates the vendor's Ed25519 signing pair, once, on the machine that will
 * issue licence keys.
 *
 * The private half never belongs in this repository, so it is written to a
 * gitignored file rather than printed — a key pasted into a terminal ends up in
 * shell history and in whatever scrollback the terminal keeps. The public half is
 * printed, because it is meant to be committed: baking it into the build is what
 * lets a customer's install verify a key with no network at all.
 *
 * Refuses to overwrite an existing key. Regenerating would silently invalidate
 * every licence already issued, and that is not something to do by mistake.
 */

const KEY_FILE = resolve(process.cwd(), '.license-signing-key.json')

if (existsSync(KEY_FILE)) {
  console.error(`\n  ${KEY_FILE} already exists.\n`)
  console.error('  Regenerating would invalidate every licence key already issued.')
  console.error('  Delete it deliberately if that is really what you want.\n')
  process.exit(1)
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519')

const raw = publicKey.export({ format: 'der', type: 'spki' })
// The last 32 bytes of an SPKI Ed25519 key are the key itself; the 12-byte
// prefix is fixed and is re-added when verifying.
const publicRaw = raw.subarray(raw.length - 32).toString('base64')

writeFileSync(
  KEY_FILE,
  JSON.stringify(
    {
      note: 'Claimfold licence signing key. Keep this secret and out of git.',
      createdAt: new Date().toISOString(),
      privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      publicKeyBase64: publicRaw,
    },
    null,
    2,
  ),
  { mode: 0o600 },
)

console.log(`\n  Signing key written to ${KEY_FILE} (keep it secret, it is gitignored).\n`)
console.log('  Put this in the environment of every build you ship:\n')
console.log(`    LICENSE_PUBLIC_KEY=${publicRaw}\n`)
console.log('  Then issue a key with:  npm run license:sign -- --tier solo --to "Acme GmbH"\n')
