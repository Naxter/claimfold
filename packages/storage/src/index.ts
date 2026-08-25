import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/**
 * Rendered slide storage.
 *
 * These files are served UNAUTHENTICATED, because Instagram's crawler has to
 * fetch them server-to-server with no headers. That makes this the one public,
 * anonymous surface in the product, so the read path is deliberately paranoid:
 * every path is validated to sit inside the storage root, and only .jpg is
 * ever served.
 *
 * Paths are generated here and stored in the database. Nothing derived from
 * user input is ever joined onto the root — a request identifies an asset by
 * database id, not by path.
 */

const ROOT = resolve(process.env.STORAGE_DIR ?? resolve(process.cwd(), 'storage'))

/** Only extension we write or serve. Instagram rejects PNG anyway. */
const EXTENSION = '.jpg'

export interface StoredAsset {
  /** Path relative to the storage root, as stored in the database. */
  path: string
  sha256: string
  bytes: number
}

/**
 * Write a rendered slide.
 *
 * Sharded by organization and content hash. The hash in the filename means two
 * renders of identical content collide harmlessly, and a changed slide gets a
 * new URL — which matters because Instagram and any CDN in front of it will
 * cache aggressively, and reusing a URL for changed pixels would publish the
 * old image.
 */
export async function saveSlideImage(orgId: string, jpeg: Buffer): Promise<StoredAsset> {
  const sha256 = createHash('sha256').update(jpeg).digest('hex')

  // orgId comes from a verified session, never from a request parameter, but
  // it is sanitised anyway: it ends up in a filesystem path, and defence in
  // depth here costs one regex.
  const safeOrg = orgId.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safeOrg) throw new Error('Invalid organization id for storage')

  const relativePath = join(safeOrg, sha256.slice(0, 2), `${sha256}${EXTENSION}`)
  const absolute = resolvePath(relativePath)

  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, jpeg)

  return { path: relativePath.split(sep).join('/'), sha256, bytes: jpeg.byteLength }
}

/** True when `rel`, the result of `relative(ROOT, x)`, leaves the root. */
function escapesRoot(rel: string): boolean {
  // `rel.startsWith('..')` alone also rejects a legitimate `..foo/x.jpg`.
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

/**
 * Turn a stored relative path into an absolute one, refusing anything that
 * escapes the root.
 *
 * Normalisation happens before the containment check, so `..` and absolute
 * paths are caught by the same test rather than by a blocklist of patterns.
 *
 * This check is LEXICAL. `path.resolve` never touches the filesystem, so it
 * cannot see a symlink — the comment here used to claim "symlink-style tricks
 * are all caught", which was false and, worse, was the kind of claim a reader
 * trusts instead of re-checking. Following the link is `resolveRealPath`'s job,
 * and the read path uses that one.
 */
export function resolvePath(relativePath: string): string {
  const absolute = resolve(ROOT, relativePath)
  const rel = relative(ROOT, absolute)

  if (escapesRoot(rel) || resolve(ROOT, rel) !== absolute) {
    throw new Error('Refusing to access a path outside the storage root')
  }
  if (!absolute.endsWith(EXTENSION)) {
    throw new Error(`Refusing to serve a non-${EXTENSION} file`)
  }

  return absolute
}

/**
 * The lexical check, plus the one it cannot do.
 *
 * A symlink at `storage/<org>/ab/<hash>.jpg` pointing anywhere on the box
 * passes `resolvePath` and would then be read and served by the product's one
 * anonymous route. Resolving the link and re-running containment closes that.
 *
 * Exploiting it needs write access to the storage root, so this is defence in
 * depth rather than a live hole — but the read path is the wrong place to be
 * relying on that.
 */
async function resolveRealPath(relativePath: string): Promise<string> {
  const absolute = resolvePath(relativePath)
  const real = await realpath(absolute)

  if (escapesRoot(relative(ROOT, real))) {
    throw new Error('Refusing to access a path outside the storage root')
  }

  return real
}

export async function readSlideImage(relativePath: string): Promise<Buffer> {
  return readFile(await resolveRealPath(relativePath))
}

/**
 * Remove a stored image.
 *
 * @returns true if a file was actually unlinked.
 *
 * An already-absent file is success — the retention sweep and the upload
 * remover both race the same deletion. Any other error propagates: this used to
 * swallow every failure, so a permissions problem looked exactly like a
 * completed cleanup and the disk filled up silently.
 */
export async function deleteSlideImage(relativePath: string): Promise<boolean> {
  try {
    await unlink(resolvePath(relativePath))
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/**
 * The URL Instagram will fetch.
 *
 * Must be plain and unauthenticated. Presigned or expiring URLs are a known
 * failure mode — they open fine in a browser and fail for Meta's crawler, which
 * produces a confusing "media could not be fetched" with no further detail.
 */
export function publicUrlFor(relativePath: string): string {
  const base = (process.env.PUBLIC_ASSET_URL ?? 'http://localhost:3100/assets').replace(
    /\/+$/,
    '',
  )
  return `${base}/${relativePath.split(sep).join('/')}`
}

/**
 * Why a URL cannot be reached from outside this machine.
 *
 * Returned as a code rather than a sentence so each caller can name its own
 * variable in the message. `APP_URL` and `PUBLIC_ASSET_URL` fail for the same
 * reasons and are read side by side on the settings screen, but "set this to
 * your public hostname" is different advice depending on which one it is.
 */
export type PublicUrlProblem = 'missing' | 'unparseable' | 'not_https' | 'private'

/**
 * Hostnames no server on the internet can resolve to this install.
 *
 * Anchored, and matched against `URL.hostname` rather than against the whole
 * URL string. Testing the string meant a path could trip the check — a perfectly
 * public `https://cdn.example.com/10.0.1/` read as a private address — and, far
 * worse in practice, that a range absent from the pattern passed silently.
 *
 * `172.16/12` is the one that matters most: it is Docker's default bridge, so
 * it is the private address an operator is most likely to paste in without
 * realising, on the deployment shape this product actually ships as. It was
 * missing here while the app-URL check had it, which meant the two halves of
 * one readiness panel disagreed about the same address.
 *
 * `169.254/16` covers link-local, and with it the cloud metadata endpoint at
 * 169.254.169.254 — worth refusing on its own account.
 */
const PRIVATE_HOSTNAME = new RegExp(
  [
    '^localhost$',
    '^.+\\.local$',
    // IPv4 loopback, "this host", RFC 1918, and link-local.
    '^127\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$',
    '^0\\.0\\.0\\.0$',
    '^10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$',
    '^192\\.168\\.\\d{1,3}\\.\\d{1,3}$',
    '^172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}$',
    '^169\\.254\\.\\d{1,3}\\.\\d{1,3}$',
    // IPv6 loopback and unique-local. `URL.hostname` keeps the brackets.
    '^\\[::1\\]$',
    '^\\[f[cd][0-9a-f]{2}:',
  ].join('|'),
  'i',
)

/**
 * Can something outside this machine fetch this URL?
 *
 * A configuration preflight, not a reachability test: it says the address is
 * not obviously unreachable, never that Meta's crawler actually got a response.
 * The live-canary runbook is what establishes the latter, and nothing here
 * should be read as standing in for it.
 */
export function describePublicUrl(raw: string | undefined): { ok: true } | {
  ok: false
  problem: PublicUrlProblem
} {
  if (!raw) return { ok: false, problem: 'missing' }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, problem: 'unparseable' }
  }

  if (url.protocol !== 'https:') return { ok: false, problem: 'not_https' }
  if (PRIVATE_HOSTNAME.test(url.hostname)) return { ok: false, problem: 'private' }

  return { ok: true }
}

/** True when the configured public base is reachable by Meta. */
export function publicUrlIsPublishable(): { ok: boolean; reason?: string } {
  const result = describePublicUrl(process.env.PUBLIC_ASSET_URL)
  if (result.ok) return { ok: true }

  return {
    ok: false,
    reason: {
      missing: 'PUBLIC_ASSET_URL is not set',
      unparseable: 'PUBLIC_ASSET_URL is not a valid URL',
      not_https: 'PUBLIC_ASSET_URL must be HTTPS for Instagram to fetch it',
      private:
        'PUBLIC_ASSET_URL points at a private address. Instagram fetches images from its own ' +
        'servers, so it must be reachable from the public internet.',
    }[result.problem],
  }
}

export { ROOT as STORAGE_ROOT }
