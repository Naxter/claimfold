/**
 * Reading form fields as text, safely.
 *
 * `FormData.get` returns `string | File | null`. Every call site here wrote
 * `String(form.get(key) ?? '')`, which turns a File into the literal text
 * `[object File]` and hands it on as if it were user input.
 *
 * A server action is a public endpoint — anyone can post multipart data to it
 * directly, with any field as a file part. That never produced a leak here,
 * because the values are compared against database ids that will not match,
 * but "does not match anything" is luck rather than a check. The fix is one
 * line and removes the whole class.
 */
export function formText(form: FormData, key: string, fallback = ''): string {
  const value = form.get(key)
  return typeof value === 'string' ? value : fallback
}
