import { deleteAssetRows, findOrphanedRenderAssets, purgeFinishedJobs } from '@claimfold/db'
import { deleteSlideImage } from '@claimfold/storage'
import { pruneTrendsCache } from '@claimfold/trends'

/**
 * The delete path nothing had.
 *
 * Three things grew without bound and none of them had an owner:
 *
 *  - **Rendered slides.** A copy edit nulls `renderHash`/`assetId`, and the next
 *    publish writes a fresh content-hashed JPEG plus a new `assets` row. The old
 *    pair was referenced by nothing and deleted by nothing, so every edit leaked
 *    a file and a row per slide, permanently.
 *  - **Job rows.** The fastest-growing table in the schema, carrying a full
 *    `payload` jsonb, with no delete path at all.
 *  - **The trends HTTP cache.** Keys embed dates and phrases, expired entries
 *    were detected and ignored rather than unlinked, so the file count grew with
 *    every distinct phrase across every run — on a disk a self-hoster pays for.
 *
 * Runs on the worker's maintenance tick because it is the only process that is
 * reliably awake. Deliberately bounded per sweep: a first run on an install
 * that has been leaking for a year should not hold a transaction open for
 * minutes.
 *
 * `RETENTION_DAYS=0` disables the sweep entirely, for operators who would rather
 * manage this themselves.
 */

export interface RetentionOutcome {
  assets: number
  jobs: number
  cacheFiles: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function retentionMs(): number {
  const days = Number(process.env.RETENTION_DAYS ?? 30)
  if (!Number.isFinite(days) || days < 0) return 30 * DAY_MS
  return days * DAY_MS
}

export async function runRetention(): Promise<RetentionOutcome> {
  const window = retentionMs()
  const outcome: RetentionOutcome = { assets: 0, jobs: 0, cacheFiles: 0 }

  if (window === 0) return outcome

  /*
    Files first, rows second.

    The reverse order loses the path — an orphaned row is recoverable, an
    orphaned file on a disk nobody is indexing is not. A file deleted whose row
    then survives a crash is simply picked up again on the next sweep, because
    the row is still orphaned.
  */
  const orphans = await findOrphanedRenderAssets(window)
  const deleted: string[] = []

  for (const orphan of orphans) {
    try {
      await deleteSlideImage(orphan.path)
      deleted.push(orphan.id)
    } catch {
      // Leave the row. Next sweep retries, and the row is the only record of
      // which file to remove.
    }
  }

  outcome.assets = await deleteAssetRows(deleted)
  outcome.jobs = await purgeFinishedJobs(window)
  outcome.cacheFiles = await pruneTrendsCache()

  return outcome
}
