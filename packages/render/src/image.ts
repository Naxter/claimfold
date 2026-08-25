import { createHash } from 'node:crypto'

import sharp from 'sharp'

/**
 * Turning a file a person uploaded into something safe to publish.
 *
 * This is the first place the product accepts a file from a human being.
 * Everything else it handles is either generated here or fetched by the
 * verifier under its own rules, so this module is a trust boundary and is
 * written like one.
 *
 * A separate entry point (`@claimfold/render/image`) rather than part of the
 * package root, following the same reasoning as
 * `@claimfold/templates/document`: the root pulls in Playwright, and the
 * dashboard — which is what needs this — must not drag a browser driver into
 * its bundle to resize a photograph.
 *
 * sharp is already a direct dependency of this package at ^0.35.3. Notably NOT
 * the copy Next ships for `next/image`, which the runtime image deletes; see
 * apps/web/lib/__tests__/no-next-image.test.ts.
 */

/**
 * The uploaded bytes are never stored as received.
 *
 * Decoding and re-encoding is what makes the rest of the pipeline safe: it
 * discards anything that is not pixels. That kills polyglot files — an image
 * with a script or an archive appended, which matters because these are served
 * from the one unauthenticated route in the product — and it kills EXIF, which
 * routinely carries the GPS coordinates of the room the photo was taken in.
 * Publishing somebody's home address as a side effect of adding a picture is a
 * mistake that cannot be walked back.
 *
 * The output is JPEG, which is not a preference: Instagram's publishing API
 * rejects PNG, and @claimfold/storage only ever writes or serves `.jpg`.
 */
export const UPLOAD_MIME = 'image/jpeg'

/** Refused before decoding. Generous for a photograph, mean for a payload. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024

/**
 * Cap on decoded pixels, well under sharp's own default.
 *
 * A few kilobytes of crafted PNG can claim to be 40,000 × 40,000, and decoding
 * it is a memory exhaustion rather than an error. This bound is what turns that
 * into a refusal on the smallest machine anyone runs this on.
 */
const MAX_INPUT_PIXELS = 50_000_000

/**
 * Long edge of the stored copy.
 *
 * The picture ends up composited into a 1080×1350 slide, so anything much above
 * this is bytes nobody will ever see. Twice the canvas leaves room for the
 * renderer's `object-fit: cover` to crop without softening.
 */
const MAX_EDGE = 2160

export interface NormalisedUpload {
  jpeg: Buffer
  width: number
  height: number
  bytes: number
  sha256: string
}

export type UploadResult =
  | { ok: true; image: NormalisedUpload }
  | { ok: false; reason: 'too_large' | 'not_an_image' }

export async function normaliseUpload(input: Buffer): Promise<UploadResult> {
  if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, reason: 'too_large' }

  try {
    const output = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      /*
        Apply the orientation flag, then drop it. sharp discards metadata by
        default, so without this an upright phone photo would come out on its
        side — the rotation lived in the EXIF being thrown away.
      */
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      // 4:4:4 for the same reason the slide renderer uses it: these sit under
      // accent-coloured text, and chroma subsampling smears coloured edges.
      .jpeg({ quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true })
      // Dimensions come back with the buffer. Re-reading them through
      // `sharp(jpeg).metadata()` decoded the output a second time for two
      // numbers the encode already produced.
      .toBuffer({ resolveWithObject: true })

    return {
      ok: true,
      image: {
        jpeg: output.data,
        width: output.info.width,
        height: output.info.height,
        bytes: output.data.byteLength,
        sha256: createHash('sha256').update(output.data).digest('hex'),
      },
    }
  } catch {
    // Every failure is the same answer to the person uploading: this is not an
    // image we can use. Distinguishing "corrupt" from "unsupported" from "too
    // many pixels" would tell someone probing the decoder more than it tells
    // anyone trying to add a photograph.
    return { ok: false, reason: 'not_an_image' }
  }
}

/** A `data:` URI the render browser can load without touching the network. */
export function toDataUri(jpeg: Buffer): string {
  return `data:${UPLOAD_MIME};base64,${jpeg.toString('base64')}`
}
