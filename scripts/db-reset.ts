import { execFileSync } from 'node:child_process'
import { existsSync, renameSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `npm run db:reset`
 *
 * Moves the embedded development database aside and rebuilds it.
 *
 * Why this exists: PGlite is Postgres compiled to WASM, and it does not
 * survive being killed mid-write. Stop the dev server with Ctrl+C and it is
 * fine; kill the process (task manager, a hard reboot, `Stop-Process -Force`)
 * and the data directory can be left unrecoverable. The symptom is a fifty-line
 * WASM stack trace ending in `_pg_initdb`, which tells a developer nothing
 * about what to do next.
 *
 * The directory is renamed rather than deleted. It is throwaway development
 * data, but "the tool deleted my database" is not a sentence anyone should
 * read about their own machine — and if it turns out something in there was
 * wanted, it is still on disk.
 *
 * Refuses to touch a real Postgres. Losing dev data is an inconvenience;
 * losing production data because a reset script was not fussy is not.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(resolve(repoRoot, '.env'))) process.loadEnvFile(resolve(repoRoot, '.env'))

const url = process.env.DATABASE_URL ?? ''

if (!url.startsWith('pglite://')) {
  console.error(
    `DATABASE_URL is "${url.split('@').pop() ?? url}", which is not an embedded database.\n\n` +
      'This script only resets the local PGlite directory used for development.\n' +
      'To reset a real Postgres, drop and recreate the database yourself.',
  )
  process.exit(1)
}

const dir = resolve(repoRoot, url.slice('pglite://'.length))

if (existsSync(dir)) {
  // Seconds are enough — nobody resets twice in the same second, and a full
  // ISO timestamp with colons is not a legal path component on Windows.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const archived = `${dir}-old-${stamp}`
  renameSync(dir, archived)
  console.log(`Moved the old database to ${archived}`)
} else {
  console.log('No existing database directory — creating a fresh one.')
}

// A fresh process per step, rather than importing the scripts: both open the
// database at module load, and this one has already decided the directory is
// gone.
//
// Spawned as `node <tsx-cli> <script>` rather than through npm. Running
// `npm.cmd` on Windows needs `shell: true`, which Node now warns about
// (DEP0190) because arguments are concatenated rather than escaped. This also
// drops the dependency on npm being on PATH.
const tsx = createRequire(import.meta.url).resolve('tsx/cli')

const run = (script: string) =>
  execFileSync(process.execPath, [tsx, resolve(repoRoot, script)], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

console.log('\nApplying migrations…')
run('packages/db/src/migrate.ts')

if (!process.argv.includes('--no-seed')) {
  console.log('\nSeeding…')
  run('scripts/seed-dev.ts')
}

console.log('\nDone.')
