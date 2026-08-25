import { BUILT_IN_FORMATS } from './formats.ts'
import type { NichePackInput } from './schema.ts'

/**
 * Starter packs.
 *
 * These are examples, not a menu. The intended path for most operators is the
 * niche generator ("describe your channel in a sentence") or editing one of
 * these in the UI. They exist mainly to seed a fresh install with something
 * runnable, and to prove by construction that the pipeline carries no
 * assumptions about subject or language — a preset only supplies data.
 *
 * If adding a preset ever requires touching code outside this file, something
 * upstream has become topic-aware and should be fixed there instead.
 */

function formats(...ids: string[]) {
  return BUILT_IN_FORMATS.filter((f) => ids.includes(f.id))
}

const DEFAULT_CADENCE = {
  postsPerWeek: 4,
  // Evening, when saves peak. Tune from your own insights once you have them —
  // published "best time to post" numbers are averages over everyone else.
  preferredTimes: ['18:30', '12:00'],
  timezone: 'Europe/Berlin',
}

export const PRESET_NICHES: NichePackInput[] = [
  {
    slug: 'wissen-de',
    name: 'Wissen & Irrtümer (Deutsch)',
    description:
      'German-language knowledge carousels: widely believed claims checked against the evidence, plus rankings and timelines. Broad enough to sustain years of posts, specific enough to build an identity.',
    language: 'de',
    audience:
      'Neugierige Erwachsene zwischen 20 und 45, die gern dazulernen, aber keine Zeit für lange Texte haben. Sie teilen gern Dinge, die andere überraschen.',
    voice:
      'Klar, direkt, respektvoll. Keine Superlative, kein Clickbait, keine Ausrufezeichen. Der Ton eines guten Lehrers, der die Leserin für klug hält. Duzen. Fachbegriffe werden beim ersten Mal kurz erklärt.',
    topicSeeds: [
      'Geschichte des Mittelalters',
      'Sprachursprünge und Etymologie',
      'Astronomie und Raumfahrt',
      'Antike Mythologie',
      'Wissenschaftsgeschichte',
      'Alltagsphysik',
      'Kartografie und Grenzen',
      'Archäologische Funde',
    ],
    formats: formats('misconception', 'claim-evidence', 'timeline', 'ranking', 'number-reveal'),
    hashtagSets: [
      ['wissen', 'allgemeinbildung', 'geschichte', 'faktencheck'],
      ['wissenschaft', 'lernen', 'wusstestdu', 'bildung'],
    ],
    themeId: 'paper',
    rules: {
      requireSources: true,
      publicInterest: false,
      minConfidence: 0.75,
      forbiddenTopics: [
        'medizinische Ratschläge',
        'Anlageberatung',
        'Parteipolitik und Wahlempfehlungen',
      ],
      requireAdLabel: true,
    },
    cadence: DEFAULT_CADENCE,
  },

  {
    slug: 'science-en',
    name: 'Science, explained (English)',
    description:
      'English-language science explainers built around a single striking result or a correction of a common intuition.',
    language: 'en',
    audience:
      'Curious non-specialists, roughly 18–40, who liked science at school but do not read papers. They save things they intend to bring up in conversation.',
    voice:
      'Plain and precise. Short sentences. Explain the term the first time it appears. Never overstate what a study shows, and say so explicitly when evidence is thin — the honesty is the brand.',
    topicSeeds: [
      'Materials science in everyday objects',
      'How measurement standards were set',
      'Animal cognition experiments',
      'Counterintuitive results in physics',
      'The history of a scientific unit',
      'Failed hypotheses that were useful anyway',
    ],
    formats: formats('claim-evidence', 'number-reveal', 'misconception', 'timeline'),
    hashtagSets: [
      ['science', 'sciencefacts', 'learnsomething', 'stem'],
      ['physics', 'biology', 'didyouknow', 'curiosity'],
    ],
    themeId: 'ink',
    rules: {
      requireSources: true,
      // Science content routinely touches health and safety, which raises both
      // the editorial bar and the EU AI Act transparency question.
      publicInterest: true,
      minConfidence: 0.85,
      forbiddenTopics: ['personal medical advice', 'supplement recommendations'],
      requireAdLabel: true,
    },
    cadence: { ...DEFAULT_CADENCE, timezone: 'Europe/Berlin', postsPerWeek: 3 },
  },

  {
    slug: 'craft-en',
    name: 'Practical skills (English)',
    description:
      'Actionable how-to and common-mistake carousels for a hands-on skill. The highest-saving format family, and the easiest to monetise later with a digital product.',
    language: 'en',
    audience:
      'Motivated beginners who have already started and are hitting the same early problems everyone hits.',
    voice:
      'Direct and generous. Assume competence, not knowledge. Give the specific detail that separates doing it from doing it well. No gatekeeping, no false modesty.',
    topicSeeds: [
      'Beginner mistakes and their fixes',
      'Tool selection on a budget',
      'Technique fundamentals',
      'Fixing a common failure mode',
    ],
    formats: formats('mistakes', 'how-to', 'comparison', 'ranking'),
    hashtagSets: [['skills', 'howto', 'beginnertips', 'learning']],
    themeId: 'bold',
    rules: {
      requireSources: false,
      publicInterest: false,
      // Craft knowledge is often experiential rather than citable, so the bar
      // sits lower here — but never below the schema floor of 0.5.
      minConfidence: 0.6,
      forbiddenTopics: [],
      requireAdLabel: true,
    },
    cadence: { ...DEFAULT_CADENCE, postsPerWeek: 5 },
  },
]

export function getPreset(slug: string): NichePackInput | undefined {
  return PRESET_NICHES.find((p) => p.slug === slug)
}
