import type { SlideFormat } from '@claimfold/db'

/**
 * Built-in slide formats.
 *
 * THE RULE THAT KEEPS THIS PRODUCT GENERAL: nothing in this file names a
 * subject. Not history, not finance, not pets. A format describes the SHAPE of
 * an argument — a claim and its evidence, an ordered list, a before and after —
 * and any topic can be poured into any shape.
 *
 * The moment a format says "the myth" instead of "the claim", the app stops
 * being a carousel studio and becomes a myth-vs-fact tool with extra steps.
 *
 * `purpose` strings are written as instructions TO THE MODEL. They are read at
 * generation time and are the main lever for slide quality, so they are phrased
 * as directions a writer could follow, not as labels.
 *
 * These are only defaults. A niche can override them or define its own — a
 * format is data, and adding one must never require a migration or a deploy.
 */

/** Instagram's publishing API caps a carousel at 10 images. Not negotiable. */
export const MAX_CAROUSEL_SLIDES = 10

/** Shared closing slides. Most formats end the same way. */
const SOURCES_ROLE = {
  id: 'sources',
  purpose:
    'List the sources behind the claims, each as publisher plus a short title. No URLs — they are not clickable in a carousel and eat space. This slide is what makes the post checkable rather than merely confident.',
  headlineBudget: 28,
  bodyBudget: 260,
} as const

const CTA_ROLE = {
  id: 'cta',
  purpose:
    'One clear next action. Ask for a save or a share only when the post genuinely earned it. Never use engagement bait ("comment YES") — Instagram demotes it, and it reads as desperate.',
  headlineBudget: 40,
  bodyBudget: 120,
} as const

const HOOK_BUDGETS = { headlineBudget: 70, bodyBudget: 90 }

export const BUILT_IN_FORMATS: SlideFormat[] = [
  {
    id: 'claim-evidence',
    name: 'Claim and evidence',
    description:
      'A widely repeated claim, then what the evidence actually shows. The most general factual format — use it when the post corrects or qualifies something the audience already believes.',
    templateId: 'editorial',
    // Six roles, so six is the floor: every role appears at least once.
    minSlides: 6,
    maxSlides: 9,
    roles: [
      {
        id: 'hook',
        purpose:
          'State the claim the audience already believes, in their words, and hint that it is incomplete. Create a gap the reader needs closed. Do not answer it here.',
        ...HOOK_BUDGETS,
      },
      {
        id: 'claim',
        purpose:
          'Spell out the claim precisely, including where it comes from and why it is plausible. Being fair to it is what makes the correction land.',
        headlineBudget: 46,
        bodyBudget: 200,
      },
      {
        id: 'evidence',
        purpose:
          'One piece of evidence and what it establishes. Concrete: a number, a study, a documented event. State the limits of what it proves.',
        repeatable: true,
        headlineBudget: 46,
        bodyBudget: 220,
      },
      {
        id: 'takeaway',
        purpose:
          'The corrected understanding in one sentence a reader could repeat at dinner. This is the line that gets screenshotted.',
        headlineBudget: 52,
        bodyBudget: 180,
      },
      SOURCES_ROLE,
      CTA_ROLE,
    ],
  },

  {
    id: 'misconception',
    name: 'Misconception and correction',
    description:
      'Paired misconceptions and corrections. High save rate because each pair is independently useful. Works for any field where beginners reliably get the same things wrong.',
    templateId: 'split',
    minSlides: 5,
    maxSlides: 10,
    roles: [
      {
        id: 'hook',
        purpose:
          'Promise a specific count of corrections and name the field. Concrete beats clever: "Four things about X that almost everyone gets backwards".',
        ...HOOK_BUDGETS,
      },
      {
        id: 'pair',
        purpose:
          'One misconception and its correction on a single slide. Give the belief a fair statement, then the correction, then one line on why the wrong version spread. The "why" is what makes it memorable rather than just a fact.',
        repeatable: true,
        headlineBudget: 60,
        bodyBudget: 240,
      },
      {
        id: 'takeaway',
        purpose:
          'The pattern connecting the corrections. If there is no honest pattern, restate the single most surprising one instead of inventing one.',
        headlineBudget: 52,
        bodyBudget: 180,
      },
      SOURCES_ROLE,
      CTA_ROLE,
    ],
  },

  {
    id: 'ranking',
    name: 'Ranked list',
    description:
      'An ordered list with a payoff at the end. The order must be defensible — arbitrary rankings read as filler.',
    templateId: 'list',
    minSlides: 5,
    maxSlides: 10,
    roles: [
      {
        id: 'hook',
        purpose:
          'Name the list and the ranking criterion. The criterion is what separates a real ranking from a listicle — say what "best" means here.',
        ...HOOK_BUDGETS,
      },
      {
        id: 'entry',
        purpose:
          'One entry: its position, its name, and the single reason it sits there. Do not pad — one strong sentence beats three weak ones.',
        repeatable: true,
        headlineBudget: 44,
        bodyBudget: 200,
      },
      {
        id: 'payoff',
        purpose:
          'The number one entry, or the insight the whole ranking was building toward. Earn the swipe to the end.',
        headlineBudget: 52,
        bodyBudget: 200,
      },
      SOURCES_ROLE,
      CTA_ROLE,
    ],
  },

  {
    id: 'timeline',
    name: 'Timeline',
    description:
      'How something developed over time. Strong when the ending is surprising given the beginning.',
    templateId: 'timeline',
    minSlides: 5,
    maxSlides: 10,
    roles: [
      {
        id: 'hook',
        purpose:
          'Anchor the span and promise the turn. "It took 200 years to go from X to Y — and the reason is not what you would guess."',
        ...HOOK_BUDGETS,
      },
      {
        id: 'moment',
        purpose:
          'One dated moment: when, what happened, and why it mattered to what came next. Keep the causal thread visible.',
        repeatable: true,
        headlineBudget: 44,
        bodyBudget: 220,
      },
      {
        id: 'now',
        purpose:
          'Where this stands today, and what the sequence explains that a snapshot would not.',
        headlineBudget: 52,
        bodyBudget: 200,
      },
      SOURCES_ROLE,
      CTA_ROLE,
    ],
  },

  {
    id: 'comparison',
    name: 'Side by side',
    description:
      'Two options compared on stated criteria, ending in a conditional verdict. Useful whenever the audience is choosing between things.',
    templateId: 'split',
    minSlides: 5,
    maxSlides: 9,
    roles: [
      {
        id: 'hook',
        purpose:
          'Name both options and the decision the reader is actually facing. Frame it as their choice, not an abstract contest.',
        ...HOOK_BUDGETS,
      },
      {
        id: 'criterion',
        purpose:
          'One criterion, how each option performs on it, and which wins. Concede the loser its genuine strengths — one-sided comparisons destroy trust.',
        repeatable: true,
        headlineBudget: 44,
        bodyBudget: 240,
      },
      {
        id: 'verdict',
        purpose:
          'A conditional recommendation: which option, for whom, under what circumstances. Almost never "it depends" without saying on what.',
        headlineBudget: 52,
        bodyBudget: 220,
      },
      SOURCES_ROLE,
      CTA_ROLE,
    ],
  },

  {
    id: 'number-reveal',
    name: 'One striking number',
    description:
      'A single arresting figure, unpacked. Highest stop rate of any format, and the easiest to do badly — the number must be real and correctly framed.',
    templateId: 'figure',
    minSlides: 5,
    maxSlides: 8,
    roles: [
      {
        id: 'hook',
        purpose:
          'The number alone, with just enough framing to make it land. No explanation yet.',
        headlineBudget: 24,
        bodyBudget: 70,
      },
      {
        id: 'context',
        purpose:
          'What the number actually measures, over what period, from whom. This is where honesty happens — a figure without its denominator is a lie with a source.',
        headlineBudget: 46,
        bodyBudget: 240,
      },
      {
        id: 'implication',
        purpose:
          'What follows from it, and one thing that does NOT follow. Naming the overreach is what separates this from clickbait.',
        repeatable: true,
        headlineBudget: 46,
        bodyBudget: 220,
      },
      SOURCES_ROLE,
      CTA_ROLE,
    ],
  },

  {
    id: 'mistakes',
    name: 'Common mistakes',
    description:
      'Errors the audience is probably making, each with a concrete fix. Reliably high save rate because it is directly actionable.',
    templateId: 'list',
    minSlides: 5,
    maxSlides: 10,
    roles: [
      {
        id: 'hook',
        purpose:
          'Name the audience and the count. Address the reader directly — this format works because it feels personal.',
        ...HOOK_BUDGETS,
      },
      {
        id: 'mistake',
        purpose:
          'One mistake, why it is tempting, what it costs, and the specific fix. The fix must be something the reader could do today.',
        repeatable: true,
        headlineBudget: 52,
        bodyBudget: 240,
      },
      {
        id: 'summary',
        purpose:
          'The fixes as a short checklist. This is the slide people screenshot.',
        headlineBudget: 44,
        bodyBudget: 220,
      },
      SOURCES_ROLE,
      CTA_ROLE,
    ],
  },

  {
    id: 'how-to',
    name: 'Step by step',
    description:
      'An ordered procedure. Only use it when the steps genuinely must happen in order — otherwise "mistakes" or "ranking" fits better.',
    templateId: 'list',
    minSlides: 5,
    maxSlides: 10,
    roles: [
      {
        id: 'hook',
        purpose:
          'The outcome and the realistic effort. Do not promise easy if it is not — over-promising costs more in unfollows than it gains in swipes.',
        ...HOOK_BUDGETS,
      },
      {
        id: 'step',
        purpose:
          'One step: what to do, and the detail that makes the difference between doing it and doing it well.',
        repeatable: true,
        headlineBudget: 48,
        bodyBudget: 220,
      },
      {
        id: 'result',
        purpose:
          'What done looks like, so the reader can tell whether they succeeded.',
        headlineBudget: 48,
        bodyBudget: 200,
      },
      SOURCES_ROLE,
      CTA_ROLE,
    ],
  },
]

export const BUILT_IN_FORMAT_IDS = BUILT_IN_FORMATS.map((f) => f.id)

export function getBuiltInFormat(id: string): SlideFormat | undefined {
  return BUILT_IN_FORMATS.find((f) => f.id === id)
}

/**
 * Expand a format's roles into a concrete slide plan of `count` slides.
 *
 * Repeatable roles absorb the slack. Given roles [hook, entry*, payoff,
 * sources, cta] and count 8, this yields hook, entry, entry, entry, entry,
 * payoff, sources, cta.
 *
 * Returns an error rather than throwing so the caller can surface it as a
 * validation message instead of a stack trace.
 */
export function planSlides(
  format: SlideFormat,
  count: number,
): { ok: true; roles: string[] } | { ok: false; error: string } {
  const cap = Math.min(format.maxSlides, MAX_CAROUSEL_SLIDES)
  if (count < format.minSlides || count > cap) {
    return {
      ok: false,
      error: `Format "${format.id}" takes ${format.minSlides}–${cap} slides, got ${count}.`,
    }
  }

  const fixed = format.roles.filter((r) => !r.repeatable)
  const repeatable = format.roles.filter((r) => r.repeatable)

  if (repeatable.length === 0) {
    return count === fixed.length
      ? { ok: true, roles: fixed.map((r) => r.id) }
      : { ok: false, error: `Format "${format.id}" has exactly ${fixed.length} slides.` }
  }

  const slack = count - fixed.length
  if (slack < repeatable.length) {
    return {
      ok: false,
      error: `Format "${format.id}" needs at least ${fixed.length + repeatable.length} slides.`,
    }
  }

  // Distribute the slack across repeatable roles, front-loaded when uneven.
  const per = Math.floor(slack / repeatable.length)
  let remainder = slack % repeatable.length

  const roles: string[] = []
  for (const role of format.roles) {
    if (!role.repeatable) {
      roles.push(role.id)
      continue
    }
    const times = per + (remainder > 0 ? 1 : 0)
    if (remainder > 0) remainder -= 1
    for (let i = 0; i < times; i += 1) roles.push(role.id)
  }

  return { ok: true, roles }
}
