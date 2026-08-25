import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `next/image` must stay unused, because a Dockerfile line depends on it.
 *
 * Next ships its own copy of sharp for the built-in image optimizer, pinned to
 * a range that still carries four libvips CVEs, and npm will not let an
 * `overrides` entry reach an optional transitive dependency. So the runtime
 * image deletes it — which is only safe for as long as nothing asks Next to
 * optimize an image.
 *
 * That makes "we don't use next/image" a security control rather than a
 * preference, and a control nobody is checking is a control that expires
 * quietly. Hence this test: importing `next/image` should fail the build and
 * send whoever did it to the Dockerfile, not produce a 500 in production three
 * weeks later.
 *
 * Slides are rendered by @claimfold/render, which owns its own sharp at
 * ^0.35.3. Nothing here restricts that.
 */

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SKIP = new Set(['node_modules', '.next', 'dist', '.turbo'])

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, found)
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) found.push(path)
  }
  return found
}

describe('the runtime image can keep deleting Next’s sharp', () => {
  it('never imports next/image', () => {
    const offenders = sourceFiles(APP_ROOT).filter((path) => {
      if (path.endsWith('no-next-image.test.ts')) return false
      return /from ['"]next\/image['"]|require\(['"]next\/image['"]\)/.test(
        readFileSync(path, 'utf8'),
      )
    })

    expect(
      offenders.map((path) => path.slice(APP_ROOT.length)),
      'using next/image means Next needs sharp at runtime — remove the prune from apps/web/Dockerfile before adding this',
    ).toEqual([])
  })
})
