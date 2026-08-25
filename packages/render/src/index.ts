export { acquirePage, closeBrowser, isBrowserRunning, releasePage } from './browser.ts'

/**
 * `image.ts` is deliberately NOT re-exported here.
 *
 * This entry point pulls in Playwright through `browser.ts`, and the dashboard
 * needs the upload normaliser without needing a browser driver. Same split, and
 * the same reason, as `@claimfold/templates/document`:
 *
 *   import { normaliseUpload } from '@claimfold/render/image'
 */
export {
  MAX_BYTES,
  MAX_WIDTH,
  MIN_WIDTH,
  OUTPUT_MIME,
  assertPublishable,
  computeRenderHash,
  renderPost,
  renderSlide,
  type RenderSlideInput,
  type RenderedSlide,
} from './render.ts'
