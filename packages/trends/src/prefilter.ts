import type { EntityFacts } from './sources/wikipedia.ts'
import type { PrefilterVerdict, RejectionReason, TopicSignals } from './types.ts'

/**
 * The cheap refusal.
 *
 * Everything checked here is free. Everything after it costs money — the
 * verifier searches the web per claim, the writer produces a full carousel.
 * So this is where a topic gets rejected, on evidence that a request to a
 * public API already paid for.
 *
 * The gate before the writing stage exists because writing around claims that
 * will be rejected wastes tokens and produces a polished draft that is
 * tempting to wave through. This is the same argument moved one stage earlier
 * again: verifying claims about a subject that was never suitable wastes the
 * verification.
 */

/**
 * Thresholds, in one place because they are editorial policy, not physics.
 *
 * `minExternalLinks` is the spec's "fewer than 15 references" applied to the
 * proxy actually measured — external links on the article. See
 * `ArticleFacts.externalLinkCount` for why the two are not the same thing.
 */
export const THRESHOLDS = {
  minExternalLinks: 15,
  minAgeDays: 180,
  /** A month holding this share of a year's views is an event, not a subject. */
  spikeShare: 0.5,
  /** ...and it only disqualifies while it is still recent. */
  spikeRecentDays: 90,
} as const

/**
 * Wikidata classes that make a subject Your-Money-or-Your-Life.
 *
 * Health, medicine, law and finance. Getting one of these wrong harms a
 * reader in a way a wrong date does not, and this product is explicitly not
 * in the business of certifying anything — so it declines the subjects where
 * being wrong is most expensive rather than trying to be careful enough.
 *
 * Ids rather than words: language-independent, and they cannot drift the way
 * a keyword list does. The list is not exhaustive and is not claimed to be;
 * the niche's own `forbiddenTopics` is the operator's own instrument.
 */
export const YMYL_ENTITY_CLASSES = new Set([
  'Q12136', // disease
  'Q112193867', // human disease
  'Q796194', // medical procedure
  'Q12140', // medicinal product
  'Q8386', // drug
  'Q179661', // treatment
  'Q7188', // government
  'Q1156854', // financial instrument
  'Q1554231', // investment
  'Q4830453', // business
  'Q1145276', // taxation
  'Q7748', // law
  'Q49371', // legal case
])

/** Subject-matter words that mark a candidate YMYL when Wikidata says nothing. */
const YMYL_WORDS = [
  'krebs',
  'cancer',
  'diabetes',
  'impf',
  'vaccin',
  'covid',
  'therapie',
  'therapy',
  'medikament',
  'symptom',
  'diagnos',
  'steuer',
  'rente',
  'pension',
  'aktie',
  'stock market',
  'krypto',
  'crypto',
  'investment',
  'insurance',
  'versicherung',
]

export interface PrefilterInput {
  title: string
  signals: TopicSignals
  hasArticle: boolean
  entity?: EntityFacts
  /** Maintenance templates found on the article, already lower-cased. */
  maintenanceTemplates?: string[]
}

/**
 * Maintenance template names that mean "this article is contested or stale".
 *
 * Per language, because template names are. The map is small and the gap is
 * deliberate rather than hidden: a project not listed here simply contributes
 * no signal, which is why `disputed-or-outdated` is a rejection reason that
 * can be absent rather than one the scorer assumes.
 */
export const MAINTENANCE_TEMPLATES: Record<string, string[]> = {
  de: ['belege fehlen', 'veraltet', 'neutralität', 'überarbeiten', 'lückenhaft', 'quellen'],
  en: [
    'disputed',
    'update',
    'outdated',
    'citation needed',
    'unreferenced',
    'refimprove',
    'npov',
    'contradict',
  ],
}

export function maintenanceTemplatesForLanguage(language: string): string[] {
  const base = language.toLowerCase().split('-')[0] ?? 'en'
  return MAINTENANCE_TEMPLATES[base] ?? MAINTENANCE_TEMPLATES['en']!
}

/**
 * Decide whether a candidate is worth spending on.
 *
 * Returns every reason rather than the first, so the operator sees the whole
 * picture. A topic rejected for one marginal reason is worth a human look; one
 * rejected for four is not, and that difference is only visible if the check
 * does not stop early.
 */
export function prefilter(input: PrefilterInput): PrefilterVerdict {
  const reasons: RejectionReason[] = []
  const detail: string[] = []

  if (!input.hasArticle) {
    reasons.push('no-article')
    detail.push(
      'No Wikipedia article was found, so there is nothing free to check the subject against ' +
        'before paying to verify it.',
    )
  }

  /*
    "Not measured" is not the same as "thinly sourced".

    `(links ?? 0) < floor` conflated them: when `measureFailed` fires the
    candidate arrives here with `referenceCount` undefined, and it was rejected
    with the sentence "The article carries 0 external links" — a confident claim
    about something that was never fetched. The operator had no way to tell a
    genuinely thin article from a request that timed out.

    An unmeasured article is still not usable, so it is still rejected; it is
    rejected for the reason that is true. The `measureFailed` note already
    records what happened.
  */
  const links = input.signals.referenceCount
  if (input.hasArticle && links === undefined) {
    reasons.push('too-few-references')
    detail.push(
      'The number of external links on the article could not be read, so there is no way to ' +
        'tell whether it is well enough sourced to verify against.',
    )
  } else if (input.hasArticle && links !== undefined && links < THRESHOLDS.minExternalLinks) {
    reasons.push('too-few-references')
    detail.push(
      `The article carries ${links} external links, under the floor of ` +
        `${THRESHOLDS.minExternalLinks}. Thinly sourced articles produce claims the verifier ` +
        'cannot confirm, which costs a full verification pass to discover.',
    )
  }

  if (input.maintenanceTemplates?.length) {
    reasons.push('disputed-or-outdated')
    detail.push(
      `The article is flagged by its own editors (${input.maintenanceTemplates
        .slice(0, 3)
        .join(', ')}). If Wikipedia does not consider it settled, it is not a base for a post.`,
    )
  }

  if (input.entity?.isLivingPerson) {
    reasons.push('living-person')
    detail.push(
      'The subject is a living person. Getting a claim about someone alive wrong is a legal ' +
        'problem, not an editorial one, and no amount of confidence makes it worth the exposure.',
    )
  }

  if (isYmyl(input)) {
    reasons.push('ymyl')
    detail.push(
      'The subject touches health, money or law. Being wrong there harms the reader, and this ' +
        'product deliberately does not certify anything as accurate.',
    )
  }

  const age = input.signals.ageDays
  if (input.hasArticle && age !== undefined && age < THRESHOLDS.minAgeDays) {
    reasons.push('too-new')
    detail.push(
      `The article is ${age} days old, under ${THRESHOLDS.minAgeDays}. A young article has not ` +
        'been through enough editing to be worth treating as settled.',
    )
  }

  const spike = input.signals.dominantSpike
  if (
    spike &&
    spike.share >= THRESHOLDS.spikeShare &&
    spike.ageDays < THRESHOLDS.spikeRecentDays
  ) {
    reasons.push('single-recent-spike')
    detail.push(
      `${Math.round(spike.share * 100)}% of the last year's views landed in ${spike.month}, ` +
        `${spike.ageDays} days ago. That is the shape of a news event, and a carousel about it ` +
        'is stale before it is scheduled.',
    )
  }

  return { ok: reasons.length === 0, reasons, detail }
}

function isYmyl(input: PrefilterInput): boolean {
  if (input.entity?.instanceOf.some((id) => YMYL_ENTITY_CLASSES.has(id))) return true

  const title = input.title.toLowerCase()
  return YMYL_WORDS.some((word) => title.includes(word))
}
