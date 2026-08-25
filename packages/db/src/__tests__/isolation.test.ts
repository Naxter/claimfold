import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { withOrg, withoutTenantScope } from '../rls.ts'
import { createTestDatabase, type TestDatabase } from '../testing.ts'
import { niches, organization, posts } from '../schema/index.ts'

/**
 * The test that protects the business.
 *
 * Claimfold is sold to people who each connect their own Instagram account.
 * One tenant reading another tenant's rows is not a bug to be fixed in a patch
 * release — it is the kind of thing that ends the product. So this suite does
 * not check that our queries filter correctly; it checks that the DATABASE
 * refuses to return other tenants' rows even when the query is deliberately
 * written wrong.
 */

const RULES = {
  requireSources: true,
  publicInterest: false,
  minConfidence: 0.7,
  forbiddenTopics: [],
  requireAdLabel: true,
}
const CADENCE = { postsPerWeek: 4, preferredTimes: ['18:00'], timezone: 'Europe/Berlin' }

let harness: Awaited<ReturnType<typeof createTestDatabase>>
let db: TestDatabase

const ORG_A = 'org_alpha'
const ORG_B = 'org_beta'
let nicheA: string
let nicheB: string

beforeAll(async () => {
  harness = await createTestDatabase()
  db = harness.db

  // Seed two tenants with the guard rails off, the way a migration or an
  // admin task would.
  await withoutTenantScope(async (tx) => {
    await tx.insert(organization).values([
      { id: ORG_A, name: 'Alpha', slug: 'alpha' },
      { id: ORG_B, name: 'Beta', slug: 'beta' },
    ])
  }, db)

  const [a] = await withOrg(
    ORG_A,
    (tx) =>
      tx
        .insert(niches)
        .values({
          orgId: ORG_A,
          slug: 'alpha-niche',
          name: 'Alpha Niche',
          rules: RULES,
          cadence: CADENCE,
        })
        .returning({ id: niches.id }),
    db,
  )
  const [b] = await withOrg(
    ORG_B,
    (tx) =>
      tx
        .insert(niches)
        .values({
          orgId: ORG_B,
          slug: 'beta-niche',
          name: 'Beta Niche',
          rules: RULES,
          cadence: CADENCE,
        })
        .returning({ id: niches.id }),
    db,
  )

  nicheA = a!.id
  nicheB = b!.id
})

afterAll(async () => {
  await harness.close()
})

describe('row-level security', () => {
  it('hides other tenants rows from an unfiltered SELECT', async () => {
    // Deliberately no WHERE clause. Application-layer scoping would leak here.
    const rows = await withOrg(ORG_A, (tx) => tx.select().from(niches), db)

    expect(rows).toHaveLength(1)
    expect(rows[0]!.slug).toBe('alpha-niche')
  })

  it('refuses to write a row belonging to another tenant', async () => {
    // The WITH CHECK half of the policy: A cannot forge a row owned by B.
    await expect(
      withOrg(
        ORG_A,
        (tx) =>
          tx.insert(niches).values({
            orgId: ORG_B,
            slug: 'smuggled',
            name: 'Smuggled',
            rules: RULES,
            cadence: CADENCE,
          }),
        db,
      ),
    ).rejects.toThrow()
  })

  it('cannot update another tenants row even when targeting it by primary key', async () => {
    const updated = await withOrg(
      ORG_A,
      (tx) => tx.update(niches).set({ name: 'Hijacked' }).where(eq(niches.id, nicheB)).returning(),
      db,
    )
    expect(updated).toHaveLength(0)

    // And B's row is untouched.
    const [row] = await withOrg(ORG_B, (tx) => tx.select().from(niches), db)
    expect(row!.name).toBe('Beta Niche')
  })

  it('cannot delete another tenants row', async () => {
    const deleted = await withOrg(
      ORG_A,
      (tx) => tx.delete(niches).where(eq(niches.id, nicheB)).returning(),
      db,
    )
    expect(deleted).toHaveLength(0)
  })

  it('cannot move an owned row to another tenant', async () => {
    // Re-parenting is the subtle one: the USING clause permits reading the row,
    // so only WITH CHECK stops the write.
    await expect(
      withOrg(
        ORG_A,
        (tx) => tx.update(niches).set({ orgId: ORG_B }).where(eq(niches.id, nicheA)),
        db,
      ),
    ).rejects.toThrow()
  })

  it('applies to every tenant table, not just the one under test', async () => {
    await withOrg(
      ORG_B,
      (tx) =>
        tx.insert(posts).values({
          orgId: ORG_B,
          nicheId: nicheB,
          format: 'claim-evidence',
          title: 'Beta post',
        }),
      db,
    )

    const visibleToA = await withOrg(ORG_A, (tx) => tx.select().from(posts), db)
    expect(visibleToA).toHaveLength(0)

    const visibleToB = await withOrg(ORG_B, (tx) => tx.select().from(posts), db)
    expect(visibleToB).toHaveLength(1)
  })

  it('refuses to run a scoped query with no organization', async () => {
    await expect(withOrg('', async () => undefined, db)).rejects.toThrow(
      /without an organization/i,
    )
  })
})
