import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
  Load the repo-root `.env`, the same way every other script here does.

  Omitting this is why the first run of this script reported "DATABASE_URL is
  not set; nothing to back up" on a perfectly configured install — the value
  lives in `.env`, not in the shell. A backup tool that quietly declines to back
  anything up is worse than one that is missing.
*/
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(resolve(repoRoot, '.env'))) process.loadEnvFile(resolve(repoRoot, '.env'))

/**
 * Back up everything an install cannot regenerate.
 *
 * There was no backup path and no mention of one. `pgdata` and `storage` were
 * anonymous Docker volumes, which is the shape people lose: `docker compose
 * down -v` is a normal thing to type and it takes both.
 *
 * Two things matter and they must be taken TOGETHER, in this order:
 *
 *  - **The database.** Posts, the claims that justify them, and the encrypted
 *    Instagram tokens.
 *  - **The storage directory.** Rendered JPEGs and uploaded pictures. Renders
 *    are reproducible in principle; uploads are not, and a published post whose
 *    image is gone cannot be re-rendered identically because the upload it
 *    embedded no longer exists.
 *
 * Database first, then files: a file written after the dump is harmless
 * (an asset row will simply be missing and the retention sweep collects it),
 * whereas a row written after the files were copied points at a JPEG the backup
 * does not contain.
 *
 * **What this does NOT protect you from.** `ENCRYPTION_KEY` is not in here, and
 * must not be — a backup containing both the encrypted tokens and the key that
 * opens them is a single file that compromises every connected account. Keep
 * the key in a password manager. Without it, restoring this backup gives you
 * every post and every channel, and every Instagram account has to reconnect.
 *
 * Usage:
 *   npm run backup                 # writes ./backups/<timestamp>/
 *   npm run backup -- /mnt/nas     # somewhere that is not this disk
 */

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function main(): void {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) fail('DATABASE_URL is not set; nothing to back up.')

  const storageDir = resolve(process.env.STORAGE_DIR ?? 'storage')

  // Passed in rather than derived, because `new Date()` in a filename is the
  // one thing that makes two runs collide when a script is retried.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const destination = resolve(process.argv[2] ?? 'backups', stamp)

  mkdirSync(destination, { recursive: true })

  /*
    Which shape this backup is, and so which restore instructions belong in
    its README. They used to be the Postgres ones unconditionally, so every
    development backup shipped with a pg_restore command that cannot read
    it and no mention of the one that can.
  */
  const isPglite = databaseUrl.startsWith('pglite://')

  // ── Database ──────────────────────────────────────────────────────────────
  if (databaseUrl.startsWith('pglite://')) {
    /*
      PGlite is a directory, and there is no pg_dump for it. Copying it is only
      safe while nothing else has it open — which is the same rule that governs
      running the dev server and a script at the same time, and the same way
      this database gets corrupted.
    */
    const source = resolve(databaseUrl.replace('pglite://', ''))
    if (!existsSync(source)) fail(`Embedded database not found at ${source}`)

    console.log('Copying the embedded database. Stop the dev server first if it is running.')
    cpSync(source, resolve(destination, 'pglite'), { recursive: true })
  } else {
    console.log('Dumping Postgres…')
    try {
      // `--format=custom` so `pg_restore` can be selective, and because it
      // compresses. Written by pg_dump directly rather than through a shell
      // pipe, so a failure is an exit code rather than a truncated file.
      execFileSync(
        'pg_dump',
        ['--format=custom', '--no-owner', '--no-privileges', '--file', resolve(destination, 'database.dump'), databaseUrl],
        { stdio: 'inherit' },
      )
    } catch {
      fail(
        'pg_dump failed. It must be on PATH and its major version must be at least the ' +
          "server's. With the Docker install:\n" +
          '  docker compose exec -T postgres pg_dump -U claimfold -Fc claimfold > database.dump',
      )
    }
  }

  // ── Files ─────────────────────────────────────────────────────────────────
  if (existsSync(storageDir)) {
    console.log('Copying rendered slides and uploads…')
    cpSync(storageDir, resolve(destination, 'storage'), { recursive: true })
  } else {
    console.log(`No storage directory at ${storageDir}; skipping.`)
  }

  // A note to whoever finds this in a year, including you.
  writeFileSync(
    resolve(destination, 'README.txt'),
    [
      `Claimfold backup — ${stamp}`,
      '',
      'Contents:',
      isPglite ? '  pglite/                   the database' : '  database.dump             the database',
      '  storage/                  rendered slides and uploaded pictures',
      '',
      'NOT included: ENCRYPTION_KEY and AUTH_SECRET.',
      'Without ENCRYPTION_KEY the stored Instagram tokens cannot be decrypted and',
      'every account must reconnect. Everything else restores.',
      '',
      ...(isPglite
        ? [
            'Restore (development, embedded database):',
            '  1. Stop the dev server. PGlite is single-connection, and a second',
            '     process on the same directory is how it gets corrupted.',
            '  2. Move the current data directory aside rather than deleting it:',
            '       mv data/dev data/dev.before-restore',
            '  3. Put this backup in its place:',
            '       cp -r pglite data/dev',
            '  4. Start the dev server. If it comes up and the board loads, the',
            '     restore worked and data/dev.before-restore can go.',
            '',
            'There is no database.dump here: pg_dump does not run against',
            'PGlite, so the directory itself is the backup and the pg_restore',
            'route below applies only to a Postgres install.',
            '',
          ]
        : []),
      'Restore (Docker install, real Postgres):',
      '  docker compose up -d postgres',
      '  cat database.dump | docker compose exec -T postgres pg_restore -U claimfold -d claimfold --clean --if-exists',
      '  docker compose run --rm -v "$PWD/storage:/restore" web cp -a /restore/. /app/storage/',
      '  docker compose up -d',
    ].join('\n'),
    'utf8',
  )

  console.log(`\nDone: ${destination}`)
  console.log('Verify it: a backup nobody has restored is a hypothesis, not a backup.')
}

main()
