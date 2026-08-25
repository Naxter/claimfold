'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { generateNiche, nichePackFromGenerated } from '@claimfold/content'
import {
  archiveNiche,
  createNiche,
  getNiche,
  restoreNiche,
  updateNiche,
  type NicheWrite,
} from '@claimfold/db'
import { BUILT_IN_FORMATS, validateNichePack } from '@claimfold/niches'
import { THEMES, checkAccent, getTheme } from '@claimfold/templates'

import { readChannelForm, type ChannelFormState } from '../../lib/channel-form.ts'
import { formText } from '../../lib/form.ts'
import { getMessages } from '../../lib/i18n/index.ts'
import { can } from '../../lib/permissions.ts'
import { requireSession } from '../../lib/session.ts'

/**
 * Creating and editing a channel.
 *
 * A channel is the whole editorial configuration — the prompts, the slide
 * structures, the confidence floor the publication gate enforces. So these
 * actions are held to the same rule as the review screen's: the session is
 * re-resolved here, the org id never comes from the client, and every field goes
 * through `validateNichePack` on the way in.
 *
 * Errors come back as a value rather than a redirect, which is a departure from
 * the rest of this dashboard and deliberate. The other forms have three fields;
 * this one has twenty, and bouncing someone back to an empty form with a message
 * in the query string would throw away everything they typed. `useActionState`
 * keeps the form mounted, so the values stay in the browser and the errors land
 * next to the fields they belong to.
 */

export async function saveChannelAction(
  _previous: ChannelFormState,
  formData: FormData,
): Promise<ChannelFormState> {
  const session = await requireSession()
  const t = await getMessages()

  // A channel decides the confidence floor the gate enforces, so changing one is
  // not a read-only act. Returned as a form error rather than a redirect,
  // matching how every other refusal on this form is reported.
  if (!can(session, 'edit')) {
    return { errors: [], message: t.review.editErrors.notPermitted }
  }

  const nicheId = formText(formData, 'nicheId')
  const parsed = readChannelForm(formData)

  if (!parsed.ok) return { errors: parsed.errors }

  /**
   * The accent is checked against the theme this channel will actually render
   * in, and refused rather than corrected. Auto-picking a legible colour would
   * always succeed and would quietly stop the result being the colour somebody
   * chose.
   */
  if (parsed.niche.accentColor) {
    const verdict = checkAccent(getTheme(parsed.niche.themeId), parsed.niche.accentColor)
    if (!verdict.ok) {
      return {
        errors: [
          {
            path: 'accentColor',
            message:
              verdict.reason === 'unparseable'
                ? t.review.editErrors.accentNotAColour
                : t.review.editErrors.accentUnreadable(
                    verdict.ratio.toFixed(1),
                    verdict.floor.toFixed(1),
                  ),
          },
        ],
      }
    }
  }

  const result = nicheId
    ? await updateNiche(session.orgId, nicheId, parsed.niche)
    : await createNiche(session.orgId, parsed.niche)

  if (!result.ok) {
    return result.reason === 'slug_taken'
      ? { errors: [{ path: 'slug', message: t.channels.errors.slugTaken }] }
      : { errors: [], message: t.channels.errors.missing }
  }

  revalidatePath('/niches')
  revalidatePath('/generate')
  redirect(`/niches?saved=${result.id}`)
}

/**
 * One sentence in, a whole channel out.
 *
 * Lands on the editor rather than saving quietly, because a generated
 * configuration is a starting point: it decides the confidence floor and what
 * the channel will never write about, and nobody should discover those by
 * finding out what got published.
 */
export async function generateChannelAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  const t = await getMessages()

  if (!can(session, 'edit')) {
    redirect(`/niches?error=${encodeURIComponent(t.review.editErrors.notPermitted)}`)
  }

  const description = formText(formData, 'description').trim().slice(0, 600)
  const language = formText(formData, 'language').trim() || 'en'

  if (description.length < 12) {
    redirect(`/niches?error=${encodeURIComponent(t.channels.errors.describeMore)}`)
  }

  let pack
  try {
    const { niche } = await generateNiche({
      description,
      language,
      formatIds: BUILT_IN_FORMATS.map((format) => format.id),
      themeIds: THEMES.map((theme) => theme.id),
    })
    pack = nichePackFromGenerated(niche, BUILT_IN_FORMATS)
  } catch (error) {
    // The provider is configured per install and may simply not be set up. That
    // is a sentence someone can act on, not a stack trace.
    redirect(
      `/niches?error=${encodeURIComponent(
        t.channels.errors.generateFailed(error instanceof Error ? error.message : 'unknown'),
      )}`,
    )
  }

  /**
   * Validated before writing, even though the model was given a schema.
   *
   * The schema constrains shape, not coherence: a returned `minSlides` above
   * `maxSlides`, or a format list with no sources slide while `requireSources`
   * is on, are both schema-valid and refused by `validateNichePack`. Catching it
   * here means the operator sees "the generator produced something unusable"
   * rather than a channel that fails silently on its first post.
   */
  const validated = validateNichePack(pack)
  if (!validated.ok) {
    redirect(`/niches?error=${encodeURIComponent(t.channels.errors.generateUnusable)}`)
  }

  const write: NicheWrite = { ...validated.pack, isDefault: false }
  let created = await createNiche(session.orgId, write)

  // A slug collision is likely rather than exceptional: ask for "medieval
  // history" twice and the model will reasonably suggest the same slug. Suffixed
  // rather than refused, because the operator asked for a second channel and the
  // slug is not something they chose.
  for (let attempt = 2; !created.ok && created.reason === 'slug_taken' && attempt <= 20; attempt += 1) {
    created = await createNiche(session.orgId, { ...write, slug: `${write.slug}-${attempt}` })
  }

  if (!created.ok) {
    redirect(`/niches?error=${encodeURIComponent(t.channels.errors.slugTaken)}`)
  }

  revalidatePath('/niches')
  redirect(`/niches/${created.id}?generated=1`)
}

export async function archiveChannelAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  if (!can(session, 'edit')) {
    redirect(`/niches?error=${encodeURIComponent((await getMessages()).review.editErrors.notPermitted)}`)
  }

  const nicheId = formText(formData, 'nicheId')
  if (!nicheId) return

  await archiveNiche(session.orgId, nicheId)

  revalidatePath('/niches')
  revalidatePath('/generate')
  redirect('/niches')
}

export async function restoreChannelAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  if (!can(session, 'edit')) {
    redirect(`/niches?error=${encodeURIComponent((await getMessages()).review.editErrors.notPermitted)}`)
  }

  const nicheId = formText(formData, 'nicheId')
  if (!nicheId) return

  await restoreNiche(session.orgId, nicheId)

  revalidatePath('/niches')
  revalidatePath('/generate')
  redirect('/niches')
}

/**
 * Duplicate a channel.
 *
 * The practical way to make a second channel that is mostly like the first —
 * a English-language twin of a German one, say — without retyping a voice
 * description somebody spent time on.
 */
export async function duplicateChannelAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  const t = await getMessages()

  if (!can(session, 'edit')) {
    redirect(`/niches?error=${encodeURIComponent(t.review.editErrors.notPermitted)}`)
  }

  const nicheId = formText(formData, 'nicheId')
  if (!nicheId) return

  const row = await getNiche(session.orgId, nicheId)
  if (!row) redirect(`/niches?error=${encodeURIComponent(t.channels.errors.missing)}`)

  const copy: NicheWrite = {
    slug: row.slug,
    name: t.channels.copyOf(row.name),
    description: row.description,
    language: row.language,
    audience: row.audience,
    voice: row.voice,
    topicSeeds: row.topicSeeds,
    formats: row.formats,
    promptOverrides: row.promptOverrides,
    hashtagSets: row.hashtagSets,
    themeId: row.themeId,
    rules: row.rules,
    cadence: row.cadence,
    watermark: row.watermark,
    accentColor: row.accentColor,
    // Never inherited: two defaults is a state the workspace should not reach
    // by copying something.
    isDefault: false,
  }

  let created = await createNiche(session.orgId, { ...copy, slug: `${row.slug}-copy` })
  for (let attempt = 2; !created.ok && created.reason === 'slug_taken' && attempt <= 20; attempt += 1) {
    created = await createNiche(session.orgId, { ...copy, slug: `${row.slug}-copy-${attempt}` })
  }

  if (!created.ok) redirect(`/niches?error=${encodeURIComponent(t.channels.errors.slugTaken)}`)

  revalidatePath('/niches')
  redirect(`/niches/${created.id}`)
}
