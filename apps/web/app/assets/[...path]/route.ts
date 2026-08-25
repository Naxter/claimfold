import { readFile, stat } from 'node:fs/promises'

import { resolvePath } from '@claimfold/storage'

/**
 * Serving rendered slides.
 *
 * This is the only ANONYMOUS route in the product, and it exists solely because
 * Instagram's crawler must fetch these images server-to-server with no headers.
 * Authenticating it would break publishing; so instead it is narrowed as far as
 * possible:
 *
 *  - `resolvePath` rejects anything outside the storage root and anything that
 *    is not a .jpg, after normalisation.
 *  - No directory listing, no fallthrough to other file types.
 *  - Errors are uniform 404s, so the route cannot be used to probe which paths
 *    exist on disk.
 *
 * The paths themselves are content hashes generated server-side, so they are
 * unguessable in practice — but that is defence in depth, not the control.
 */

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params
  const relative = path.join('/')

  let absolute: string
  try {
    absolute = resolvePath(relative)
  } catch {
    // Deliberately identical to a genuine miss: distinguishing "outside the
    // root" from "not found" tells an attacker their traversal was detected.
    return notFound()
  }

  try {
    const info = await stat(absolute)
    if (!info.isFile()) return notFound()

    const body = await readFile(absolute)

    return new Response(new Uint8Array(body), {
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(info.size),
        // Filenames are content hashes, so a given URL never changes.
        // Instagram and any CDN in front of it cache aggressively; immutable
        // is both correct and what keeps repeat fetches cheap.
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        // Nothing here should ever be interpreted as a document.
        'content-security-policy': "default-src 'none'; sandbox",
      },
    })
  } catch {
    return notFound()
  }
}

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
}
