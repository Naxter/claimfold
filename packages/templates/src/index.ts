export {
  CANVAS,
  DEFAULT_THEME_ID,
  THEMES,
  TYPE,
  applyAccent,
  getTheme,
  type Theme,
  type ThemeFonts,
  type TypeScale,
} from './themes.ts'

export {
  TEXT_CONTRAST_FLOOR,
  checkAccent,
  contrastRatio,
  isHexColour,
  parseHex,
  type AccentCheck,
} from './contrast.ts'

export {
  ALL_CONTENT_FIELD_KEYS,
  contentFieldsFor,
  roleFixesLayout,
  type ContentField,
  type ContentFieldKey,
} from './fields.ts'

/**
 * Only the font helpers that work in a browser.
 *
 * `fonts.ts` reads the `.woff2` files off disk to inline them, so it imports
 * `node:fs`. Re-exporting it here dragged that into the client bundle of every
 * component that touches this package — the dashboard renders live slide
 * previews, so that is most of them — and the build failed with "the chunking
 * context does not support external modules".
 *
 * The Node-only half is at `@claimfold/templates/fonts`:
 *
 *   import { fontFaceCss, missingFamilies } from '@claimfold/templates/fonts'
 */
export { REQUIRED_FAMILIES, fontStack } from './font-stack.ts'

export { AutoFit, Kicker, Rule, Slide, Spacer, autoFitScript } from './layout.tsx'

export {
  SlideView,
  TEMPLATE_IDS,
  isTemplateId,
  type RenderSlideProps,
  type SlideRenderProps,
  type TemplateId,
} from './templates.tsx'

/**
 * `document.tsx` is deliberately NOT re-exported here.
 *
 * It imports `react-dom/server`, which Next.js refuses to load inside a Server
 * Component — and the dashboard only ever needs the components, not the
 * standalone-HTML generator. Re-exporting it from the package root drags that
 * dependency into every consumer and breaks the preview.
 *
 * The render pipeline imports it explicitly:
 *
 *   import { renderSlideDocument } from '@claimfold/templates/document'
 */
