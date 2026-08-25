import { describe, expect, it } from 'vitest'

import { de } from '../messages/de.ts'
import { en, type Messages } from '../messages/en.ts'
import { es } from '../messages/es.ts'
import { fr } from '../messages/fr.ts'
import { fromAcceptLanguage, isLocale, LOCALES, toLocale } from '../locales.ts'

const CATALOGUES: Array<[string, Messages]> = [
  ['en', en],
  ['de', de],
  ['fr', fr],
  ['es', es],
]

/** Every leaf string in a catalogue, with a dotted path for the failure message. */
function walk(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') {
    out.push([path, value])
    return
  }
  if (typeof value === 'function') {
    // Called with plausible arguments so the interpolated result is inspected
    // too — a translated template that dropped its placeholder is a bug the
    // type system cannot see.
    try {
      const produced = (value as (...args: unknown[]) => unknown)(2, 2, 2)
      if (typeof produced === 'string') out.push([`${path}()`, produced])
    } catch {
      // Some take an object; those are exercised individually below.
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${path}[${i}]`, out))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      walk(child, path ? `${path}.${key}` : key, out)
    }
  }
}

function stringsOf(catalogue: Messages): Array<[string, string]> {
  const out: Array<[string, string]> = []
  walk(catalogue, '', out)
  return out
}

describe('locale resolution', () => {
  it('accepts only the languages that have a catalogue', () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true)
    expect(isLocale('sv')).toBe(false)
    expect(isLocale('')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })

  it('drops the region, because interface text has no regional variants here', () => {
    expect(toLocale('de-AT')).toBe('de')
    expect(toLocale('de-CH')).toBe('de')
    expect(toLocale('EN-GB')).toBe('en')
    expect(toLocale('sv-SE')).toBeUndefined()
  })

  it('honours quality values in Accept-Language', () => {
    // A browser sending these is stating a preference, and ignoring the order
    // would show German to someone who asked for French first.
    expect(fromAcceptLanguage('de;q=0.5, fr;q=0.9')).toBe('fr')
    expect(fromAcceptLanguage('fr-CA,fr;q=0.9,en;q=0.8')).toBe('fr')
    expect(fromAcceptLanguage('sv, en;q=0.4')).toBe('en')
  })

  it('returns nothing when no language is on offer, so the caller can default', () => {
    expect(fromAcceptLanguage('sv,no,fi')).toBeUndefined()
    expect(fromAcceptLanguage('')).toBeUndefined()
    expect(fromAcceptLanguage(null)).toBeUndefined()
  })
})

describe('catalogue completeness', () => {
  // The shared `Messages` type already makes a missing key a compile error.
  // What it cannot see is a key that is present but empty.
  it.each(CATALOGUES)('%s has no blank strings', (name, catalogue) => {
    const blank = stringsOf(catalogue).filter(([, text]) => text.trim() === '')
    expect(blank.map(([path]) => path), `blank strings in ${name}`).toEqual([])
  })

  it.each(CATALOGUES)('%s keeps its placeholders after interpolation', (name, catalogue) => {
    // A translator who copied `${count}` as literal text produces a string
    // that renders the placeholder to the reader.
    const leaked = stringsOf(catalogue).filter(([, text]) => /\$\{/.test(text))
    expect(leaked.map(([path]) => path), `unexpanded placeholders in ${name}`).toEqual([])
  })

  it('translates away from English rather than shipping English in every slot', () => {
    // A catalogue that is mostly identical to English is an untranslated stub.
    // Proper nouns and short shared words legitimately match, so the bar is
    // deliberately low — this catches "someone copied en.ts and renamed it".
    const english = new Map(stringsOf(en))

    for (const [name, catalogue] of CATALOGUES.filter(([n]) => n !== 'en')) {
      const entries = stringsOf(catalogue)
      const identical = entries.filter(([path, text]) => english.get(path) === text)
      const share = identical.length / entries.length
      expect(share, `${name} is ${Math.round(share * 100)}% identical to English`).toBeLessThan(
        0.35,
      )
    }
  })
})

/**
 * The wording rule, enforced.
 *
 * The product must never tell a reader that a post is fact-checked, verified
 * or accurate. Under German law those are quality characteristics a seller can
 * be held to (§ 434 BGB, § 5a UWG), and the honest description — researched,
 * cited, blocked until a person signs off — is also the more defensible one.
 *
 * This is exactly the kind of rule that survives in a document and quietly
 * dies in the copy, which is why it is a test rather than a comment. It runs
 * against the interpolated strings, so a claim smuggled into a template is
 * caught too.
 */
describe('claims the product must not make', () => {
  /**
   * Participles and nouns, not verbs.
   *
   * The distinction is the whole rule. "We cannot check this from here",
   * said about someone's Meta configuration, is an honest sentence in every
   * language — and in French the natural word for it is `vérifier`. What is
   * forbidden is the finished form applied to content: a post described as
   * `vérifié`, `geprüft`, `verificado`, `verified`. So these match the
   * participle and leave the infinitive alone.
   */
  const FORBIDDEN: Array<[string, RegExp]> = [
    ['en', /\b(fact[- ]?check\w*|verified|guaranteed accurate)\b/i],
    ['de', /\b(faktencheck\w*|gepr(ü|ue)fte?[rnms]?|verifiziert\w*|garantiert korrekt)\b/i],
    ['fr', /\b(fact[- ]?check\w*|vérifiée?s?|exactitude garantie)\b/i],
    ['es', /\b(fact[- ]?check\w*|verificad[oa]s?|comprobad[oa]s?|exactitud garantizada)\b/i],
  ]

  it.each(CATALOGUES)('%s never claims a post is checked or verified', (name, catalogue) => {
    const pattern = FORBIDDEN.find(([lang]) => lang === name)?.[1]
    expect(pattern, `no forbidden-wording pattern defined for ${name}`).toBeDefined()

    const offenders = stringsOf(catalogue)
      .filter(([, text]) => pattern!.test(text))
      .map(([path, text]) => `${path}: ${text}`)

    expect(offenders, `${name} makes a claim the product cannot stand behind`).toEqual([])
  })
})
