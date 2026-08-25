import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { LEGACY_POST_STATUSES, REACHABLE_POST_STATUSES, postStatus } from '../schema/enums.ts'

/**
 * The post lifecycle, kept from growing back.
 *
 * `post_status` has eleven values and five of them are unreachable — the enum
 * encodes a state machine that was designed and never built. They cannot be
 * dropped without recreating the type over live data, and `approved` has to
 * stay valid so the worker can rescue old rows.
 *
 * The risk that leaves is that someone reads the enum, reasonably assumes
 * `drafted` is a stage, and writes it — putting posts into a status no column
 * on the board renders and no worker query selects. That is the same class of
 * silent-limbo bug the `approved` hot-loop was: a post that exists, looks fine
 * in the database, and is invisible and unreachable in the product.
 *
 * So the enum is documentation and this is the control.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

/** Source we own, excluding build output and dependencies. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', 'dist', 'drizzle', '__tests__', 'data', 'out'].includes(entry)) {
      continue
    }
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, found)
    else if (/\.tsx?$/.test(path)) found.push(path)
  }
  return found
}

describe('post_status', () => {
  it('accounts for every enum value as either reachable or legacy', () => {
    // Neither list may drift from the enum without this failing.
    const declared = [...postStatus.enumValues].sort()
    const covered = [...REACHABLE_POST_STATUSES, ...LEGACY_POST_STATUSES].sort()

    expect(covered).toEqual(declared)
  })

  it('is never written with a legacy status', () => {
    const files = [
      ...sourceFiles(join(repoRoot, 'packages')),
      ...sourceFiles(join(repoRoot, 'apps')),
    ]

    /*
      Looks for the shape an assignment takes: `status: 'drafted'`. Deliberately
      not a bare search for the word — `findDuePosts` compares against
      `'approved'` on purpose, and the migration rewrites it, and both are
      reads rather than writes.
    */
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const status of LEGACY_POST_STATUSES) {
        const assignment = new RegExp(`status:\\s*['"\`]${status}['"\`]`)
        if (assignment.test(source)) {
          offenders.push(`${file.replace(repoRoot, '')} writes status: '${status}'`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
