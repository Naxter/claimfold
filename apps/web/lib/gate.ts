import { evaluateGate, type GateResult } from '@claimfold/content'
import { getAccount, getPost, type AccountSummary, type PostDetail } from '@claimfold/db'

import { describeNicheErrors, packFromRow } from './niche.ts'

/**
 * Server-side gate evaluation.
 *
 * The single place the publication gate is decided, used by BOTH the review
 * page and the approve action. Previously the page computed a verdict and the
 * action trusted a `disabled` attribute to have prevented the click — which
 * meant deleting one HTML attribute in devtools, or posting to the server
 * action directly, published a post with a false core claim. A server action
 * is a public endpoint; the only check that counts is the one on the server.
 */

/**
 * Whether this post carries a link somebody could earn from.
 *
 * `requireAdLabel` is a rule every channel carries and the gate has always
 * checked, but `hasCommercialLink` was never set by anything — so the
 * `ad_label_required` warning could not fire, and a German operator relying on
 * that § 5a UWG safeguard had one that never went off.
 *
 * Deliberately crude: any http(s) URL in the caption, the first comment or a
 * slide counts. Trying to tell an affiliate link from a citation would be
 * guessing about somebody's commercial arrangements, and the finding is a
 * warning a person reads and dismisses, so a false positive costs a glance while
 * a false negative costs a fine.
 */
function carriesLink(text: string[]): boolean {
  return text.some((value) => /https?:\/\//i.test(value))
}

/**
 * Whether a reviewer needs an override to get past this claim.
 *
 * The third condition is the one that was missing, and its absence was a dead
 * end. A core claim the research returned as `supported` with confidence above
 * the floor but with an empty source list blocks the gate on `claim_unsourced`
 * whenever the channel requires sources — and this said it needed no override, so
 * the claim rendered a green "sources agree" badge with no control beneath it
 * while the panel above said the post could not go out. Nothing writes
 * `claims.sources` after generation, so there was no way past it at all.
 *
 * The gate's own comment argues the override exists precisely so a post cannot
 * become permanently unpublishable. This is the case it did not cover — which is
 * why the rule now lives here, next to the gate, with a test on it rather than
 * buried in a page.
 */
export function needsOverride(
  claim: { verdict: string; confidence: number; sources: unknown[] },
  rules: { minConfidence: number; requireSources: boolean },
): boolean {
  if (claim.verdict !== 'supported') return true
  if (claim.confidence < rules.minConfidence) return true
  return rules.requireSources && claim.sources.length === 0
}

export interface PostGate {
  detail: PostDetail
  gate: GateResult
  /** Where this post will publish, so the review screen can name it. */
  account: AccountSummary | null
}

export async function evaluatePostGate(
  orgId: string,
  postId: string,
): Promise<PostGate | null> {
  const detail = await getPost(orgId, postId)
  if (!detail) return null

  const { post, niche, slides, claims } = detail

  /**
   * Which account this post would actually publish to.
   *
   * Read from the post rather than from its channel, because the post carries a
   * copy taken when it was created and may also have been overridden by hand on
   * the review screen. The channel is where the value comes from; the post is
   * where it is true.
   */
  const account = post.igAccountId ? await getAccount(orgId, post.igAccountId) : null

  // Niches are stored as loose jsonb. Validate before trusting them, so a
  // hand-edited niche cannot produce a nonsense verdict in either direction.
  const parsed = packFromRow(niche)

  if (!parsed.ok) {
    // Fail closed. An unreadable niche means we cannot know what the rules
    // are, which is not the same as there being none.
    return {
      detail,
      account,
      gate: {
        passed: false,
        blocks: [
          {
            code: 'invalid_niche',
            message: `Niche configuration is invalid, so the gate cannot be evaluated: ${describeNicheErrors(parsed.errors)}`,
          },
        ],
        warnings: [],
      },
    }
  }

  const gate = evaluateGate({
    niche: parsed.pack,
    verification: {
      verdicts: claims.map((c) => ({
        claim: c.claim,
        verdict: c.verdict,
        confidence: c.confidence,
        reasoning: c.reasoning,
        isCore: c.isCore,
        sources: c.sources,
        // Never from the model — set only by an explicit human override.
        resolvedBy: c.resolvedBy,
      })),
      caveats: [],
    },
    draft: {
      slides: slides.map((s) => ({
        role: s.role,
        altText: s.altText,
        ...(s.content as Record<string, never>),
      })),
      caption: post.caption,
      hashtags: post.hashtags,
      hook: post.hook,
    },
    /**
     * The roles the post actually has, which makes `plan_mismatch` and
     * `role_mismatch` inert here — deliberately, and it should stay that way.
     *
     * Those two findings exist to catch the *writing model* deviating from the
     * plan it was given, which is a generation-time question and is checked
     * there. Once slides can be added, removed and reordered by hand, the
     * person's structure is the authoritative one; comparing it against the
     * format's plan would greet every rearranged carousel with a mismatch it
     * cannot resolve. `slide_count` still applies, because 2–10 is Instagram's
     * rule rather than ours, and `hook_not_first` warns without blocking.
     */
    roles: slides.map((s) => s.role),
    hasCommercialLink: carriesLink([
      post.caption,
      post.firstComment ?? '',
      ...slides.map((slide) => JSON.stringify(slide.content)),
    ]),
    // Passed as a value, never omitted: omitting it would skip the check, and a
    // post that cannot be published must not be approvable.
    account: account ? { username: account.username, status: account.status } : null,
    edits: slides
      .filter((s): s is typeof s & { editedAt: Date } => s.editedAt !== null)
      .map((s) => ({ slideIndex: s.index, editedAt: s.editedAt })),
    /**
     * The latest check time across the post's claims.
     *
     * Latest rather than earliest: claims are written in one transaction, so
     * they share a moment in practice, and taking the max means a claim added
     * by a later re-check does not make every earlier edit look suspicious.
     */
    verifiedAt: claims.reduce<Date | undefined>(
      (latest, claim) =>
        !latest || claim.checkedAt.getTime() > latest.getTime() ? claim.checkedAt : latest,
      undefined,
    ),
  })

  return { detail, gate, account }
}

/** Statuses from which approval is legitimate. */
const APPROVABLE = new Set(['review', 'drafted', 'checked', 'rendered', 'approved', 'rejected'])

export class GateBlockedError extends Error {
  constructor(readonly blocks: GateResult['blocks']) {
    super(`Blocked by the publication gate: ${blocks.map((b) => b.message).join('; ')}`)
    this.name = 'GateBlockedError'
  }
}

/**
 * Throws unless this post may be approved right now.
 *
 * Also enforces the status transition: without it, an already-scheduled or
 * published post could be re-approved with a new time, which the UI prevented
 * only by disabling a button.
 */
export async function assertApprovable(orgId: string, postId: string): Promise<PostGate> {
  const result = await evaluatePostGate(orgId, postId)
  if (!result) throw new Error('Post not found')

  if (!APPROVABLE.has(result.detail.post.status)) {
    throw new GateBlockedError([
      {
        code: 'bad_status',
        message: `A post with status "${result.detail.post.status}" cannot be approved.`,
      },
    ])
  }

  if (!result.gate.passed) throw new GateBlockedError(result.gate.blocks)

  return result
}
