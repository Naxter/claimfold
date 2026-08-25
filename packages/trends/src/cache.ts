import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/**
 * A TTL cache on disk.
 *
 * On disk rather than in memory because the useful lifetimes here are long:
 * a month of pageview history does not change once the month is over, and
 * re-fetching it on every dev-server restart is rude to a free service run by
 * a charity. Wikimedia asks for exactly this kind of restraint in its API
 * etiquette, and the rate limiter enforces the rest.
 *
 * No dependency and no database table: this is public data, identical for
 * every tenant, and losing it costs one refetch. Putting it in Postgres would
 * mean a migration and an RLS decision for something that is neither private
 * nor durable.
 */

const ROOT = resolve(process.env.TRENDS_CACHE_DIR ?? join(process.cwd(), 'data', 'trends-cache'))

export const TTL = {
  /** Completed months never change. */
  monthlyHistory: 30 * 24 * 60 * 60 * 1000,
  /** Trending feeds turn over through the day. */
  trends: 6 * 60 * 60 * 1000,
  /** News volume moves slowly enough at a 7-day window. */
  gdelt: 7 * 24 * 60 * 60 * 1000,
  /** Article metadata: references and categories change slowly. */
  articleMetadata: 7 * 24 * 60 * 60 * 1000,
} as const

/** Longest TTL in the table above — the age past which any entry is dead. */
const MAX_TTL = Math.max(...Object.values(TTL))

interface Entry<T> {
  storedAt: number
  ttl: number
  value: T
}

/** Cache keys become filenames, so they are hashed rather than sanitised. */
function pathFor(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex')
  return join(ROOT, hash.slice(0, 2), `${hash}.json`)
}

/**
 * Read, honouring the CURRENT ttl rather than the one stored in the file.
 *
 * The stored value is kept for the prune sweep, but freshness is decided
 * against the live constant: pinning it at write time meant shortening a `TTL.*`
 * value invalidated nothing already on disk, so a fix to a lifetime that turned
 * out to be too long did not take effect until every entry aged out on the old
 * schedule.
 *
 * An expired file is unlinked on the way past. Detecting expiry and leaving the
 * file was how this directory grew forever.
 */
export async function readCache<T>(key: string, ttl?: number): Promise<T | undefined> {
  const file = pathFor(key)

  try {
    const raw = await readFile(file, 'utf8')
    const entry = JSON.parse(raw) as Entry<T>
    const effective = ttl ?? entry.ttl

    if (Date.now() - entry.storedAt > effective) {
      await unlink(file).catch(() => undefined)
      return undefined
    }

    return entry.value
  } catch {
    // A miss, a corrupt file and an unreadable directory are all "fetch it
    // again". Nothing here is worth failing a discovery run over.
    return undefined
  }
}

export async function writeCache<T>(key: string, value: T, ttl: number): Promise<void> {
  const file = pathFor(key)
  const entry: Entry<T> = { storedAt: Date.now(), ttl, value }

  try {
    await mkdir(join(file, '..'), { recursive: true })

    // Write-then-rename. Writing straight to the final path leaves truncated
    // JSON if the process dies mid-write — self-healing, since `readCache`
    // swallows a parse error, but it means a crash silently costs a refetch.
    // `rename` within a directory is atomic.
    const temp = `${file}.${randomUUID()}.tmp`
    await writeFile(temp, JSON.stringify(entry), 'utf8')
    await rename(temp, file).catch(async (error: unknown) => {
      await rm(temp, { force: true })
      throw error
    })
  } catch {
    // Best effort. A read-only disk should slow discovery down, not break it.
  }
}

/**
 * In-flight loads, so two callers asking for the same key fetch once.
 *
 * A discovery run resolves phrases sequentially today, so the stampede this
 * prevents is rare — but it is free, and the cost of getting it wrong is a
 * duplicate request against a rate limit shared with every other tenant.
 */
const inFlight = new Map<string, Promise<unknown>>()

/** Fetch through the cache. */
export async function withCache<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = await readCache<T>(key, ttl)
  if (hit !== undefined) return hit

  const existing = inFlight.get(key) as Promise<T> | undefined
  if (existing) return existing

  const pending = (async () => {
    const value = await load()
    await writeCache(key, value, ttl)
    return value
  })()

  inFlight.set(key, pending)
  try {
    return await pending
  } finally {
    inFlight.delete(key)
  }
}

/**
 * Delete entries that can no longer be served.
 *
 * Called from the worker's retention tick. Judges by file mtime against the
 * longest TTL in the table rather than by parsing every file — a sweep that has
 * to JSON.parse a directory of tens of thousands of entries is one an operator
 * notices.
 *
 * @returns how many files were removed.
 */
export async function pruneTrendsCache(): Promise<number> {
  const cutoff = Date.now() - MAX_TTL
  let removed = 0

  let shards: string[]
  try {
    shards = await readdir(ROOT)
  } catch {
    // No cache directory yet is not a failure.
    return 0
  }

  for (const shard of shards) {
    const dir = join(ROOT, shard)

    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      continue
    }

    for (const name of files) {
      const file = join(dir, name)
      try {
        const info = await stat(file)
        if (info.mtimeMs < cutoff) {
          await unlink(file)
          removed += 1
        }
      } catch {
        // Raced with another sweep or a live write. Next time.
      }
    }
  }

  return removed
}

export { ROOT as TRENDS_CACHE_ROOT }
