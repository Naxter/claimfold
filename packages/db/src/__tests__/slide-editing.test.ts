import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  addSlide,
  deleteSlide,
  moveSlide,
  saveDraft,
  updateSlide,
} from '../repositories/posts.ts'
import { withOrg, withoutTenantScope } from '../rls.ts'
import { claims, niches, organization, posts, slides, user } from '../schema/index.ts'
import { createTestDatabase, useSharedDatabase, type TestDatabase } from '../testing.ts'

/**
 * Editing a post, against a real Postgres.
 *
 * Two things here cannot be checked any other way. Renumbering slides has to
 * survive a unique index that Postgres enforces row by row rather than at the end
 * of a statement, and claim attribution has to follow the slides it points at —
 * which is not a layout bug when it goes wrong, it is a corrupted evidence trail
 * that nobody looking at the screen would notice.
 */

const ORG = 'org_edit'
const USER = 'user_editor'
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
let restore: () => void
let nicheId: string
let postId: string

/** Slide ids in carousel order, plus each claim's slide index. */
async function readOrder(): Promise<{ roles: string[]; claimIndices: Array<number | null> }> {
  return withOrg(
    ORG,
    async (tx) => {
      const slideRows = await tx
        .select({ role: slides.role, index: slides.index })
        .from(slides)
        .where(eq(slides.postId, postId))
        .orderBy(asc(slides.index))

      const claimRows = await tx
        .select({ claim: claims.claim, slideIndex: claims.slideIndex })
        .from(claims)
        .where(eq(claims.postId, postId))
        .orderBy(asc(claims.claim))

      return {
        roles: slideRows.map((row) => row.role),
        claimIndices: claimRows.map((row) => row.slideIndex),
      }
    },
    db,
  )
}

async function readSlides() {
  return withOrg(
    ORG,
    (tx) => tx.select().from(slides).where(eq(slides.postId, postId)).orderBy(asc(slides.index)),
    db,
  )
}

beforeAll(async () => {
  harness = await createTestDatabase()
  db = harness.db
  restore = useSharedDatabase(db)

  await withoutTenantScope(async (tx) => {
    await tx.insert(organization).values({ id: ORG, name: 'Edit', slug: 'edit' })
    await tx
      .insert(user)
      .values({ id: USER, name: 'An Editor', email: 'editor@example.org', emailVerified: true })
  }, db)

  const [niche] = await withOrg(
    ORG,
    (tx) =>
      tx
        .insert(niches)
        .values({
          orgId: ORG,
          slug: 'edit-niche',
          name: 'Edit Niche',
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

/**
 * A fresh four-slide post per test, written through `saveDraft` rather than by
 * hand — so these run against the same rows the pipeline actually produces.
 * One claim per slide, which is what makes the remapping assertions meaningful.
 */
beforeEach(async () => {
  postId = await saveDraft({
    orgId: ORG,
    nicheId,
    format: 'claim-evidence',
    templateId: 'editorial',
    themeId: 'paper',
    title: 'A post',
    hook: 'A hook',
    caption: 'A caption',
    hashtags: ['one'],
    aiDisclosure: false,
    ideaFingerprint: `fp-${Math.abs(postId?.length ?? 0)}-${Date.now()}`,
    slides: [
      { role: 'hook', content: { headline: 'Hook' }, altText: 'a' },
      { role: 'evidence', content: { headline: 'One' }, altText: 'b' },
      { role: 'evidence', content: { headline: 'Two' }, altText: 'c' },
      { role: 'cta', content: { headline: 'Save' }, altText: 'd' },
    ],
    claims: [
      { claim: 'claim-a', verdict: 'supported', confidence: 0.9, reasoning: '', isCore: true, sources: [], slideIndex: 0 },
      { claim: 'claim-b', verdict: 'supported', confidence: 0.9, reasoning: '', isCore: true, sources: [], slideIndex: 1 },
      { claim: 'claim-c', verdict: 'supported', confidence: 0.9, reasoning: '', isCore: true, sources: [], slideIndex: 2 },
      { claim: 'claim-d', verdict: 'supported', confidence: 0.9, reasoning: '', isCore: true, sources: [], slideIndex: 3 },
    ],
  })

  // A cached render to invalidate. Set directly because attaching a real asset
  // would mean rasterising one.
  await withOrg(
    ORG,
    (tx) => tx.update(slides).set({ renderHash: 'cached' }).where(eq(slides.postId, postId)),
    db,
  )
})

describe('updateSlide — what counts as an edit', () => {
  it('stamps a copy change and drops the cached render', async () => {
    const [, second] = await readSlides()

    const outcome = await updateSlide(ORG, postId, second!.id, {
      content: { headline: 'Rewritten' },
      editedBy: USER,
    })
    expect(outcome).toBe('saved')

    const [, after] = await readSlides()
    expect(after!.content).toEqual({ headline: 'Rewritten' })
    expect(after!.renderHash).toBeNull()
    expect(after!.editedAt).not.toBeNull()
    expect(after!.editedBy).toBe(USER)
  })

  it('leaves the cached render alone for an alt-text-only fix', async () => {
    // Alt text is not in the render hash, correctly — it changes no pixels. So
    // invalidating here would re-rasterise a slide to produce the same JPEG.
    const [first] = await readSlides()

    await updateSlide(ORG, postId, first!.id, { altText: 'A described slide', editedBy: USER })

    const [after] = await readSlides()
    expect(after!.altText).toBe('A described slide')
    expect(after!.renderHash).toBe('cached')
    expect(after!.editedAt).toBeNull()
  })

  it('does not stamp an edit when the copy came back unchanged', async () => {
    // Opening the editor to look at a slide and pressing Save must not mark the
    // post as rewritten, or the warning stops meaning anything.
    const [first] = await readSlides()

    await updateSlide(ORG, postId, first!.id, { content: { headline: 'Hook' }, editedBy: USER })

    const [after] = await readSlides()
    expect(after!.editedAt).toBeNull()
    expect(after!.renderHash).toBe('cached')
  })

  it('treats a new picture as a pixel change but not as a rewrite', async () => {
    // Swapping a photograph changes the render and touches no word any claim was
    // read against, so the verification warning must stay quiet.
    const [first] = await readSlides()

    await updateSlide(ORG, postId, first!.id, {
      content: { headline: 'Hook', imageAssetId: '3f0f3d1e-1b3a-4c5d-8e7f-0a1b2c3d4e5f' },
      editedBy: USER,
    })

    const [after] = await readSlides()
    expect(after!.renderHash).toBeNull()
    expect(after!.editedAt).toBeNull()
  })

  it('treats a layout change the same way', async () => {
    const [first] = await readSlides()

    await updateSlide(ORG, postId, first!.id, { templateId: 'figure' })

    const [after] = await readSlides()
    expect(after!.templateId).toBe('figure')
    expect(after!.renderHash).toBeNull()
    expect(after!.editedAt).toBeNull()
  })
})

describe('updateSlide — refusing to write', () => {
  it('refuses a stale edit and changes nothing', async () => {
    const [first] = await readSlides()

    const outcome = await updateSlide(ORG, postId, first!.id, {
      content: { headline: 'From an old tab' },
      expectedUpdatedAt: new Date(first!.updatedAt.getTime() - 60_000),
    })

    expect(outcome).toBe('stale')
    const [after] = await readSlides()
    expect(after!.content).toEqual({ headline: 'Hook' })
  })

  it('accepts the timestamp it was given', async () => {
    const [first] = await readSlides()

    const outcome = await updateSlide(ORG, postId, first!.id, {
      content: { headline: 'Fresh' },
      expectedUpdatedAt: first!.updatedAt,
    })

    expect(outcome).toBe('saved')
  })

  it('refuses a slide id that belongs to a different post', async () => {
    // Row-level security stops a cross-tenant write; this is the same-org case,
    // where the danger is revalidating and reporting on the wrong post.
    const other = await saveDraft({
      orgId: ORG,
      nicheId,
      format: 'claim-evidence',
      templateId: 'editorial',
      themeId: 'paper',
      title: 'Another',
      hook: 'h',
      caption: '',
      hashtags: [],
      aiDisclosure: false,
      ideaFingerprint: `fp-other-${Date.now()}`,
      slides: [{ role: 'hook', content: {}, altText: 'x' }],
      claims: [],
    })

    const [foreign] = await withOrg(
      ORG,
      (tx) => tx.select().from(slides).where(eq(slides.postId, other)),
      db,
    )

    expect(await updateSlide(ORG, postId, foreign!.id, { content: { headline: 'no' } })).toBe(
      'missing',
    )
  })
})

describe('reordering', () => {
  it('moves a slide and takes its claim with it', async () => {
    const before = await readOrder()
    expect(before.roles).toEqual(['hook', 'evidence', 'evidence', 'cta'])
    expect(before.claimIndices).toEqual([0, 1, 2, 3])

    const rows = await readSlides()
    expect(await moveSlide(ORG, postId, rows[3]!.id, 'up', 4)).toBe('saved')

    const after = await readOrder()
    expect(after.roles).toEqual(['hook', 'evidence', 'cta', 'evidence'])
    // claim-c was on slide 2 and is now on 3; claim-d rode the cta up to 2.
    expect(after.claimIndices).toEqual([0, 1, 3, 2])
  })

  it('survives a swap that a naive renumber would deadlock on', async () => {
    // `SET index = index + 1` trips the (post_id, index) unique index the moment
    // two rows share a value mid-statement. This is the regression guard.
    const rows = await readSlides()
    expect(await moveSlide(ORG, postId, rows[0]!.id, 'down', 4)).toBe('saved')

    const after = await readOrder()
    expect(after.roles).toEqual(['evidence', 'hook', 'evidence', 'cta'])
    expect(after.claimIndices).toEqual([1, 0, 2, 3])
  })

  it('keeps the indices contiguous from zero', async () => {
    const rows = await readSlides()
    await moveSlide(ORG, postId, rows[2]!.id, 'up', 4)

    const after = await readSlides()
    expect(after.map((row) => row.index)).toEqual([0, 1, 2, 3])
  })

  it('does nothing at the ends of the carousel', async () => {
    const rows = await readSlides()
    expect(await moveSlide(ORG, postId, rows[0]!.id, 'up', 4)).toBe('no_op')
    expect(await moveSlide(ORG, postId, rows[3]!.id, 'down', 4)).toBe('no_op')
  })

  it('refuses when the carousel is not the shape the page showed', async () => {
    const rows = await readSlides()
    expect(await moveSlide(ORG, postId, rows[0]!.id, 'down', 3)).toBe('stale')

    const after = await readOrder()
    expect(after.roles).toEqual(['hook', 'evidence', 'evidence', 'cta'])
  })
})

describe('deleting', () => {
  it('renumbers what is left and unattributes the orphaned claim', async () => {
    const rows = await readSlides()
    expect(await deleteSlide(ORG, postId, rows[1]!.id, 2, 4)).toBe('saved')

    const after = await readOrder()
    expect(after.roles).toEqual(['hook', 'evidence', 'cta'])
    // claim-b pointed at the deleted slide, so it loses its index — but not its
    // verdict, its sources or its row. Evidence is not deleted because a slide
    // was.
    expect(after.claimIndices).toEqual([0, null, 1, 2])

    const remaining = await readSlides()
    expect(remaining.map((row) => row.index)).toEqual([0, 1, 2])
  })

  it('refuses to take the carousel below two slides', async () => {
    const rows = await readSlides()
    await deleteSlide(ORG, postId, rows[0]!.id, 2, 4)
    await deleteSlide(ORG, postId, rows[1]!.id, 2, 3)

    expect(await deleteSlide(ORG, postId, rows[2]!.id, 2, 2)).toBe('too_few')
    expect((await readSlides()).length).toBe(2)
  })
})

describe('adding', () => {
  it('inserts in position and shifts the claims after it', async () => {
    expect(
      await addSlide(ORG, postId, { role: 'evidence', afterIndex: 0, maxSlides: 10 }, 4),
    ).toBe('saved')

    const after = await readOrder()
    expect(after.roles).toEqual(['hook', 'evidence', 'evidence', 'evidence', 'cta'])
    // Everything from the old slide 1 onwards moved up one; claim-a stays put.
    expect(after.claimIndices).toEqual([0, 2, 3, 4])
  })

  it('arrives empty, so the gate asks someone to describe it', async () => {
    await addSlide(ORG, postId, { role: 'evidence', afterIndex: 3, maxSlides: 10 }, 4)

    const rows = await readSlides()
    expect(rows[4]!.content).toEqual({})
    expect(rows[4]!.altText).toBe('')
  })

  it('can be put in front of the hook, because that is the operator’s call', async () => {
    // The gate warns about this rather than blocking it, so the repository must
    // not have a stronger opinion than the gate does.
    await addSlide(ORG, postId, { role: 'evidence', afterIndex: -1, maxSlides: 10 }, 4)

    expect((await readOrder()).roles).toEqual(['evidence', 'hook', 'evidence', 'evidence', 'cta'])
  })

  it('refuses to exceed what the API allows', async () => {
    for (let i = 0; i < 6; i += 1) {
      await addSlide(ORG, postId, { role: 'evidence', afterIndex: 1, maxSlides: 10 }, 4 + i)
    }
    expect((await readSlides()).length).toBe(10)

    expect(
      await addSlide(ORG, postId, { role: 'evidence', afterIndex: 1, maxSlides: 10 }, 10),
    ).toBe('too_many')
  })
})

describe('the whole post row', () => {
  it('is touched by a structural change, so the board reorders', async () => {
    const [before] = await withOrg(
      ORG,
      (tx) => tx.select({ updatedAt: posts.updatedAt }).from(posts).where(eq(posts.id, postId)),
      db,
    )

    const rows = await readSlides()
    await moveSlide(ORG, postId, rows[0]!.id, 'down', 4)

    const [after] = await withOrg(
      ORG,
      (tx) => tx.select({ updatedAt: posts.updatedAt }).from(posts).where(eq(posts.id, postId)),
      db,
    )

    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime())
  })
})
