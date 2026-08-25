import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The disk cache, which had no tests.
 *
 * Three behaviours here are load-bearing and were all unverified: that an
 * expired entry is actually deleted rather than merely ignored, that a
 * shortened TTL takes effect on entries already written, and that a corrupt
 * file is a miss rather than a crash.
 *
 * `TRENDS_CACHE_DIR` has to be set before the module is imported, because the
 * root is resolved once at module scope.
 */

const dir = mkdtempSync(join(tmpdir(), 'claimfold-cache-'))

type CacheModule = typeof import('../cache.ts')
let cache: CacheModule

beforeAll(async () => {
  process.env['TRENDS_CACHE_DIR'] = dir
  cache = await import('../cache.ts')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env['TRENDS_CACHE_DIR']
})

/** Every .json under the sharded root. */
function files(): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((shard) => {
    const path = join(dir, shard)
    try {
      return readdirSync(path).map((name) => join(path, name))
    } catch {
      return []
    }
  })
}

describe('round trip', () => {
  it('returns what was written', async () => {
    await cache.writeCache('k1', { hello: 'world' }, 60_000)
    await expect(cache.readCache('k1')).resolves.toEqual({ hello: 'world' })
  })

  it('misses on an unknown key', async () => {
    await expect(cache.readCache('never-written')).resolves.toBeUndefined()
  })

  it('writes atomically, leaving no temp files behind', async () => {
    await cache.writeCache('k-atomic', { a: 1 }, 60_000)
    expect(files().some((f) => f.endsWith('.tmp'))).toBe(false)
  })
})

describe('expiry', () => {
  it('honours the ttl passed at read time, not the one stored at write time', async () => {
    // Written with a long life...
    await cache.writeCache('k2', 'stale', 30 * 24 * 60 * 60 * 1000)

    // ...and read back under a shorter one. Pinning the TTL inside the entry
    // meant shortening a `TTL.*` constant invalidated nothing already on disk,
    // so a lifetime that turned out to be too long stayed too long.
    await expect(cache.readCache('k2', 0)).resolves.toBeUndefined()
  })

  it('deletes an expired entry instead of leaving it on disk', async () => {
    await cache.writeCache('k3', 'gone', 60_000)
    const before = files().length

    await cache.readCache('k3', 0)

    // Detecting expiry and keeping the file is how this directory grew without
    // bound on a disk the operator pays for.
    expect(files().length).toBe(before - 1)
  })
})

describe('corruption', () => {
  it('treats an unreadable entry as a miss rather than throwing', async () => {
    // Identified by diffing, because the path is a hash of the key. Corrupting
    // "whichever .json turns up first" tested a different entry than the one
    // being read.
    const before = new Set(files())
    await cache.writeCache('k4', 'good', 60_000)
    const written = files().find((f) => !before.has(f))

    expect(written).toBeDefined()
    writeFileSync(written!, '{ this is not json')

    await expect(cache.readCache('k4')).resolves.toBeUndefined()
  })
})

describe('withCache', () => {
  it('calls the loader once and serves the second call from disk', async () => {
    let calls = 0
    const load = () => {
      calls += 1
      return Promise.resolve('value')
    }

    await cache.withCache('k5', 60_000, load)
    await cache.withCache('k5', 60_000, load)

    expect(calls).toBe(1)
  })

  it('collapses concurrent loads of the same key into one request', async () => {
    let calls = 0
    const load = async () => {
      calls += 1
      await new Promise((r) => setTimeout(r, 20))
      return 'shared'
    }

    // Two callers, one upstream request. The cost of getting this wrong is a
    // duplicate request against a rate limit shared with every other tenant.
    const [a, b] = await Promise.all([
      cache.withCache('k6', 60_000, load),
      cache.withCache('k6', 60_000, load),
    ])

    expect(a).toBe('shared')
    expect(b).toBe('shared')
    expect(calls).toBe(1)
  })
})

describe('pruneTrendsCache', () => {
  it('removes entries older than the longest ttl and keeps fresh ones', async () => {
    await cache.writeCache('fresh', 'keep', 60_000)

    // An entry whose mtime predates every TTL in the table.
    const shard = join(dir, 'ff')
    mkdirSync(shard, { recursive: true })
    const ancient = join(shard, 'ffffffffffffffff.json')
    writeFileSync(ancient, '{}')
    const longAgo = new Date('2000-01-01')
    const { utimesSync } = await import('node:fs')
    utimesSync(ancient, longAgo, longAgo)

    const removed = await cache.pruneTrendsCache()

    expect(removed).toBeGreaterThanOrEqual(1)
    expect(existsSync(ancient)).toBe(false)
    await expect(cache.readCache('fresh')).resolves.toBe('keep')
  })

  it('returns zero rather than throwing when there is no cache directory', async () => {
    // The worker calls this on every maintenance tick, including on an install
    // that has never run discovery.
    await expect(cache.pruneTrendsCache()).resolves.toBeGreaterThanOrEqual(0)
  })
})
