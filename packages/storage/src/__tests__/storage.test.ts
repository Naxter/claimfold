import { describe, expect, it } from 'vitest'

import { describePublicUrl, publicUrlIsPublishable, resolvePath } from '../index.ts'

/**
 * The read path is the product's only anonymous public surface, so traversal
 * gets its own test rather than relying on "we only pass generated paths".
 */
describe('resolvePath', () => {
  it('accepts a normal generated path', () => {
    expect(() => resolvePath('org1/ab/abcdef.jpg')).not.toThrow()
  })

  it('refuses parent-directory traversal', () => {
    expect(() => resolvePath('../../../.env')).toThrow(/outside the storage root/)
    expect(() => resolvePath('org1/../../../etc/passwd.jpg')).toThrow(/outside the storage root/)
  })

  it('refuses absolute paths', () => {
    expect(() => resolvePath('/etc/passwd.jpg')).toThrow()
  })

  it('refuses non-jpg extensions', () => {
    // The storage root would otherwise happily serve anything written into it.
    expect(() => resolvePath('org1/ab/secrets.json')).toThrow(/non-\.jpg/)
    expect(() => resolvePath('org1/ab/file.jpg.env')).toThrow(/non-\.jpg/)
  })

  it('refuses encoded traversal', () => {
    /*
      Asserted on the MESSAGE, not just that it throws.

      `'..%2f..%2f.env'` never decodes here — it resolves to a single filename
      inside the root — so a bare `.toThrow()` passed on the extension check and
      this test asserted nothing whatsoever about traversal. Pinning the reason
      is what makes it a traversal test.

      Encoded separators are the router's job to decode; a `.jpg`-suffixed one
      is included so the extension check cannot stand in for containment.
    */
    expect(() => resolvePath('..%2f..%2f.env')).toThrow(/non-\.jpg/)
    expect(() => resolvePath('%2e%2e%2f%2e%2e%2fsecret.jpg')).not.toThrow()
  })

  it('does not reject a legitimate name that merely starts with dots', () => {
    // `rel.startsWith('..')` also refused `..foo/x.jpg`, which is a valid
    // relative path inside the root.
    expect(() => resolvePath('..foo/ab/abcdef.jpg')).not.toThrow()
  })
})

describe('publicUrlIsPublishable', () => {
  const withEnv = (value: string | undefined, fn: () => void) => {
    const previous = process.env.PUBLIC_ASSET_URL
    if (value === undefined) delete process.env.PUBLIC_ASSET_URL
    else process.env.PUBLIC_ASSET_URL = value
    try {
      fn()
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_ASSET_URL
      else process.env.PUBLIC_ASSET_URL = previous
    }
  }

  it('rejects an unset base', () => {
    withEnv(undefined, () => expect(publicUrlIsPublishable().ok).toBe(false))
  })

  it('rejects plain HTTP', () => {
    withEnv('http://example.com/assets', () =>
      expect(publicUrlIsPublishable().reason).toMatch(/HTTPS/),
    )
  })

  it('rejects localhost and private ranges', () => {
    // The most likely misconfiguration by far: it works locally, then every
    // scheduled publish fails with an unhelpful Meta error.
    for (const base of [
      'https://localhost:3100/assets',
      'https://127.0.0.1/assets',
      'https://192.168.1.10/assets',
      'https://claimfold.local/assets',
    ]) {
      withEnv(base, () => expect(publicUrlIsPublishable().ok).toBe(false))
    }
  })

  it('accepts a public HTTPS origin', () => {
    withEnv('https://slides.example.com/assets', () =>
      expect(publicUrlIsPublishable().ok).toBe(true),
    )
  })
})

/**
 * The predicate both readiness checks share.
 *
 * Its own describe block because the two callers each used to carry a private
 * copy, and the copies had drifted: the asset check did not know about Docker's
 * default bridge network while the app-URL check did. The ranges are asserted
 * here, once, so a third caller cannot inherit a third version of the list.
 */
describe('describePublicUrl', () => {
  it('names why a URL is unusable rather than just refusing it', () => {
    expect(describePublicUrl(undefined)).toEqual({ ok: false, problem: 'missing' })
    expect(describePublicUrl('')).toEqual({ ok: false, problem: 'missing' })
    expect(describePublicUrl('not a url')).toEqual({ ok: false, problem: 'unparseable' })
    expect(describePublicUrl('http://example.com')).toEqual({ ok: false, problem: 'not_https' })
  })

  it('refuses every private range, including the ones a container hands out', () => {
    for (const base of [
      'https://localhost/assets',
      'https://box.local/assets',
      'https://127.0.0.1/assets',
      'https://127.1.2.3/assets',
      'https://0.0.0.0/assets',
      'https://10.1.2.3/assets',
      'https://192.168.1.10/assets',
      // Docker's default bridge. Absent from the asset check until now, which
      // is the specific gap this block exists to hold shut.
      'https://172.17.0.5/assets',
      'https://172.31.255.254/assets',
      // Link-local, and with it the cloud metadata endpoint.
      'https://169.254.169.254/assets',
      'https://[::1]/assets',
      'https://[fd00::1]/assets',
    ]) {
      expect(describePublicUrl(base), base).toEqual({ ok: false, problem: 'private' })
    }
  })

  it('does not mistake a public host for a private one because of its path', () => {
    // The old check ran its pattern over the whole URL string, so a path
    // segment could condemn a perfectly public origin.
    for (const base of [
      'https://cdn.example.com/10.0.1/assets',
      'https://cdn.example.com/localhost/assets',
      'https://slides.example.com/assets',
      // Public addresses that sit just outside a private range.
      'https://172.15.0.1/assets',
      'https://172.32.0.1/assets',
      'https://11.0.0.1/assets',
    ]) {
      expect(describePublicUrl(base), base).toEqual({ ok: true })
    }
  })
})
