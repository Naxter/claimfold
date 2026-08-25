import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The package root has to stay safe to import from a browser.
 *
 * The dashboard renders live slide previews with the same components the publish
 * pipeline screenshots, so client components import this package — and the
 * moment anything reachable from `index.ts` pulls in a Node builtin, the build
 * dies with "the chunking context does not support external modules" and the
 * review screen stops opening. That is not a subtle failure, but it is an easy
 * one to reintroduce: `fonts.ts` needs `node:fs` to inline the `.woff2` files,
 * and it exports `fontStack`, which the templates need in the browser. Putting
 * both in one module is the obvious thing to do and it breaks the app.
 *
 * The Node-only halves live behind their own entry points — `./fonts` and
 * `./document` — and this walks the root's import graph to keep it that way.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Relative import specifiers in a module, resolved to absolute paths. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specifiers = [...source.matchAll(/from\s+'(\.[^']+)'/g)].map((match) => match[1]!)
  return specifiers.map((specifier) => resolve(dirname(file), specifier))
}

function nodeBuiltinsIn(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(/from\s+'(node:[\w/]+)'/g)].map((match) => match[1]!)
}

/** Every module reachable from an entry point by following relative imports. */
function reachableFrom(entry: string): string[] {
  const seen = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    queue.push(...importsOf(file))
  }

  return [...seen]
}

describe('@claimfold/templates', () => {
  it('reaches no Node builtin from the package root', () => {
    const offenders = reachableFrom(resolve(SRC, 'index.ts'))
      .map((file) => [file.slice(SRC.length + 1), nodeBuiltinsIn(file)] as const)
      .filter(([, builtins]) => builtins.length > 0)

    expect(
      offenders.map(([file, builtins]) => `${file} imports ${builtins.join(', ')}`),
      'move this behind its own entry point, like ./fonts and ./document',
    ).toEqual([])
  })

  it('still reaches the font faces from the Node-only entry point', () => {
    // The other half of the split: if this stops being true, renders lose their
    // typefaces and silently fall back to Georgia and Helvetica.
    const reachable = reachableFrom(resolve(SRC, 'fonts.ts'))
    expect(reachable.some((file) => nodeBuiltinsIn(file).includes('node:fs'))).toBe(true)
  })
})
