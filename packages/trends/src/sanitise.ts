/**
 * Cleaning strings that arrive from the open internet.
 *
 * Topic titles come from trending feeds and news headlines, which is to say
 * from anybody. They end up in a model prompt at the ideation stage. That is
 * the same threat the verifier faces with search results — text written by
 * someone who would like to steer the model — and it gets the same treatment:
 * strip what has no business in a subject line, cap the length so nothing can
 * smuggle in a paragraph of instructions, and keep the result plainly a topic.
 *
 * This is containment, not a guarantee. The stage that reads these strings
 * treats them as data, and every claim built on top of one is still verified
 * and still gated.
 */

/** Longer than any real subject, short enough that no instruction fits. */
const MAX_LENGTH = 120

/**
 * Control characters, including the newlines that would let a string pretend
 * to be a new section of the prompt.
 *
 * The no-control-regex rule exists to catch control characters that reached a
 * pattern by accident. Matching them is the entire point of this one.
 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g

/**
 * Zero-width and bidirectional overrides: invisible in the dashboard,
 * meaningful to a tokeniser, and a known way to hide text inside a title that
 * reads as innocent.
 */
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g

const COMBINING_MARKS = /[\u0300-\u036f]/g

export function sanitiseTitle(raw: string): string {
  const collapsed = raw
    .replace(CONTROL, ' ')
    /*
      Invisibles become a SPACE, not nothing.

      Deleting them joined the surrounding words: `Astronomie<ZWSP>und` became
      `Astronomieund`. That is worse than it looks, because this string becomes
      a dedup key — so inserting a zero-width space was a way to make the same
      subject key as a different one, which is exactly what an invisible
      character should not be able to do. Collapsing whitespace below puts the
      words back together correctly when the original had a real space too.
    */
    .replace(INVISIBLE, ' ')
    /*
      Angle brackets.

      `sanitiseTitle('<script>alert(1)</script>')` returned the string
      unchanged, and `parseTrendingRss` decodes `&lt;`/`&gt;` back into `<`/`>`
      before calling this — so an entity-encoded tag in the feed arrived here as
      a literal one, and went into a model prompt and onto the dashboard.

      Not an XSS today: React escapes on render. But this module's stated job is
      to strip what has no business in a subject line, and markup qualifies.
    */
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (collapsed.length > MAX_LENGTH) {
    return `${collapsed.slice(0, MAX_LENGTH - 1).trimEnd()}\u2026`
  }
  return collapsed
}

/**
 * Case- and punctuation-insensitive key for deduplicating the same subject.
 *
 * `ß` is expanded before the accent strip because NFKD leaves it alone, and
 * dropping it instead would turn "Große" into "gro e" — two tokens where there
 * was one, and a key that never matches its own spelling variants. German is a
 * first-class language here, so this is not an edge case.
 *
 * The final class keeps any Unicode letter or number rather than `a-z0-9`.
 * Restricted to ASCII, this returned an EMPTY STRING for any title in a
 * non-Latin script — `normaliseKey('北京')` and `normaliseKey('Владимир Путин')`
 * both gave `''`. Two consequences, both silent: `discover.ts` drops a
 * candidate with no key and files no note, and this function is also exported
 * as the `dedupeKey` behind a unique index on (niche_id, dedupe_key), so every
 * empty-key topic in a channel would have collapsed into one row.
 *
 * The ASCII fold above still runs, so accented Latin keeps normalising the way
 * it did — `Café` and `Cafe` remain the same key.
 */
export function normaliseKey(title: string): string {
  const key = title
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

  /*
    Last resort, so this can never return empty for a non-empty title. Reachable
    only for a title made entirely of punctuation, which the prefilter would
    reject anyway — but an empty dedup key is a collision, and a collision in
    this column silently merges two subjects.
  */
  return key || title.toLowerCase().trim()
}

export { MAX_LENGTH as MAX_TITLE_LENGTH }
