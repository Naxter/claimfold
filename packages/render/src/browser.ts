import { chromium, type Browser, type Page } from 'playwright'

import { CANVAS } from '@claimfold/templates'

/**
 * A long-lived Chromium with a bounded page pool.
 *
 * Launching a browser costs ~300ms and ~150MB. A ten-slide carousel would pay
 * that ten times if each render launched its own, so the browser is started
 * once and pages are recycled.
 *
 * Concurrency is capped because each page is a real renderer holding real
 * memory. On a 4GB box, three concurrent pages plus Postgres plus Node is
 * comfortable; ten is an OOM kill during a scheduled publish, which is the
 * worst possible moment to discover it.
 */

/** Sized for a 4GB box: three pages plus Postgres plus Node is comfortable. */
const DEFAULT_CONCURRENCY = 3

/**
 * How many Chromium pages may be live at once.
 *
 * `Math.max(1, Number(x))` looks like it clamps, and does not: `Number('abc')`
 * is `NaN`, every comparison with `NaN` is false, so `Math.max` returns `NaN`
 * and `livePages < MAX_PAGES` is permanently false. `acquirePage()` would then
 * wait on a queue nothing ever drains — every render hanging forever, silently,
 * because someone typed a non-number into an env var.
 *
 * A rejected value falls back to the default rather than to one, so a typo
 * costs nothing rather than quietly serialising every render.
 */
function maxPages(): number {
  const raw = process.env.RENDER_CONCURRENCY
  if (raw === undefined || raw.trim() === '') return DEFAULT_CONCURRENCY

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1) {
    console.warn(
      `[render] RENDER_CONCURRENCY=${JSON.stringify(raw)} is not a positive number; ` +
        `using ${DEFAULT_CONCURRENCY}.`,
    )
    return DEFAULT_CONCURRENCY
  }

  return Math.floor(parsed)
}

const MAX_PAGES = maxPages()

/**
 * The resolved cap, for tests.
 *
 * Exported so `__tests__/concurrency.test.ts` can assert the constant is never
 * `NaN` without launching a browser to find out the hard way.
 */
export function renderConcurrency(): number {
  return MAX_PAGES
}

let browserPromise: Promise<Browser> | null = null
const idlePages: Page[] = []
let livePages = 0
const waiters: Array<(page: Page) => void> = []

async function getBrowser(): Promise<Browser> {
  // A rejected promise cached here is permanent: `??=` would keep returning it,
  // so one transient launch failure would fail every render for the lifetime
  // of the process. Clearing the cache on rejection makes the next call retry.
  browserPromise ??= chromium
    .launch({
    args: [
      // Chromium's default /dev/shm is 64MB in most containers, which it will
      // exhaust and then crash. Using /tmp instead is the standard fix and
      // costs nothing on a normal machine.
      '--disable-dev-shm-usage',
      // Nothing in a slide is animated and nothing is interactive.
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
      ],
    })
    .catch((error: unknown) => {
      browserPromise = null
      throw error
    })

  return browserPromise
}

async function createPage(): Promise<Page> {
  const browser = await getBrowser()
  const context = await browser.newContext({
    viewport: { width: CANVAS.width, height: CANVAS.height },
    // 1:1 pixels. The canvas is already at the exact publish resolution, so
    // any scale factor other than 1 means resampling on the way out.
    deviceScaleFactor: 1,
    // Locale affects date and number formatting inside the page. Pinning it
    // keeps a render on a German laptop identical to one on a UTC server.
    locale: 'en-US',
    timezoneId: 'UTC',
    javaScriptEnabled: true,
  })

  const page = await context.newPage()

  /**
   * SSRF containment (docs/decisions/0001-security-posture.md, T4).
   *
   * Documents are supplied via setContent and are fully self-contained, so a
   * page should never make a request at all. Anything that tries is either a
   * template bug or content that got somewhere it should not have — either way
   * it is aborted rather than fetched. `data:` is permitted because inlined
   * fonts and the grain texture use it.
   */
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('data:') || url === 'about:blank') return route.continue()
    return route.abort()
  })

  return page
}

/** Borrow a page. Always release it in a `finally`. */
export async function acquirePage(): Promise<Page> {
  const idle = idlePages.pop()
  if (idle) return idle

  if (livePages < MAX_PAGES) {
    livePages += 1
    try {
      return await createPage()
    } catch (error) {
      livePages -= 1
      throw error
    }
  }

  return new Promise<Page>((resolve) => waiters.push(resolve))
}

/**
 * Return a page to the pool.
 *
 * A page that died mid-render (Chromium OOM, target closed) must NOT go back
 * in. Recycling a dead page hands it to every subsequent caller, and because
 * `livePages` stays at the cap no replacement is ever created — rendering is
 * bricked until the process restarts, silently, because the worker catches and
 * continues. Dropping it instead lets the pool refill on the next acquire.
 */
export function releasePage(page: Page): void {
  if (page.isClosed()) {
    livePages -= 1
    void page.context().close().catch(() => undefined)
    // Wake one waiter so it can create a fresh page rather than block forever.
    const waiter = waiters.shift()
    if (waiter) {
      void acquirePage().then(waiter, () => undefined)
    }
    return
  }

  const waiter = waiters.shift()
  if (waiter) {
    waiter(page)
    return
  }
  idlePages.push(page)
}

/** Shut everything down. Call on process exit so Chromium is not orphaned. */
export async function closeBrowser(): Promise<void> {
  for (const page of idlePages.splice(0)) {
    await page.context().close().catch(() => undefined)
  }
  livePages = 0

  if (browserPromise) {
    const browser = await browserPromise.catch(() => null)
    browserPromise = null
    await browser?.close().catch(() => undefined)
  }
}

/** True once a browser has been launched. Used by tests and the worker's shutdown path. */
export function isBrowserRunning(): boolean {
  return browserPromise !== null
}
