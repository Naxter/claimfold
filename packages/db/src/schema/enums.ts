import { pgEnum } from 'drizzle-orm/pg-core'

/**
 * Lifecycle of a carousel, from raw idea to live post.
 *
 * **Five of these eleven values are never written.** The enum describes a state
 * machine that was designed and then not built: `saveDraft` writes only
 * `review` or `rejected`, and `approvePost` writes only `scheduled`. So `idea`,
 * `drafted`, `checked` and `rendered` are unreachable, and `approved` is
 * written by nothing and read only as a legacy rescue in the worker.
 *
 * The real lifecycle is `review | rejected → scheduled → publishing →
 * published | failed`.
 *
 * They stay in the type rather than being removed, for one boring reason and
 * one good one. The boring one: dropping a value from a Postgres enum means
 * recreating the type and rewriting every dependent column, which is a risky
 * migration to run over live data in exchange for tidiness. The good one:
 * `approved` rows genuinely exist in older installs, and the worker's rescue
 * clause needs the value to remain valid in order to sweep them up.
 *
 * What must NOT happen is new code starting to write the dead ones and
 * reintroducing a stage the interface has no column for. `REACHABLE_POST_STATUSES`
 * below is what a test asserts against.
 */
export const postStatus = pgEnum('post_status', [
  'idea',
  'drafted',
  'checked',
  'rendered',
  'review',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'rejected',
])

/**
 * The statuses anything is allowed to write.
 *
 * `approved` is readable-but-not-writable: the worker rescues rows that already
 * carry it, and nothing may create a new one.
 */
export const REACHABLE_POST_STATUSES = [
  'review',
  'rejected',
  'scheduled',
  'publishing',
  'published',
  'failed',
] as const

/** Values kept only so old rows remain valid. Nothing may write these. */
export const LEGACY_POST_STATUSES = ['idea', 'drafted', 'checked', 'rendered', 'approved'] as const

/**
 * Outcome of checking a single factual assertion against sources.
 *
 * `unverifiable` is deliberately distinct from `disputed`: "no good source
 * exists" is a different editorial decision from "sources disagree", and we
 * want the reviewer to see which one they are looking at.
 */
export const claimVerdict = pgEnum('claim_verdict', [
  'supported',
  'disputed',
  'false',
  'unverifiable',
])

/** Feature gates for the self-hosted licence. Verified offline (Ed25519). */
export const licenseTier = pgEnum('license_tier', [
  'evaluation',
  'solo',
  'studio',
  'agency',
])

export const memberRole = pgEnum('member_role', ['owner', 'admin', 'editor', 'viewer'])

/** Health of a connected Instagram account, surfaced in the dashboard. */
export const igAccountStatus = pgEnum('ig_account_status', [
  'connected',
  'token_expiring',
  'token_expired',
  'error',
  'disconnected',
])

export const jobStatus = pgEnum('job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])

/**
 * NOTE ON DELIBERATE NON-ENUMS
 *
 * `posts.format` and `slides.role` are plain text, not enums, on purpose.
 * They are defined by the active niche pack at runtime, so a user adding a
 * new slide format ("common-mistakes", "before-after", …) must not require a
 * database migration. Validation happens against the niche pack in
 * packages/niches, not in the schema.
 *
 * This is the single most important concession to being topic-agnostic:
 * the day the schema hard-codes "myth" and "fact", the product only does
 * myth-vs-fact.
 */
