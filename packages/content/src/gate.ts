import type { NichePack } from '@claimfold/niches'

import type { ClaimVerdict, Draft, Verification } from './schemas.ts'

/**
 * A verdict as the gate sees it: the model's output, plus whether a human has
 * since signed it off. `resolvedBy` never comes from the model.
 */
export type GateVerdict = ClaimVerdict & { resolvedBy?: string | null }

/**
 * The publication gate.
 *
 * This is the feature that makes Claimfold not a slop generator: the part that
 * says no. It is deliberately mechanical rather than model-judged — a model
 * deciding whether its own output is trustworthy enough to publish is not a
 * check, and the whole value of the verification stage would evaporate if a
 * persuasive draft could talk its way past it.
 *
 * Blocks stop publication. Warnings are shown to the reviewer, who may proceed.
 */

export interface GateIssue {
  code: string
  /**
   * English prose, always present.
   *
   * Kept as the durable record: it is what gets written into `reviewNotes`
   * when the gate refuses an idea, and that column is read back months later
   * by whoever is answering "why was this not published?". A stored string
   * that renders differently depending on who is looking at it is not a
   * record.
   */
  message: string
  /**
   * The same issue as data, for the interface to translate.
   *
   * The dashboard renders `code` through its own message catalogue and falls
   * back to `message` when it has no translation. That split is why this
   * package needs no knowledge of languages: the pipeline states the fact,
   * the interface decides how to say it.
   */
  params?: Record<string, string | number>
  /** Slide index where the reviewer should look, when attributable. */
  slideIndex?: number
}

export interface GateResult {
  passed: boolean
  blocks: GateIssue[]
  warnings: GateIssue[]
}

export interface GateInput {
  niche: NichePack
  verification: Verification & { verdicts: GateVerdict[] }
  draft?: Draft
  roles?: string[]
  /** True when any affiliate or sponsored link appears in the post. */
  hasCommercialLink?: boolean
  /**
   * Copy edits a person made by hand, and when.
   *
   * Only copy. A theme, accent or layout change touches no claim, and a warning
   * that fires when someone picks a different colour is a warning people learn
   * to click past — which costs exactly when it finally means something.
   */
  edits?: Array<{ slideIndex: number; editedAt: Date }>
  /**
   * The Instagram account this post will publish to, as resolved right now.
   *
   * `undefined` means the caller is not asking about publishability at all — the
   * pipeline evaluates this gate before an account is relevant. `null` means the
   * caller looked and found none, which is a block.
   */
  account?: { username: string; status: string } | null
  /**
   * When this post's claims were checked.
   *
   * Compared against `edits` rather than trusted from the caller as a boolean,
   * so the comparison itself is covered by this package's tests instead of
   * living in whichever interface happened to ask.
   */
  verifiedAt?: Date
}

/**
 * A claim a human knowingly signed off despite its verdict.
 *
 * The gate must have a legitimate override, or an unverifiable-but-true claim
 * (a paywalled source, a book on the reviewer's desk) makes a post permanently
 * unpublishable and the only way out is to bypass the gate entirely — which is
 * exactly the behaviour to avoid. An override is recorded against a user, so it
 * leaves fingerprints rather than being invisible.
 */
export interface ResolvedClaim {
  claim: string
  resolvedBy: string
}

/** Instagram's hard caption ceiling. */
const MAX_CAPTION = 2_200
/** Instagram's hard hashtag ceiling. Relevance beats volume well below this. */
const MAX_HASHTAGS = 30

export function evaluateGate(input: GateInput): GateResult {
  const { niche, verification, draft, roles } = input
  const blocks: GateIssue[] = []
  const warnings: GateIssue[] = []

  /* ── Factual integrity ─────────────────────────────────────────────────── */

  for (const verdict of verification.verdicts) {
    const claim = verdict.claim.slice(0, 90)

    /**
     * A human has taken responsibility for this claim.
     *
     * Downgraded to a warning rather than dropped: the reviewer who approves
     * the post still sees that a verdict was overridden and by whom. Silently
     * accepting it would make the override invisible in exactly the situation
     * where it matters most.
     */
    if (verdict.resolvedBy) {
      warnings.push({
        code: 'claim_resolved_by_human',
        message: `Verdict "${verdict.verdict}" was overridden by a reviewer: "${claim}"`,
        params: { verdict: verdict.verdict, claim },
      })
      continue
    }

    if (verdict.verdict === 'false') {
      // A false core claim is the one thing that must never reach a queue.
      const issue = {
        code: 'claim_false',
        message: `Claim is false: "${claim}"`,
        params: { claim },
      }
      if (verdict.isCore) blocks.push(issue)
      // Same code, because it is the same finding — the scope is what differs,
      // and that travels as a parameter. Renaming the code to carry the
      // distinction would have broken every consumer keying off it, which is
      // what the gate suite caught.
      else
        warnings.push({
          ...issue,
          message: `${issue.message} — remove it from the post.`,
          params: { claim, scope: 'incidental' },
        })
      continue
    }

    if (!verdict.isCore) continue

    if (verdict.verdict === 'unverifiable') {
      blocks.push({
        code: 'claim_unverifiable',
        message: `No usable source found for a core claim: "${claim}"`,
        params: { claim },
      })
      continue
    }

    if (verdict.confidence < niche.rules.minConfidence) {
      blocks.push({
        code: 'claim_low_confidence',
        message:
          `Core claim is below this niche's confidence floor ` +
          `(${verdict.confidence.toFixed(2)} < ${niche.rules.minConfidence}): "${claim}"`,
        params: {
          confidence: verdict.confidence.toFixed(2),
          floor: niche.rules.minConfidence,
          claim,
        },
      })
      continue
    }

    if (niche.rules.requireSources && verdict.sources.length === 0) {
      blocks.push({
        code: 'claim_unsourced',
        message: `Core claim has no cited source: "${claim}"`,
        params: { claim },
      })
    }

    if (verdict.verdict === 'disputed') {
      warnings.push({
        code: 'claim_disputed',
        message: `Sources disagree — must be presented as contested: "${claim}"`,
        params: { claim },
      })
    }
  }

  for (const caveat of verification.caveats) {
    // The verifier's own words, already in the niche's language. Passed
    // through untranslated on purpose — re-rendering it would mean discarding
    // what the verification stage actually said.
    warnings.push({ code: 'caveat', message: caveat })
  }

  if (verification.verdicts.length === 0) {
    blocks.push({
      code: 'not_verified',
      message: 'This post has not been through verification.',
    })
  }

  /* ── Human edits ───────────────────────────────────────────────────────── */

  /**
   * A slide whose words changed after the facts were checked.
   *
   * A warning, not a block, and that is a deliberate editorial position rather
   * than a shortcut. Claims are attached to slides by index, so rewriting a
   * slide leaves verified verdicts standing next to text nobody verified — and
   * the honest response to that is the same one this gate already gives an
   * overridden verdict: say so, name who did it, and let the person who approves
   * the post decide. That named human review is precisely what the AI Act
   * Art. 50(4) exemption asks a deployer to be able to show.
   *
   * What it CANNOT see is an edit that introduces a brand new factual claim.
   * Someone can type an unverified statistic into a slide and this will only
   * report that the slide was edited. Re-checking a single claim on demand is
   * the real answer and is not built yet; until it is, the mitigation is that
   * the editor is named in the record.
   *
   * Skipped entirely when nothing was verified — `not_verified` above is already
   * blocking, and a second finding about a post with no evidence at all adds
   * noise to a screen that has one important sentence on it.
   */
  if (verification.verdicts.length > 0) {
    for (const edit of input.edits ?? []) {
      if (input.verifiedAt && edit.editedAt.getTime() <= input.verifiedAt.getTime()) continue

      warnings.push({
        code: 'slide_edited_after_check',
        // Deliberately avoids the word "verified": this string is written into
        // `reviewNotes` and read back months later, and the product does not
        // describe its own output that way. Same rule the interface copy is
        // held to in apps/web/lib/i18n/__tests__/i18n.test.ts.
        message:
          `Slide ${edit.slideIndex + 1} was edited by hand after its claims were looked up. ` +
          `The sources recorded for it were read against the earlier wording.`,
        params: { slide: edit.slideIndex + 1 },
        slideIndex: edit.slideIndex,
      })
    }
  }

  /* ── Publishability ────────────────────────────────────────────────────── */

  if (draft) {
    if (draft.caption.length > MAX_CAPTION) {
      blocks.push({
        code: 'caption_too_long',
        message: `Caption is ${draft.caption.length} characters; Instagram allows ${MAX_CAPTION}.`,
        params: { length: draft.caption.length, max: MAX_CAPTION },
      })
    }

    if (draft.hashtags.length > MAX_HASHTAGS) {
      blocks.push({
        code: 'too_many_hashtags',
        message: `${draft.hashtags.length} hashtags; Instagram allows ${MAX_HASHTAGS}.`,
        params: { count: draft.hashtags.length, max: MAX_HASHTAGS },
      })
    }

    // Alt text is both an accessibility duty and search metadata, and it is
    // trivially easy to skip — so it blocks rather than warns.
    draft.slides.forEach((slide, i) => {
      if (!slide.altText?.trim()) {
        blocks.push({
          code: 'missing_alt_text',
          message: `Slide ${i + 1} has no alt text.`,
          params: { slide: i + 1 },
          slideIndex: i,
        })
      }
    })

    if (draft.slides.length < 2 || draft.slides.length > 10) {
      blocks.push({
        code: 'slide_count',
        message: `${draft.slides.length} slides; a carousel takes 2–10.`,
        params: { count: draft.slides.length },
      })
    }

    /**
     * Every format opens with a hook, and reordering by hand can undo that.
     *
     * A warning rather than a block: slide one is the only slide most people
     * ever see and putting the sources there is almost certainly a mistake, but
     * it is the operator's carousel and there are reasons to break the pattern.
     * Blocking would mean the person who rearranged their own post gets told no
     * by software with a weaker opinion than theirs.
     */
    if (draft.slides.length > 0 && draft.slides[0]!.role !== 'hook') {
      warnings.push({
        code: 'hook_not_first',
        message:
          `The carousel opens with a "${draft.slides[0]!.role}" slide rather than the hook. ` +
          `Slide one is the only slide most people see.`,
        params: { role: draft.slides[0]!.role },
        slideIndex: 0,
      })
    }

    if (roles && draft.slides.length !== roles.length) {
      blocks.push({
        code: 'plan_mismatch',
        message: `Draft has ${draft.slides.length} slides but the plan called for ${roles.length}.`,
        params: { actual: draft.slides.length, expected: roles.length },
      })
    }

    if (roles) {
      draft.slides.forEach((slide, i) => {
        if (roles[i] && slide.role !== roles[i]) {
          warnings.push({
            code: 'role_mismatch',
            message: `Slide ${i + 1} is "${slide.role}", plan expected "${roles[i]}".`,
            params: { slide: i + 1, actual: slide.role, expected: roles[i] ?? '' },
            slideIndex: i,
          })
        }
      })
    }

    if (niche.rules.requireSources) {
      const hasSourceSlide = draft.slides.some((s) => s.role === 'sources')
      if (!hasSourceSlide) {
        blocks.push({
          code: 'missing_sources_slide',
          message: 'This niche requires sources, but the draft has no sources slide.',
        })
      }
    }
  }

  /* ── Can this physically be published? ─────────────────────────────────── */

  /**
   * Approving a post that has nowhere to go used to be allowed.
   *
   * The result was not an error, which is what made it bad: the worker selected
   * the post, could not resolve an account, returned a failure WITHOUT writing
   * it, and left the post `scheduled` — so it was picked up again on the next
   * tick, and every tick after that, forever. Nothing published and nothing
   * anywhere said why.
   *
   * Blocking rather than warning, because unlike every other finding here this
   * one is not an editorial judgement a person can take responsibility for. A
   * post with no account cannot be published by anybody.
   *
   * `undefined` skips the check: the pipeline runs this gate before an account is
   * part of the question, and a block it cannot act on would stop generation.
   */
  if (input.account === null) {
    blocks.push({
      code: 'no_account',
      message:
        'This post has no Instagram account to publish to. Connect one, then choose it on the channel.',
    })
  } else if (input.account && input.account.status !== 'connected') {
    blocks.push({
      code: 'account_not_connected',
      message:
        `The account @${input.account.username} is "${input.account.status}" rather than connected, ` +
        `so publishing would fail. Reconnect it first.`,
      params: { username: input.account.username, status: input.account.status },
    })
  }

  /* ── Disclosure ────────────────────────────────────────────────────────── */

  if (input.hasCommercialLink && niche.rules.requireAdLabel) {
    warnings.push({
      code: 'ad_label_required',
      message:
        'This post carries a commercial link and must be labelled as advertising ' +
        'before publication (§ 5a UWG for German operators).',
    })
  }

  return { passed: blocks.length === 0, blocks, warnings }
}
