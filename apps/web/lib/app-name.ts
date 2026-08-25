/**
 * The product name, in the one place it is allowed to be written.
 *
 * Deliberately not left inline in two files. The root layout builds every
 * page's tab title from the `%s · Claimfold` template, but Next does not apply
 * a template to the segment that declares it — so the board, which lives in the
 * same segment as the layout, has to compose its own title and would otherwise
 * be the one page with the name spelled out by hand. Renaming the product
 * should be one edit, not a search.
 */
export const APP_NAME = 'Claimfold'
