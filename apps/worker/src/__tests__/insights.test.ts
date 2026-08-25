import { randomBytes } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetKeyCacheForTests, encryptSecret } from '@claimfold/crypto'
import {
  igAccounts,
  metrics,
  niches,
  organization,
  posts,
  withOrg,
  withoutTenantScope,
} from '@claimfold/db'
import { createTestDatabase, useSharedDatabase, type TestDatabase } from '@claimfold/db/testing'
import type { MediaInsights } from '@claimfold/ig'

/**
 * The measure stage.
 *
 * It had no test at all, which is a particular kind of risk here: nothing in
 * this file's path can run until a post has actually been published to
 * Instagram, and that has never happened. So this code has never executed
 * against real data even once, and every bug in it is still in it.
 *
 * Two things are worth the setup cost of a real Postgres. The first is the
 * "already measured today" clause, which lives in SQL and resolves each post's
 * day in its own CHANNEL's timezone — a rule that cannot be checked without a
 * database that knows what `at time zone 'Pacific/Auckland'` means. The second
 * is the one-row-per-post-per-day upsert, which is enforced by a unique index
 * rather than by application code, so only Postgres can confirm it holds.
 *
 * The file's own comments describe a bug where the day was computed from two
 * different clocks — the candidate scan filtered on an injected `now` while the
 * write called `new Date()` — so a sweep crossing midnight checked one day and
 * wrote another, re-measuring everything it had just measured. That is asserted
 * here, because it is invisible in every other way.
 */

const ORG = 'org_measure'
const OTHER_ORG = 'org_measure_other'
const TOKEN = 'IGQVJXtestaccesstokenformeasuring'

const RULES = {
  requireSources: true,
  publicInterest: false,
  minConfidence: 0.7,
  forbiddenTopics: [],
  requireAdLabel: true,
}
/** Deliberately UTC+12/13: its day rolls over long before UTC's. */
const AUCKLAND = { postsPerWeek: 4, preferredTimes: ['18:00'], timezone: 'Pacific/Auckland' }
const BERLIN = { postsPerWeek: 4, preferredTimes: ['18:00'], timezone: 'Europe/Berlin' }

/** What the Graph API would have returned. Overridden per test. */
const insightsReply = vi.fn<(mediaId: string, accessToken: string) => Promise<MediaInsights>>()

vi.mock('@claimfold/ig', async (importOriginal) => {
  // `InstagramError` must stay the real class — `measurePost` branches on
  // `instanceof` and on `.retryable` to decide skip versus fail.
  //
  // Wrapped in a lambda rather than passed as `fetchInsights: insightsReply`:
  // this factory is hoisted above the declarations above it, so naming the mock
  // directly would read it before initialisation. The lambda defers that to
  // call time.
  const actual = await importOriginal<typeof import('@claimfold/ig')>()
  return {
    ...actual,
    fetchInsights: (mediaId: string, accessToken: string): Promise<MediaInsights> =>
      insightsReply(mediaId, accessToken),
  }
})

const { collectInsights, findPostsToMeasure, measurePost, MEASURE_FOR_DAYS } = await import(
  '../insights-job.ts'
)
const { InstagramError } = await import('@claimfold/ig')

let harness: Awaited<ReturnType<typeof createTestDatabase>>
let db: TestDatabase
let restore: () => void
let aucklandNiche: string
let berlinNiche: string
let otherNiche: string
let accountId: string
let otherAccountId: string

const NUMBERS = {
  reach: 1200,
  impressions: 1500,
  saved: 84,
  shares: 31,
  likes: 210,
  comments: 12,
  profileVisits: 9,
  follows: 3,
}

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64')
  __resetKeyCacheForTests()

  harness = await createTestDatabase()
  db = harness.db
  restore = useSharedDatabase(db)

  await withoutTenantScope(async (tx) => {
    await tx.insert(organization).values([
      { id: ORG, name: 'Measure', slug: 'measure' },
      { id: OTHER_ORG, name: 'Other', slug: 'other' },
    ])
  }, db)

  accountId = await seedAccount(ORG, 'measured_account', 'ig-user-1')
  otherAccountId = await seedAccount(OTHER_ORG, 'other_account', 'ig-user-2')

  aucklandNiche = await seedNiche(ORG, 'auckland', AUCKLAND)
  berlinNiche = await seedNiche(ORG, 'berlin', BERLIN)
  otherNiche = await seedNiche(OTHER_ORG, 'other', BERLIN)
})

afterAll(async () => {
  restore()
  await harness.close()
})

beforeEach(async () => {
  await withoutTenantScope(async (tx) => {
    await tx.delete(metrics)
    await tx.delete(posts)
  }, db)
  insightsReply.mockReset()
  insightsReply.mockResolvedValue({ ...NUMBERS })
})

async function seedAccount(orgId: string, username: string, igUserId: string): Promise<string> {
  const [row] = await withOrg(
    orgId,
    (tx) =>
      tx
        .insert(igAccounts)
        .values({
          orgId,
          igUserId,
          username,
          encryptedToken: encryptSecret(TOKEN, 'ig_access_token', orgId),
          tokenExpiresAt: new Date(Date.now() + 40 * 86_400_000),
          metaAppId: 'app-1',
          encryptedMetaAppSecret: encryptSecret('app-secret', 'meta_app_secret', orgId),
          status: 'connected',
        })
        .returning({ id: igAccounts.id }),
    db,
  )
  return row!.id
}

async function seedNiche(
  orgId: string,
  slug: string,
  cadence: typeof BERLIN,
): Promise<string> {
  const [row] = await withOrg(
    orgId,
    (tx) =>
      tx
        .insert(niches)
        .values({ orgId, slug, name: slug, rules: RULES, cadence })
        .returning({ id: niches.id }),
    db,
  )
  return row!.id
}

/** A post as it looks after a successful publish. */
async function seedPublished(
  opts: {
    orgId?: string
    nicheId?: string
    igAccountId?: string
    title?: string
    publishedAt?: Date
    igMediaId?: string | null
    status?: 'published' | 'scheduled' | 'review'
  } = {},
): Promise<string> {
  const orgId = opts.orgId ?? ORG
  const [row] = await withOrg(
    orgId,
    (tx) =>
      tx
        .insert(posts)
        .values({
          orgId,
          nicheId: opts.nicheId ?? berlinNiche,
          igAccountId: opts.igAccountId ?? accountId,
          format: 'claim-evidence',
          title: opts.title ?? 'Measured post',
          status: opts.status ?? 'published',
          publishedAt: opts.publishedAt ?? new Date(),
          igMediaId: opts.igMediaId === undefined ? 'media-1' : opts.igMediaId,
        })
        .returning({ id: posts.id }),
    db,
  )
  return row!.id
}

async function rowsFor(postId: string) {
  return withoutTenantScope(
    (tx) =>
      tx
        .select({ capturedOn: metrics.capturedOn, saved: metrics.saved, reach: metrics.reach })
        .from(metrics)
        .where(eq(metrics.postId, postId)),
    db,
  )
}

describe('which posts get measured', () => {
  it('picks up a published post that has numbers to read', async () => {
    const postId = await seedPublished()
    expect((await findPostsToMeasure()).map((c) => c.id)).toContain(postId)
  })

  it('ignores anything that was never actually published', async () => {
    const scheduled = await seedPublished({ status: 'scheduled', title: 'Not out yet' })
    // Status says published but Instagram never returned a media id — there is
    // nothing on the platform to ask about.
    const noMedia = await seedPublished({ igMediaId: null, title: 'No media id' })

    const ids = (await findPostsToMeasure()).map((c) => c.id)
    expect(ids).not.toContain(scheduled)
    expect(ids).not.toContain(noMedia)
  })

  it('stops measuring after the thirty-day window', async () => {
    const justInside = await seedPublished({
      title: 'Day 29',
      publishedAt: new Date(Date.now() - (MEASURE_FOR_DAYS - 1) * 86_400_000),
    })
    const justOutside = await seedPublished({
      title: 'Day 31',
      publishedAt: new Date(Date.now() - (MEASURE_FOR_DAYS + 1) * 86_400_000),
    })

    const ids = (await findPostsToMeasure()).map((c) => c.id)
    expect(ids).toContain(justInside)
    expect(ids).not.toContain(justOutside)
  })

  it('spans tenants, because the sweep is the workeritself', async () => {
    const mine = await seedPublished({ title: 'Mine' })
    const theirs = await seedPublished({
      orgId: OTHER_ORG,
      nicheId: otherNiche,
      igAccountId: otherAccountId,
      title: 'Theirs',
    })

    const ids = (await findPostsToMeasure()).map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining([mine, theirs]))
  })

  it('carries the channel timezone through, so the writer can file the day', async () => {
    const postId = await seedPublished({ nicheId: aucklandNiche })
    const candidate = (await findPostsToMeasure()).find((c) => c.id === postId)
    expect(candidate?.timeZone).toBe('Pacific/Auckland')
  })
})

/**
 * The timezone rule, which is the whole reason this is a database test.
 *
 * At 2026-03-10T22:00Z it is already the 11th in Auckland. A reading filed
 * under the Auckland day must count as "measured today"; one filed under the
 * UTC day must not — otherwise an operator in UTC+13 has their evening split
 * across two rows and the next day silently merged.
 */
describe('already measured today, in the channel’s day', () => {
  const NOW = new Date('2026-03-10T22:00:00Z')

  it('skips a post already measured on its own local day', async () => {
    const postId = await seedPublished({ nicheId: aucklandNiche, publishedAt: NOW })
    await withOrg(
      ORG,
      (tx) => tx.insert(metrics).values({ orgId: ORG, postId, capturedOn: '2026-03-11' }),
      db,
    )

    expect((await findPostsToMeasure(NOW)).map((c) => c.id)).not.toContain(postId)
  })

  it('still measures when the only reading is filed under the UTC day', async () => {
    const postId = await seedPublished({ nicheId: aucklandNiche, publishedAt: NOW })
    // The row the old UTC-only code would have written.
    await withOrg(
      ORG,
      (tx) => tx.insert(metrics).values({ orgId: ORG, postId, capturedOn: '2026-03-10' }),
      db,
    )

    expect((await findPostsToMeasure(NOW)).map((c) => c.id)).toContain(postId)
  })

  it('uses each channel’s own day rather than one day for everybody', async () => {
    const auckland = await seedPublished({ nicheId: aucklandNiche, publishedAt: NOW })
    const berlin = await seedPublished({ nicheId: berlinNiche, publishedAt: NOW })

    // 2026-03-10 is still today in Berlin (UTC+1) and already yesterday in
    // Auckland. One date string, two different answers.
    for (const postId of [auckland, berlin]) {
      await withOrg(
        ORG,
        (tx) => tx.insert(metrics).values({ orgId: ORG, postId, capturedOn: '2026-03-10' }),
        db,
      )
    }

    const ids = (await findPostsToMeasure(NOW)).map((c) => c.id)
    expect(ids, 'Berlin has been measured for its own day').not.toContain(berlin)
    expect(ids, 'Auckland has not been measured for its own day').toContain(auckland)
  })
})

describe('storing a reading', () => {
  it('writes the numbers against the post', async () => {
    const postId = await seedPublished()
    const [candidate] = await findPostsToMeasure()

    const outcome = await measurePost(candidate!, '2026-03-10')

    expect(outcome.status).toBe('captured')
    expect(outcome.detail).toContain('84 saves')
    expect(await rowsFor(postId)).toEqual([
      { capturedOn: '2026-03-10', saved: 84, reach: 1200 },
    ])
  })

  it('replaces the day’s reading instead of stacking a second row', async () => {
    const postId = await seedPublished()
    const [candidate] = await findPostsToMeasure()

    await measurePost(candidate!, '2026-03-10')
    insightsReply.mockResolvedValue({ ...NUMBERS, saved: 97, reach: 1400 })
    await measurePost(candidate!, '2026-03-10')

    // The unique index makes this an upsert. Later in the day is the better
    // reading, so it wins; a second row would double every total downstream.
    expect(await rowsFor(postId)).toEqual([
      { capturedOn: '2026-03-10', saved: 97, reach: 1400 },
    ])
  })

  it('keeps a separate row per day', async () => {
    const postId = await seedPublished()
    const [candidate] = await findPostsToMeasure()

    await measurePost(candidate!, '2026-03-10')
    await measurePost(candidate!, '2026-03-11')

    expect(await rowsFor(postId)).toHaveLength(2)
  })
})

describe('when Instagram will not answer', () => {
  it('skips a disconnected account rather than failing the sweep', async () => {
    const postId = await seedPublished()
    const [candidate] = await findPostsToMeasure()
    await withOrg(
      ORG,
      (tx) =>
        tx.update(igAccounts).set({ status: 'token_expired' }).where(eq(igAccounts.id, accountId)),
      db,
    )

    const outcome = await measurePost(candidate!, '2026-03-10')

    expect(outcome.status).toBe('skipped')
    expect(outcome.detail).toContain('token_expired')
    expect(await rowsFor(postId)).toEqual([])
    expect(insightsReply, 'no point spending a call on an account that cannot answer').not
      .toHaveBeenCalled()

    await withOrg(
      ORG,
      (tx) =>
        tx.update(igAccounts).set({ status: 'connected' }).where(eq(igAccounts.id, accountId)),
      db,
    )
  })

  it('skips permanently when the media is gone, so it is not retried forever', async () => {
    await seedPublished()
    const [candidate] = await findPostsToMeasure()
    // (message, code, subcode, httpStatus, retryable)
    insightsReply.mockRejectedValue(
      new InstagramError('Unsupported get request: media 17900 does not exist', 100, undefined, 400, false),
    )

    expect((await measurePost(candidate!, '2026-03-10')).status).toBe('skipped')
  })

  it('reports a retryable error as failed, so the next sweep tries again', async () => {
    await seedPublished()
    const [candidate] = await findPostsToMeasure()
    insightsReply.mockRejectedValue(
      new InstagramError('Application request limit reached', 4, undefined, 429, true),
    )

    expect((await measurePost(candidate!, '2026-03-10')).status).toBe('failed')
  })

  it('never lets an access token reach the outcome detail', async () => {
    await seedPublished()
    const [candidate] = await findPostsToMeasure()
    // Graph errors echo the request back, which is how a token reaches a log.
    insightsReply.mockRejectedValue(
      new Error(`Invalid parameter: access_token=${TOKEN}&metric=reach`),
    )

    const outcome = await measurePost(candidate!, '2026-03-10')
    expect(outcome.detail).not.toContain(TOKEN)
  })
})

describe('a whole sweep', () => {
  it('measures every eligible post once and leaves nothing due', async () => {
    await seedPublished({ title: 'One' })
    await seedPublished({ title: 'Two', nicheId: aucklandNiche })

    const outcomes = await collectInsights()

    expect(outcomes).toHaveLength(2)
    expect(outcomes.every((o) => o.status === 'captured')).toBe(true)
    expect(
      await findPostsToMeasure(),
      'a sweep that leaves its own posts due re-measures them on the next tick',
    ).toEqual([])
  })

  /**
   * One clock, threaded through.
   *
   * `collectInsights` takes `now`, filters candidates against it, and must file
   * the reading under the day derived from that SAME instant. When the write
   * used `new Date()` instead, a sweep running either side of midnight wrote a
   * row for a different day than the one it had just checked — so the post was
   * still "not measured today" and came straight back.
   */
  it('files the reading under the day it filtered on, not the wall clock', async () => {
    const NOW = new Date('2026-03-10T22:00:00Z')
    const postId = await seedPublished({ nicheId: aucklandNiche, publishedAt: NOW })

    await collectInsights(NOW)

    expect(
      (await rowsFor(postId)).map((r) => r.capturedOn),
      'Auckland is already on the 11th at this instant',
    ).toEqual(['2026-03-11'])

    expect(
      (await findPostsToMeasure(NOW)).map((c) => c.id),
      'the post it just measured must not still be due',
    ).not.toContain(postId)
  })
})
