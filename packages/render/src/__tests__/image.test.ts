import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { MAX_UPLOAD_BYTES, normaliseUpload, toDataUri } from '../image.ts'

/**
 * The first file this product accepts from a person.
 *
 * Everything else it handles is either generated here or fetched by the verifier
 * under its own rules, so this is a trust boundary and these are its tests. The
 * one that matters most is the EXIF case: uploading a phone photograph must not
 * publish the GPS coordinates of the room it was taken in, and that is not a
 * mistake anybody gets to walk back.
 */

/** A small solid-colour JPEG, optionally carrying EXIF. */
async function makeJpeg(options: { width?: number; height?: number; exif?: boolean } = {}) {
  const image = sharp({
    create: {
      width: options.width ?? 40,
      height: options.height ?? 40,
      channels: 3,
      background: { r: 180, g: 71, b: 43 },
    },
  })

  const withExif = options.exif
    ? image.withExif({ IFD0: { Copyright: 'Somebody', Artist: 'A Photographer' } })
    : image

  return withExif.jpeg().toBuffer()
}

describe('normalising an upload', () => {
  it('strips metadata that came in with the file', async () => {
    const input = await makeJpeg({ exif: true })
    // Confirm the fixture actually carries what the test claims to remove;
    // otherwise this would pass against an image that never had EXIF.
    expect((await sharp(input).metadata()).exif).toBeDefined()

    const result = await normaliseUpload(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect((await sharp(result.image.jpeg).metadata()).exif).toBeUndefined()
  })

  it('re-encodes as JPEG, because the API rejects anything else', async () => {
    const png = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#000000' },
    })
      .png()
      .toBuffer()

    const result = await normaliseUpload(png)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect((await sharp(result.image.jpeg).metadata()).format).toBe('jpeg')
  })

  it('caps the long edge instead of storing bytes nobody will see', async () => {
    // The picture is composited into a 1080×1350 slide, so anything far above
    // that is waste. 2160 leaves room for the renderer to crop without blur.
    const result = await normaliseUpload(await makeJpeg({ width: 3000, height: 1000 }))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.image.width).toBe(2160)
    expect(result.image.height).toBe(720)
  })

  it('leaves a smaller picture at its own size', async () => {
    const result = await normaliseUpload(await makeJpeg({ width: 600, height: 400 }))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.image.width).toBe(600)
    expect(result.image.height).toBe(400)
  })

  it('reports the hash and byte count of what it produced, not what came in', async () => {
    const input = await makeJpeg({ exif: true })
    const result = await normaliseUpload(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.image.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(result.image.bytes).toBe(result.image.jpeg.byteLength)
    expect(result.image.jpeg.equals(input)).toBe(false)
  })
})

describe('refusing an upload', () => {
  it('refuses a file that is not an image at all', async () => {
    // Decoding is what discards everything that is not pixels, so a file that
    // will not decode is one that never reaches storage.
    expect(await normaliseUpload(Buffer.from('#!/bin/sh\nrm -rf /\n'))).toEqual({
      ok: false,
      reason: 'not_an_image',
    })
  })

  it('refuses an image with a payload appended, because it re-encodes', async () => {
    // A polyglot only matters if the original bytes are what gets served. They
    // are not: what comes out is a fresh encode of the decoded pixels.
    const polyglot = Buffer.concat([await makeJpeg(), Buffer.from('<script>alert(1)</script>')])

    const result = await normaliseUpload(polyglot)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.image.jpeg.includes(Buffer.from('<script>'))).toBe(false)
  })

  it('refuses an oversized file before decoding it', async () => {
    const huge = Buffer.alloc(MAX_UPLOAD_BYTES + 1)
    expect(await normaliseUpload(huge)).toEqual({ ok: false, reason: 'too_large' })
  })

  it('refuses a decompression bomb — small on disk, enormous decoded', async () => {
    /*
      The one guard the docstring names and nothing tested.

      `MAX_UPLOAD_BYTES` counts bytes on the wire, which a bomb is designed to
      sail through: a mostly-uniform image compresses to a few hundred KB and
      decodes to billions of pixels, so the refusal has to happen on the DECODED
      size. That is what `limitInputPixels: MAX_INPUT_PIXELS` does, and until now
      nothing checked it was still passed.

      Built rather than fixtured, because a checked-in bomb is a file nobody
      should have to explain. 20000×20000 is 400M pixels — eight times the
      50M cap — and compresses to well under the byte limit, so this can only
      be refused by the pixel guard.
    */
    const bomb = await sharp({
      create: {
        width: 20_000,
        height: 20_000,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
      // Sharp's own default cap refuses to BUILD this, which is itself a
      // reassuring sign — but the fixture has to exist before it can be
      // refused, so the limit is lifted here and only here.
      limitInputPixels: false,
    })
      .jpeg({ quality: 1 })
      .toBuffer()

    // Proves it is the pixel cap doing the work: the file itself is small.
    expect(bomb.byteLength).toBeLessThan(MAX_UPLOAD_BYTES)

    expect(await normaliseUpload(bomb)).toEqual({ ok: false, reason: 'not_an_image' })
  })
})

describe('inlining', () => {
  it('produces a data URI the render browser can load without the network', async () => {
    // The renderer makes zero network requests by design, so an image has to
    // arrive the same way the fonts do.
    expect(toDataUri(Buffer.from([0xff, 0xd8]))).toBe('data:image/jpeg;base64,/9g=')
  })
})
