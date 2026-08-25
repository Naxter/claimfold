/**
 * Font names, with no filesystem attached.
 *
 * Split out of `fonts.ts` because that module reads the `.woff2` files off disk
 * to inline them, which means it imports `node:fs` — and the slide templates
 * need `fontStack` in the browser, for the live preview in the dashboard. One
 * module holding both meant a client component that imported anything from this
 * package dragged `node:fs` into the browser bundle and the build failed with
 * "the chunking context does not support external modules".
 *
 * Same split, and the same reason, as `@claimfold/templates/document`: the
 * Node-only half lives behind its own entry point so importing the package root
 * is always safe.
 */

/** Families the themes reference, with the weights each needs. */
export const REQUIRED_FAMILIES = [
  'Newsreader',
  'Instrument Sans',
  'Bricolage Grotesque',
  'Archivo',
  'Space Grotesk',
  'Space Mono',
] as const

/**
 * Fallbacks used when a family is missing from disk.
 *
 * Deliberately NOT `system-ui`: on Windows that resolves to Segoe UI, on Linux
 * containers to DejaVu Sans, so a slide previewed on a laptop would not match
 * the one published from a server. Naming concrete faces keeps the failure
 * visible and consistent rather than silently platform-dependent.
 */
const FALLBACKS: Record<string, string> = {
  Newsreader: 'Georgia, "Times New Roman", serif',
  'Instrument Sans': 'Helvetica, Arial, sans-serif',
  'Bricolage Grotesque': 'Helvetica, Arial, sans-serif',
  Archivo: '"Arial Black", Helvetica, sans-serif',
  'Space Grotesk': 'Helvetica, Arial, sans-serif',
  'Space Mono': '"Courier New", monospace',
}

export function fontStack(family: string): string {
  const fallback = FALLBACKS[family] ?? 'Helvetica, Arial, sans-serif'
  return `"${family}", ${fallback}`
}
