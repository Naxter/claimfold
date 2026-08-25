import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { eq } from 'drizzle-orm'

import { db, saveDraft, schema, withoutTenantScope } from '@claimfold/db'
import { PRESET_NICHES, validateNichePack } from '@claimfold/niches'
import { auth } from '../apps/web/lib/auth.ts'

/**
 * `npm run db:seed`
 *
 * Creates a signed-in-able account, an organization, a niche and one post that
 * is already through verification — enough to exercise the review UI without
 * spending API credits on every reload.
 *
 * The claims are synthetic but realistic, including a deliberately weak one so
 * the gate has something to complain about. A seed where everything passes
 * would hide the feature the screen exists for.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(resolve(repoRoot, '.env'))) process.loadEnvFile(resolve(repoRoot, '.env'))

const EMAIL = process.env.SEED_EMAIL ?? 'dev@claimfold.local'
const PASSWORD = process.env.SEED_PASSWORD ?? 'claimfold-dev-2026'

interface Fixture {
  themeId: string
  templateId: string
  slides: Array<{ role: string; content: Record<string, unknown> }>
}

async function main() {
  console.log('Seeding development data…\n')

  /* ── User ──────────────────────────────────────────────────────────── */
  let [user] = await db.select().from(schema.user).where(eq(schema.user.email, EMAIL)).limit(1)

  if (!user) {
    // Through Better Auth rather than a direct insert, so the password is
    // hashed exactly the way sign-in will verify it.
    await auth.api.signUpEmail({ body: { email: EMAIL, password: PASSWORD, name: 'Dev' } })
    ;[user] = await db.select().from(schema.user).where(eq(schema.user.email, EMAIL)).limit(1)
    console.log(`  user         ${EMAIL}  (password: ${PASSWORD})`)
  } else {
    console.log(`  user         ${EMAIL}  (existing)`)
  }

  if (!user) throw new Error('Failed to create the seed user')

  /* ── Organization ──────────────────────────────────────────────────── */
  const orgId = await withoutTenantScope(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.slug, 'dev'))
      .limit(1)

    if (existing) return existing.id

    const id = randomUUID()
    await tx.insert(schema.organization).values({ id, name: 'Dev workspace', slug: 'dev' })
    await tx.insert(schema.member).values({
      id: randomUUID(),
      organizationId: id,
      userId: user.id,
      role: 'owner',
    })
    return id
  })
  console.log(`  organization Dev workspace`)

  // Point the user's sessions at this org so the first page load has a tenant.
  await db
    .update(schema.session)
    .set({ activeOrganizationId: orgId })
    .where(eq(schema.session.userId, user.id))

  /* ── Niche ─────────────────────────────────────────────────────────── */
  const preset = PRESET_NICHES[0]!
  const parsed = validateNichePack(preset)
  if (!parsed.ok) throw new Error(`Preset niche invalid: ${JSON.stringify(parsed.errors)}`)
  const pack = parsed.pack

  const nicheId = await withoutTenantScope(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.niches)
      .where(eq(schema.niches.slug, pack.slug))
      .limit(1)
    if (existing) return existing.id

    const [row] = await tx
      .insert(schema.niches)
      .values({
        orgId,
        slug: pack.slug,
        name: pack.name,
        description: pack.description,
        language: pack.language,
        audience: pack.audience,
        voice: pack.voice,
        topicSeeds: pack.topicSeeds,
        formats: pack.formats,
        promptOverrides: pack.promptOverrides,
        hashtagSets: pack.hashtagSets,
        themeId: pack.themeId,
        rules: pack.rules,
        cadence: pack.cadence,
        isDefault: true,
      })
      .returning({ id: schema.niches.id })
    return row!.id
  })
  console.log(`  niche        ${pack.name}`)

  /* ── A post already through verification ───────────────────────────── */
  const fixture = JSON.parse(
    readFileSync(resolve(repoRoot, 'packages/render/fixtures/demo-post.json'), 'utf8'),
  ) as Fixture

  const postId = await saveDraft({
    orgId,
    nicheId,
    format: 'misconception',
    templateId: fixture.templateId,
    themeId: fixture.themeId,
    title: 'Vier Mittelalter-Irrtümer',
    hook: 'Vier Dinge über das Mittelalter, die fast alle falsch erzählen',
    caption:
      'Drei der vier verbreitetsten Mittelalter-Irrtümer stammen nicht aus dem Mittelalter, ' +
      'sondern aus dem 19. Jahrhundert.\n\nWelchen hast du selbst geglaubt?',
    hashtags: ['wissen', 'geschichte', 'mittelalter', 'faktencheck'],
    aiDisclosure: false,
    ideaFingerprint: 'seed-mittelalter-irrtuemer',
    slides: fixture.slides.map((slide) => ({
      role: slide.role,
      content: slide.content,
      altText: `Slide über ${typeof slide.content["headline"] === "string" ? slide.content["headline"] : slide.role}`,
    })),
    claims: [
      {
        claim: 'Die Kugelgestalt der Erde war im Mittelalter an Universitäten Lehrmeinung.',
        verdict: 'supported',
        confidence: 0.96,
        reasoning:
          'Vielfach belegt; der Scheiben-Mythos wurde erst im 19. Jahrhundert popularisiert.',
        isCore: true,
        sources: [
          {
            url: 'https://example.org/inventing-the-flat-earth',
            title: 'Jeffrey Burton Russell — Inventing the Flat Earth (1991)',
            publisher: 'Praeger',
          },
        ],
      },
      {
        claim: 'Öffentliche Badehäuser waren fester Bestandteil mittelalterlicher Städte.',
        verdict: 'supported',
        confidence: 0.91,
        reasoning: 'Stadtrechnungen und Zunftordnungen belegen den Betrieb von Badestuben.',
        isCore: true,
        sources: [
          {
            url: 'https://example.org/medieval-bathing',
            title: 'Medieval Urban Bathing Culture',
            publisher: 'University Press',
          },
        ],
      },
      {
        claim: 'Eine Feldrüstung wog etwa 20–30 kg, verteilt über den Körper.',
        verdict: 'supported',
        confidence: 0.89,
        reasoning: 'Rekonstruktionsstudien der Royal Armouries bestätigen Gewicht und Beweglichkeit.',
        isCore: true,
        sources: [
          {
            url: 'https://example.org/armour-mobility',
            title: 'Royal Armouries — Studien zur Beweglichkeit in Plattenrüstung',
          },
        ],
      },
      {
        // Deliberately weak, so the gate has something to catch and the review
        // screen demonstrates what it is for.
        claim: 'Die durchschnittliche Lebenserwartung lag bei exakt 30 Jahren.',
        verdict: 'disputed',
        confidence: 0.55,
        reasoning:
          'Die Zahl ist ein Artefakt hoher Kindersterblichkeit und variiert stark nach Region ' +
          'und Quelle. "Exakt 30" ist nicht belegbar.',
        isCore: true,
        sources: [],
      },
    ],
  })

  console.log(`  post         ${postId}\n`)
  console.log('Done. Start the dashboard with:  npm run dev')
  console.log(`Then sign in as ${EMAIL} / ${PASSWORD}`)
  process.exit(0)
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error)
  process.exit(1)
})
