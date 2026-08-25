import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The read/write half of storage, which had no tests at all.
 *
 * `resolvePath` was covered; `saveSlideImage`, `readSlideImage`,
 * `deleteSlideImage` and the org sanitisation were not — and those are the
 * functions that actually touch the disk behind the product's only anonymous
 * public route.
 *
 * `STORAGE_DIR` is read once at module scope, so the module has to be imported
 * after the environment is set.
 */

const root = mkdtempSync(join(tmpdir(), 'claimfold-storage-'))

type StorageModule = typeof import('../index.ts')
let storage: StorageModule

beforeAll(async () => {
  process.env['STORAGE_DIR'] = root
  storage = await import('../index.ts')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
  delete process.env['STORAGE_DIR']
})

const jpeg = () => Buffer.from('not really a jpeg, but bytes are bytes')

describe('saveSlideImage', () => {
  it('round-trips through readSlideImage', async () => {
    const stored = await storage.saveSlideImage('org1', jpeg())
    await expect(storage.readSlideImage(stored.path)).resolves.toEqual(jpeg())
  })

  it('addresses by content hash, so identical bytes collide harmlessly', async () => {
    const a = await storage.saveSlideImage('org1', jpeg())
    const b = await storage.saveSlideImage('org1', jpeg())

    expect(a.path).toBe(b.path)
    expect(a.sha256).toBe(b.sha256)
  })

  it('gives different content a different path', async () => {
    // The property Instagram's caching depends on: changed pixels must never
    // reuse a URL, or the old image stays published.
    const a = await storage.saveSlideImage('org1', Buffer.from('one'))
    const b = await storage.saveSlideImage('org1', Buffer.from('two'))

    expect(a.path).not.toBe(b.path)
  })

  it('keeps organizations in separate directories', async () => {
    const a = await storage.saveSlideImage('org1', jpeg())
    const b = await storage.saveSlideImage('org2', jpeg())

    expect(a.path.startsWith('org1/')).toBe(true)
    expect(b.path.startsWith('org2/')).toBe(true)
    // Same bytes, same hash, different tenant — the org prefix is what makes
    // the content-addressed path safe to share a root.
    expect(a.path).not.toBe(b.path)
  })

  it('reports the byte length it actually wrote', async () => {
    const bytes = Buffer.from('exactly this many')
    const stored = await storage.saveSlideImage('org1', bytes)
    expect(stored.bytes).toBe(bytes.byteLength)
  })

  it('uses forward slashes in the stored path, whatever the platform separator is', async () => {
    // This string goes into the database and then into a URL. A backslash from
    // Windows' `path.join` would produce an unfetchable asset URL — and the
    // failure would only appear on the operator's box, at publish time.
    const stored = await storage.saveSlideImage('org1', jpeg())
    expect(stored.path).not.toContain('\\')
    expect(stored.path.split('/')).toHaveLength(3)
  })

  it('refuses an organization id that sanitises to nothing', async () => {
    await expect(storage.saveSlideImage('../..', jpeg())).rejects.toThrow(/Invalid organization/)
  })

  it('strips path characters out of an organization id', async () => {
    // orgId always comes from a verified session, never a request parameter —
    // this is the defence-in-depth the comment claims, asserted.
    const stored = await storage.saveSlideImage('org/../etc', jpeg())
    expect(stored.path.startsWith('orgetc/')).toBe(true)
  })
})

describe('deleteSlideImage', () => {
  it('removes the file and reports that it did', async () => {
    const stored = await storage.saveSlideImage('org1', Buffer.from('to be deleted'))

    await expect(storage.deleteSlideImage(stored.path)).resolves.toBe(true)
    await expect(storage.readSlideImage(stored.path)).rejects.toThrow()
  })

  it('treats an already-absent file as success, not an error', async () => {
    // The retention sweep and the upload remover race the same deletion.
    await expect(storage.deleteSlideImage('org1/ab/' + 'a'.repeat(64) + '.jpg')).resolves.toBe(
      false,
    )
  })
})

describe('readSlideImage', () => {
  it('refuses to follow a symlink out of the storage root', async () => {
    /*
      The gap `resolvePath` cannot close: it is lexical, so a symlink inside the
      root pointing anywhere on the box passed every check and was then read and
      served by the product's one anonymous route.

      Exploiting it needs write access to the storage root, so this is defence
      in depth — but the read path is the wrong place to rely on that.
    */
    const secret = join(root, 'outside-secret.txt')
    writeFileSync(secret, 'ENCRYPTION_KEY=hunter2')

    const shard = join(root, 'org1', 'ff')
    mkdirSync(shard, { recursive: true })
    const link = join(shard, `${'f'.repeat(64)}.jpg`)

    try {
      symlinkSync(secret, link)
    } catch {
      // Windows without Developer Mode refuses symlink creation for
      // unprivileged users. Skip rather than fail: the guard is still compiled
      // and covered on CI, and a test that cannot run should not look broken.
      return
    }

    expect(existsSync(link)).toBe(true)
    await expect(storage.readSlideImage(`org1/ff/${'f'.repeat(64)}.jpg`)).rejects.toThrow(
      /outside the storage root/,
    )
  })
})

describe('publicUrlFor', () => {
  it('joins the configured base without doubling the slash', () => {
    const previous = process.env['PUBLIC_ASSET_URL']
    process.env['PUBLIC_ASSET_URL'] = 'https://example.test/assets/'
    try {
      expect(storage.publicUrlFor('org1/ab/cd.jpg')).toBe(
        'https://example.test/assets/org1/ab/cd.jpg',
      )
    } finally {
      if (previous === undefined) delete process.env['PUBLIC_ASSET_URL']
      else process.env['PUBLIC_ASSET_URL'] = previous
    }
  })
})
