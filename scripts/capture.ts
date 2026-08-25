import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type Browser, type Page } from 'playwright'

/**
 * `npm run capture -- --milestone phase-5`
 *
 * Walks the dashboard and writes a screenshot of each route to
 * `docs/media/<milestone>/`. Run at the end of a milestone so the build log
 * carries a visual progression rather than a wall of prose.
 *
 * Playwright is already a dependency for rendering slides, so this costs
 * nothing extra — and screenshots of the product changing over time are the
 * single most reusable asset for a build-in-public account.
 *
 * Requires a running dev server and seeded data:
 *   npm run db:seed && npm run dev
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(resolve(repoRoot, '.env'))) process.loadEnvFile(resolve(repoRoot, '.env'))

const BASE = process.env.CAPTURE_URL ?? 'http://localhost:3100'
const EMAIL = process.env.SEED_EMAIL ?? 'dev@claimfold.local'
const PASSWORD = process.env.SEED_PASSWORD ?? 'claimfold-dev-2026'

/**
 * Routes worth a picture.
 *
 * `postPath` entries are resolved at runtime against whatever post the board
 * links to first, because a hard-coded id goes stale the moment the database
 * is reseeded and the script then silently captures a 404 page.
 */
const FIRST_POST = Symbol('first-post')

const SHOTS: Array<{ name: string; path: string | typeof FIRST_POST; fullPage?: boolean }> = [
  { name: 'board', path: '/' },
  { name: 'generate', path: '/generate' },
  { name: 'niches', path: '/niches' },
  /*
    The review screen twice, on purpose.

    `review-top` is the viewport shot: the block, the failing claim and the
    evidence beside it, which is the whole argument in one frame and the only
    version that works above the fold in a README. `review` is the full page,
    eight slides and the caption editor included, which is worth having and is
    far too tall to lead with.
  */
  { name: 'review-top', path: FIRST_POST },
  { name: 'review', path: FIRST_POST, fullPage: true },
  { name: 'settings', path: '/settings' },
]

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  /*
    `commit` rather than the default `load`.

    The dashboard streams, so the board's load event can sit unresolved well
    past twenty seconds while slide previews settle — and the sign-in itself
    succeeded long before that. Waiting on the navigation committing asks the
    question actually being asked here: did we leave /sign-in?
  */
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), {
    timeout: 20_000,
    waitUntil: 'commit',
  })
}

/**
 * Remove the Next dev-server badge before shooting.
 *
 * These images are meant for the build log and for posting, and a floating
 * "N" in the corner announces that the screenshot is of a development machine.
 * Injected as a style rather than by disabling the indicator in config, so the
 * setting only applies to captures and not to everyday development.
 */
async function hideDevChrome(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      nextjs-portal, #__next-build-watcher, [data-nextjs-toast] { display: none !important; }
    `,
  })
}

/**
 * Walk the page top to bottom before shooting.
 *
 * Slide previews are deferred behind an IntersectionObserver so the review
 * screen does not rasterise eight slides nobody has scrolled to yet. A
 * full-page screenshot taken straight after `networkidle` therefore catches
 * the two or three that happened to be in the viewport and leaves the rest
 * as empty frames — the observer never fired for them. Scrolling through and
 * returning to the top is what makes a full-page shot show the whole post.
 */
async function settle(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.body.scrollHeight)
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((to) => window.scrollTo(0, to), y)
    await page.waitForTimeout(200)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(700)
}

/** The first post the board links to, so the review shot is never a 404. */
async function firstPostPath(page: Page): Promise<string | null> {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const href = await page.locator('a[href^="/posts/"]').first().getAttribute('href')
  return href
}

async function main(): Promise<void> {
  const milestone = arg('milestone') ?? new Date().toISOString().slice(0, 10)
  const outDir = resolve(repoRoot, 'docs', 'media', milestone)
  mkdirSync(outDir, { recursive: true })

  let browser: Browser | undefined
  try {
    browser = await chromium.launch()
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2, // Retina, so the images survive being posted.
      colorScheme: 'dark',
    })
    const page = await context.newPage()

    await signIn(page)
    const postPath = await firstPostPath(page)

    for (const shot of SHOTS) {
      const path = shot.path === FIRST_POST ? postPath : shot.path
      if (!path) {
        console.log(`  ${shot.name.padEnd(12)} skipped — no post on the board yet`)
        continue
      }

      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      await hideDevChrome(page)
      await settle(page)
      const file = resolve(outDir, `${shot.name}.png`)
      await page.screenshot({ path: file, fullPage: shot.fullPage ?? false })
      console.log(`  ${shot.name.padEnd(12)} ${file}`)
    }

    console.log(`\nWritten to docs/media/${milestone}/`)
  } finally {
    await browser?.close()
  }
}

main().catch((error: unknown) => {
  console.error('\ncapture failed:', (error as Error).message)
  console.error('Is the dev server running (npm run dev) and seeded (npm run db:seed)?')
  process.exit(1)
})
