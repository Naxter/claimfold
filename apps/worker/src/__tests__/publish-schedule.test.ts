import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  approvePost,
  niches,
  organization,
  posts,
  user,
  withoutTenantScope,
  withOrg,
} from '@claimfold/db'
import { createTestDatabase, useSharedDatabase, type TestDatabase } from '@claimfold/db/testing'

import { findDuePosts, publishPost } from '../publish-job.ts'

/**
 * The handover from review to the worker.
 *
 * This is the seam where the product quietly stopped working. Approving a post
 * in the dashboard, the worker picking it up, and Instagram receiving it are
 * three well-tested things with nothing asserting that the first leads to the
 * second — so a post could be approved by a person, sit in the "Approved"
 * column looking finished, and never be published by anything.
 *
 * Every individual piece passed its own tests the whole time. That is exactly
 * why the test belongs here, between them, and not inside either.
 */

const RULES = {
  requireSources: true,
  publicInterest: false,
  minConfidence: 0.7,
  forbiddenTopics: [],
  requireAdLabel: true,
}
const CADENCE = { postsPerWeek: 4, preferredTimes: ['18:00'], timezone: 'Europe/Berlin' }

const ORG = 'org_publish'
const REVIEWER = 'user_reviewer'

let harness: Awaited<ReturnType<typeof createTestDatabase>>
let db: TestDatabase
let restore: () => void
let nicheId: string

beforeAll(async () => {
  harness = await createTestDatabase()
  db = harness.db
  // Before any repository call: `approvePost` and `findDuePosts` both resolve
  // the shared proxy, and without this they would open the configured
  // database instead of this in-memory one.
  restore = useSharedDatabase(db)

  await withoutTenantScope(async (tx) => {
    await tx.insert(organization).values({ id: ORG, name: 'Publish', slug: 'publish' })
    // `posts.approved_by` is a real foreign key — approving needs a reviewer
    // who exists, which is the point of recording who signed off.
    await tx.insert(user).values({ id: REVIEWER, name: 'Reviewer', email: 'reviewer@example.test' })
  }, db)

  const [niche] = await withOrg(
    ORG,
    (tx) =>
      tx
        .insert(niches)
        .values({
          orgId: ORG,
          slug: 'publish-niche',
          name: 'Publish Niche',
          rules: RULES,
          cadence: CADENCE,
        })
        .returning({ id: niches.id }),
    db,
  )
  nicheId = niche!.id
})

afterAll(async () => {
  restore()
  await harness.close()
})

/** A post sitting in review, the state the dashboard approves from. */
async function seedPost(title: string): Promise<string> {
  const [row] = await withOrg(
    ORG,
    (tx) =>
      tx
        .insert(posts)
        .values({ orgId: ORG, nicheId, format: 'claim-evidence', title, status: 'review' })
        .returning({ id: posts.id }),
    db,
  )
  return row!.id
}

async function statusOf(postId: string): Promise<string> {
  const [row] = await withOrg(
    ORG,
    (tx) => tx.select({ status: posts.status }).from(posts).where(eq(posts.id, postId)),
    db,
  )
  return row!.status
}

describe('approving hands the post to the worker', () => {
  it('publishes a post approved for immediate release', async () => {
    const postId = await seedPost('Publish now')

    // Exactly what the review page does when no time is chosen.
    await approvePost(ORG, postId, REVIEWER, null)

    const due = await findDuePosts()
    expect(
      due.map((row) => row.id),
      'a post a person approved must be reachable by the worker; anything else is a dead end that looks like success',
    ).toContain(postId)
  })

  it('leaves nothing in a status the worker cannot reach', async () => {
    const postId = await seedPost('Reachable')
    await approvePost(ORG, postId, REVIEWER, null)

    // The specific regression: `approved` was a terminal state, because the
    // only query that moves a post onward asks for `scheduled`.
    expect(await statusOf(postId)).toBe('scheduled')
  })

  it('still rescues posts approved before scheduling existed', async () => {
    // Written the way the old code wrote them: signed off, no time, and no
    // route to the worker. Set directly rather than through `approvePost`,
    // which can no longer produce this row.
    const postId = await seedPost('Legacy approval')
    await withOrg(
      ORG,
      (tx) =>
        tx
          .update(posts)
          .set({ status: 'approved', approvedBy: REVIEWER, approvedAt: new Date() })
          .where(eq(posts.id, postId)),
      db,
    )

    const due = await findDuePosts()
    expect(due.map((row) => row.id)).toContain(postId)
  })

  it('holds a post approved for later until its time arrives', async () => {
    const postId = await seedPost('Publish later')
    const inAnHour = new Date(Date.now() + 60 * 60 * 1000)

    await approvePost(ORG, postId, REVIEWER, inAnHour)
    expect(await statusOf(postId)).toBe('scheduled')

    const dueNow = await findDuePosts()
    expect(dueNow.map((row) => row.id)).not.toContain(postId)

    const dueLater = await findDuePosts(new Date(Date.now() + 2 * 60 * 60 * 1000))
    expect(dueLater.map((row) => row.id)).toContain(postId)
  })
})

/**
 * The loop that ate every scheduled post.
 *
 * `posts.igAccountId` was read by the worker and written by nothing, so
 * `loadContext` always returned null. `publishPost` then returned a failure
 * WITHOUT writing it, the post stayed `scheduled`, and `findDuePosts` handed it
 * back on the next tick — every thirty seconds, forever, with nothing published
 * and nothing anywhere saying why.
 *
 * The account binding is fixed by giving channels an account. This asserts the
 * other half, which has to hold whatever the reason was: a terminal refusal gets
 * written down. Without that, any future unresolvable cause reopens the loop.
 */
describe('a post the worker cannot publish', () => {
  it('is marked failed rather than left scheduled forever', async () => {
    process.env['PUBLIC_ASSET_URL'] = 'https://assets.example.test'

    const postId = await seedPost('No account anywhere')
    await approvePost(ORG, postId, REVIEWER, null)

    // The post has no igAccountId, so the context cannot be built. This is the
    // exact state every post in the product was in.
    const outcome = await publishPost(ORG, postId)
    expect(outcome.status).toBe('failed')

    expect(
      await statusOf(postId),
      'a post left scheduled after an unrecoverable failure is retried on every tick for as long as the worker lives',
    ).toBe('failed')

    // And it says why, in the column the review screen reads back.
    const [row] = await withOrg(
      ORG,
      (tx) => tx.select({ reason: posts.failureReason }).from(posts).where(eq(posts.id, postId)),
      db,
    )
    expect(row!.reason).toMatch(/account/i)
  })

  it('is no longer due, so the queue drains', async () => {
    process.env['PUBLIC_ASSET_URL'] = 'https://assets.example.test'

    const postId = await seedPost('Also no account')
    await approvePost(ORG, postId, REVIEWER, null)
    await publishPost(ORG, postId)

    expect((await findDuePosts()).map((row) => row.id)).not.toContain(postId)
  })
})
