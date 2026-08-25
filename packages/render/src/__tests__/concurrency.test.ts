import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The page-pool cap, which could be `NaN`.
 *
 * `Math.max(1, Number(process.env.RENDER_CONCURRENCY ?? 3))` reads as a clamp
 * and is not one: `Number('abc')` is `NaN`, every comparison with `NaN` is
 * false, so `Math.max` returns `NaN` — and `livePages < MAX_PAGES` in
 * `acquirePage()` is then permanently false. Every render would wait on a queue
 * nothing drains: no error, no timeout, no log line. A publish would simply
 * never finish, because someone typed a word into an environment variable.
 *
 * Read through a module re-import rather than by calling an exported function,
 * because the cap is resolved once at module scope — which is exactly the
 * property that made the bug survivable.
 *
 * Nothing here launches Chromium: `acquirePage` is never called, only the
 * constant it depends on is observed.
 */

const original = process.env['RENDER_CONCURRENCY']

/** The resolved cap, by loading the module fresh under the given env. */
async function capFor(value: string | undefined): Promise<number> {
  vi.resetModules()
  if (value === undefined) delete process.env['RENDER_CONCURRENCY']
  else process.env['RENDER_CONCURRENCY'] = value

  const mod = await import('../browser.ts')
  return mod.renderConcurrency()
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  if (original === undefined) delete process.env['RENDER_CONCURRENCY']
  else process.env['RENDER_CONCURRENCY'] = original
})

describe('RENDER_CONCURRENCY', () => {
  it('uses the default when unset', async () => {
    await expect(capFor(undefined)).resolves.toBe(3)
  })

  it('honours a valid value', async () => {
    await expect(capFor('5')).resolves.toBe(5)
  })

  it('never resolves to NaN, whatever the value', async () => {
    // The failure this file exists for. Each of these produced `NaN` before,
    // and `NaN` means every render blocks forever.
    for (const nonsense of ['abc', '', '   ', 'two', '1e', '{}']) {
      const cap = await capFor(nonsense)
      expect(Number.isFinite(cap)).toBe(true)
      expect(cap).toBeGreaterThanOrEqual(1)
    }
  })

  it('refuses zero and negatives rather than deadlocking on them', async () => {
    // `0` is arithmetically valid and just as fatal: the pool can never grow,
    // so `acquirePage` waits on a queue nothing drains.
    await expect(capFor('0')).resolves.toBeGreaterThanOrEqual(1)
    await expect(capFor('-4')).resolves.toBeGreaterThanOrEqual(1)
  })

  it('floors a fractional value to a whole number of pages', async () => {
    // A pool of 2.5 pages is not a thing; left unfloored it makes the cap
    // comparison depend on floating-point luck.
    await expect(capFor('2.7')).resolves.toBe(2)
  })

  it('says so when it rejects a value, rather than silently substituting', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await capFor('abc')
    expect(warn).toHaveBeenCalled()
  })
})
