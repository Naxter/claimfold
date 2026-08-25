'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { MAX_ALT_TEXT } from '@claimfold/content'
import {
  addSlide,
  approvePost,
  deleteSlide,
  forgetUpload,
  getAccount,
  getPost,
  moveSlide,
  recordAsset,
  rejectPost,
  reschedulePost,
  resolveClaim,
  updateNicheAppearance,
  updatePost,
  unschedulePost,
  updateSlide,
  type StructureResult,
} from '@claimfold/db'
import { MAX_CAROUSEL_SLIDES } from '@claimfold/niches'
import { MAX_UPLOAD_BYTES, normaliseUpload } from '@claimfold/render/image'
import { deleteSlideImage, saveSlideImage } from '@claimfold/storage'
import { checkAccent, getTheme, isTemplateId, THEMES } from '@claimfold/templates'

import { formText } from '../../../lib/form.ts'
import { assertApprovable, GateBlockedError } from '../../../lib/gate.ts'
import { getMessages } from '../../../lib/i18n/index.ts'
import { packFromRow } from '../../../lib/niche.ts'
import { can } from '../../../lib/permissions.ts'
import { requireSession } from '../../../lib/session.ts'
import {
  fieldsForSlide,
  isEditable,
  parseHashtags,
  readSlideContentForm,
} from '../../../lib/slide-editing.ts'

/**
 * Server actions for the review screen.
 *
 * Two rules, both learned the hard way:
 *
 * 1. Re-resolve the session; never accept an org id from the client. A server
 *    action is a public endpoint — the only thing separating it from a
 *    hand-crafted POST is the authorisation written here.
 * 2. Re-evaluate the gate. The disabled Approve button is a convenience for
 *    the reviewer, not a control. Deleting one HTML attribute must not be
 *    enough to publish a post with a false core claim.
 */

/**
 * Server actions bound directly to `<form action={...}>` must resolve to void —
 * React's typing does not accept a returned result object. Outcomes are
 * therefore reported by redirecting back with a message, which is also what
 * the Instagram connect flow does, so the two behave consistently.
 */
function backToPost(
  postId: string,
  message?: string,
  /** Keep this slide's editor open, so a refusal does not also close it. */
  keepEditing?: string,
): never {
  const query = new URLSearchParams()
  if (message) query.set('error', message)
  if (keepEditing) query.set('edit', keepEditing)

  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  redirect(`/posts/${postId}${suffix}`)
}

/* ─── Editing ─────────────────────────────────────────────────────────────── */

/**
 * Everything an edit needs, having established that it is allowed.
 *
 * The status check is the reason this exists rather than each action reading the
 * post itself. `editable` in the page is what greys the controls out; this is
 * what actually refuses, and the two are separate on purpose — the disabled
 * attribute is a convenience for the reviewer, not a control. Same lesson as
 * the approve button and the gate.
 */
async function editableContext(postId: string, capability: 'edit' | 'publish' = 'edit') {
  const session = await requireSession()
  const t = await getMessages()

  /**
   * The role check, which existed nowhere.
   *
   * Placed here rather than in each action because every edit already comes
   * through this function, so a new action cannot forget it. Approving and
   * rejecting ask for `publish` instead — those put something in front of an
   * audience under somebody's real name, which is a different kind of decision
   * from fixing a typo.
   */
  if (!can(session, capability)) backToPost(postId, t.review.editErrors.notPermitted)

  const detail = await getPost(session.orgId, postId)
  if (!detail) backToPost(postId, t.review.editErrors.missing)
  if (!isEditable(detail.post.status)) backToPost(postId, t.review.editErrors.notEditable)

  return { session, t, detail }
}

/** Nothing to say on success; the page re-reads everything it draws. */
function refresh(postId: string): void {
  revalidatePath(`/posts/${postId}`)
  revalidatePath('/')
}

export async function saveSlideAction(formData: FormData): Promise<void> {
  const postId = formText(formData, 'postId')
  const slideId = formText(formData, 'slideId')
  if (!postId || !slideId) return

  const { session, t, detail } = await editableContext(postId)

  const slide = detail.slides.find((row) => row.id === slideId)
  if (!slide) backToPost(postId, t.review.editErrors.missing)

  const fields = fieldsForSlide(slide.role, slide.templateId, detail.post.templateId)
  const parsed = readSlideContentForm(formData, fields)
  if (!parsed.ok) backToPost(postId, t.review.editErrors.badField, slideId)

  let content = parsed.content

  /**
   * A newly uploaded picture, if one came with the form.
   *
   * Handled here rather than through its own endpoint so that adding a photo is
   * part of saving the slide: an upload that stored an image and then lost the
   * text someone had just typed would be a worse bug than a slower one.
   */
  const upload = formData.get('picture')
  if (upload instanceof File && upload.size > 0) {
    /*
      Checked before `arrayBuffer()`, not after.

      `normaliseUpload` enforces MAX_UPLOAD_BYTES and its docstring says the
      file is "refused before decoding it" — true of decoding, but the buffer
      was already materialised in memory to get there, so a 2GB upload was a
      2GB allocation before anything refused it. `File.size` is known from the
      request without reading the body.
    */
    if (upload.size > MAX_UPLOAD_BYTES) {
      backToPost(postId, t.review.editErrors.uploadTooLarge(12), slideId)
    }

    const result = await normaliseUpload(Buffer.from(await upload.arrayBuffer()))

    if (!result.ok) {
      backToPost(
        postId,
        result.reason === 'too_large'
          ? t.review.editErrors.uploadTooLarge(12)
          : t.review.editErrors.uploadNotAnImage,
        slideId,
      )
    }

    const stored = await saveSlideImage(session.orgId, result.image.jpeg)
    const asset = await recordAsset(session.orgId, {
      path: stored.path,
      sha256: stored.sha256,
      width: result.image.width,
      height: result.image.height,
      bytes: stored.bytes,
      kind: 'upload',
    })

    content = { ...content, imageAssetId: asset.id }
  }

  /**
   * A picture the editor took off, remembered but NOT yet deleted.
   *
   * The delete used to happen right here, before the save. Two bugs came out of
   * that ordering, and both destroyed data:
   *
   *  - A save refused as `stale` had already unlinked the JPEG and dropped the
   *    `assets` row, leaving the slide pointing at nothing. The user was told
   *    their edit did not apply; the picture was gone anyway.
   *  - The reuse check read `detail.slides` — the slides of THIS post. Storage
   *    is content-addressed, so the same photograph on two posts is literally
   *    one row, and removing it here silently blanked a slide on the other
   *    post. Which is the exact outcome the comment below said it prevented.
   *
   * So: decide what to drop now, commit the slide first, and only then delete —
   * with the reuse check done org-wide, inside the deleting transaction, by
   * `forgetUpload` itself.
   */
  let droppedAssetId: string | undefined

  if (formText(formData, 'removePicture')) {
    const { imageAssetId: dropped, ...rest } = content
    content = rest
    if (typeof dropped === 'string') droppedAssetId = dropped
  }

  const expectedRaw = formText(formData, 'expectedUpdatedAt')
  const expected = expectedRaw ? new Date(expectedRaw) : undefined

  const outcome = await updateSlide(session.orgId, postId, slideId, {
    content,
    altText: formText(formData, 'altText').trim().slice(0, MAX_ALT_TEXT),
    editedBy: session.userId,
    ...(expected && !Number.isNaN(expected.getTime()) ? { expectedUpdatedAt: expected } : {}),
  })

  if (outcome === 'stale') backToPost(postId, t.review.editErrors.stale, slideId)
  if (outcome === 'missing') backToPost(postId, t.review.editErrors.missing)

  /*
    Now that the slide no longer references it, reclaim the picture.

    `forgetUpload` re-checks org-wide inside its own transaction and returns
    null when anything else still points at the row, so a shared photograph
    survives. `excludeSlideId` is this slide, whose reference we just removed.
  */
  if (droppedAssetId) {
    const path = await forgetUpload(session.orgId, droppedAssetId, slideId)
    if (path) await deleteSlideImage(path)
  }

  refresh(postId)
  // Closes the editor and lands back on the slide that was being edited.
  redirect(`/posts/${postId}#slide-${slide.index + 1}`)
}

/**
 * Give one slide a different layout.
 *
 * Separate from saving the copy, and that separation is the whole reason the
 * editor has two tabs. A layout change touches no claim, so it must not stamp
 * the slide as edited — if it did, picking a different look would raise the
 * warning that says the words no longer match what the sources were read
 * against, and a warning that cries wolf gets clicked past when it matters.
 */
export async function saveSlideLayoutAction(formData: FormData): Promise<void> {
  const postId = formText(formData, 'postId')
  const slideId = formText(formData, 'slideId')
  if (!postId || !slideId) return

  const { session, t, detail } = await editableContext(postId)
  if (!detail.slides.some((row) => row.id === slideId)) {
    backToPost(postId, t.review.editErrors.missing)
  }

  const chosen = formText(formData, 'templateId')
  const templateId = chosen && isTemplateId(chosen) ? chosen : null

  const outcome = await updateSlide(session.orgId, postId, slideId, { templateId })
  if (outcome === 'missing') backToPost(postId, t.review.editErrors.missing)

  refresh(postId)
  redirect(`/posts/${postId}?edit=${slideId}`)
}

export async function savePostTextAction(formData: FormData): Promise<void> {
  const postId = formText(formData, 'postId')
  if (!postId) return

  const { session, detail } = await editableContext(postId)

  await updatePost(session.orgId, postId, {
    caption: formText(formData, 'caption').slice(0, 2_200),
    hashtags: parseHashtags(formText(formData, 'hashtags')),
    firstComment: formText(formData, 'firstComment').trim().slice(0, 2_200) || null,
    // The hook is also slide one's headline in practice, but it is stored
    // separately because it is the grouping key for "which openings earn
    // saves" — so editing it here does not touch the slide, and should not.
    hook: formText(formData, 'hook').trim().slice(0, 300) || detail.post.hook,
  })

  refresh(postId)
  redirect(`/posts/${postId}`)
}

/**
 * Send this one post to a different account than its channel would.
 *
 * The escape hatch the design deliberately keeps: a channel owns the account, so
 * this is not the normal route — but "publish this one on the other handle" is a
 * real editorial decision, and the right moment to make it is while looking at
 * the post, not as a setting somewhere that silently applies to everything after.
 *
 * Validated against the workspace's own accounts rather than trusted, because an
 * id from a form is an id from the internet. Row-level security would already
 * refuse another tenant's account; this refuses one that does not exist at all,
 * so the post cannot end up pointing at nothing.
 */
export async function savePostAccountAction(formData: FormData): Promise<void> {
  const postId = formText(formData, 'postId')
  if (!postId) return

  const { session, t } = await editableContext(postId, 'publish')

  const chosen = formText(formData, 'igAccountId').trim()
  if (chosen) {
    const account = await getAccount(session.orgId, chosen)
    if (!account) backToPost(postId, t.review.editErrors.missing)
  }

  await updatePost(session.orgId, postId, { igAccountId: chosen || null })

  refresh(postId)
  redirect(`/posts/${postId}`)
}

/**
 * Theme, accent and watermark.
 *
 * The theme belongs to the post and the other two to the channel, which is why
 * one form writes to two tables. That split is not an accident of the schema:
 * a theme is an editorial choice for this carousel, while a handle and a brand
 * colour are what make a whole feed recognisable as one account.
 */
export async function saveAppearanceAction(formData: FormData): Promise<void> {
  const postId = formText(formData, 'postId')
  if (!postId) return

  const { session, t, detail } = await editableContext(postId)

  const themeId = formText(formData, 'themeId')
  if (themeId && THEMES.some((theme) => theme.id === themeId) && themeId !== detail.post.themeId) {
    await updatePost(session.orgId, postId, { themeId })
  }

  const accentRaw = formText(formData, 'accentColor').trim()
  let accentColor: string | null = null

  if (accentRaw) {
    /**
     * Checked against the theme this post will actually be rendered in, which
     * is the one just chosen above rather than the one stored a moment ago.
     * Validating against the old theme would let a colour through that is
     * unreadable on the new one.
     */
    const verdict = checkAccent(getTheme(themeId || detail.post.themeId), accentRaw)

    if (!verdict.ok) {
      backToPost(
        postId,
        verdict.reason === 'unparseable'
          ? t.review.editErrors.accentNotAColour
          : t.review.editErrors.accentUnreadable(
              verdict.ratio.toFixed(1),
              verdict.floor.toFixed(1),
            ),
      )
    }
    accentColor = accentRaw
  }

  await updateNicheAppearance(session.orgId, detail.post.nicheId, {
    accentColor,
    watermark: formText(formData, 'watermark').trim().slice(0, 40),
  })

  refresh(postId)
  redirect(`/posts/${postId}`)
}

/* ─── Structure ───────────────────────────────────────────────────────────── */

/**
 * Instagram's floor, not the format's.
 *
 * A format may declare that it takes six slides, and once a person is
 * rearranging a carousel by hand their structure is the authoritative one — the
 * format described how the post was generated, not what it is allowed to
 * become. What does not bend is the API: fewer than two images is not a
 * carousel, and more than ten is rejected.
 */
const MIN_CAROUSEL_SLIDES = 2

/** Turn a repository refusal into something worth reading. */
function structureError(
  outcome: StructureResult,
  t: Awaited<ReturnType<typeof getMessages>>,
): string | null {
  switch (outcome) {
    case 'saved':
      return null
    // Already at one end of the carousel. Not worth an error message.
    case 'no_op':
      return null
    case 'stale':
      return t.review.editErrors.shapeChanged
    case 'missing':
      return t.review.editErrors.missing
    case 'too_few':
      return t.review.editErrors.tooFew
    case 'too_many':
      return t.review.editErrors.tooMany(MAX_CAROUSEL_SLIDES)
  }
}

/** How many slides the page was showing, so a changed shape is refused. */
function expectedCount(formData: FormData): number | undefined {
  const raw = Number(formText(formData, 'slideCount'))
  return Number.isInteger(raw) && raw > 0 ? raw : undefined
}

export async function moveSlideAction(formData: FormData): Promise<void> {
  const postId = formText(formData, 'postId')
  const slideId = formText(formData, 'slideId')
  const direction = formText(formData, 'direction')
  if (!postId || !slideId || (direction !== 'up' && direction !== 'down')) return

  const { session, t } = await editableContext(postId)

  const outcome = await moveSlide(
    session.orgId,
    postId,
    slideId,
    direction,
    expectedCount(formData),
  )

  const error = structureError(outcome, t)
  if (error) backToPost(postId, error)

  refresh(postId)
  redirect(`/posts/${postId}`)
}

export async function deleteSlideAction(formData: FormData): Promise<void> {
  const postId = formText(formData, 'postId')
  const slideId = formText(formData, 'slideId')
  if (!postId || !slideId) return

  const { session, t } = await editableContext(postId)

  const outcome = await deleteSlide(
    session.orgId,
    postId,
    slideId,
    MIN_CAROUSEL_SLIDES,
    expectedCount(formData),
  )

  const error = structureError(outcome, t)
  if (error) backToPost(postId, error)

  refresh(postId)
  redirect(`/posts/${postId}`)
}

export async function addSlideAction(formData: FormData): Promise<void> {
  const postId = formText(formData, 'postId')
  if (!postId) return

  const { session, t, detail } = await editableContext(postId)

  /**
   * Roles come from the format, not from the form.
   *
   * A role decides which layout renders the slide — `hook`, `sources` and `cta`
   * bypass the template entirely — and it is what tells the model what the
   * slide is for if the post is ever regenerated. A typo'd role would silently
   * fall through to the editorial layout and look like a rendering bug.
   *
   * When the niche will not validate, the roles already on the post are the
   * fallback: those are known-good, and refusing to add a slide because the
   * channel config drifted would strand the post.
   */
  const parsedNiche = packFromRow(detail.niche)
  const allowed = new Set(
    parsedNiche.ok
      ? (parsedNiche.pack.formats
          .find((format) => format.id === detail.post.format)
          ?.roles.map((role) => role.id) ?? detail.slides.map((slide) => slide.role))
      : detail.slides.map((slide) => slide.role),
  )

  const role = formText(formData, 'role')
  if (!role || !allowed.has(role)) backToPost(postId, t.review.editErrors.noRole)

  const afterRaw = Number(formText(formData, 'afterIndex'))
  const afterIndex = Number.isInteger(afterRaw) ? afterRaw : detail.slides.length - 1

  const outcome = await addSlide(
    session.orgId,
    postId,
    { role, afterIndex, maxSlides: MAX_CAROUSEL_SLIDES },
    expectedCount(formData),
  )

  const error = structureError(outcome, t)
  if (error) backToPost(postId, error)

  refresh(postId)
  redirect(`/posts/${postId}`)
}

export async function approveAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  if (!can(session, 'publish')) {
    backToPost(formText(formData, 'postId'), (await getMessages()).review.editErrors.notPermitted)
  }
  const postId = formText(formData, 'postId')
  if (!postId) return

  const scheduledAtRaw = formData.get('scheduledAt')
  const scheduledAt =
    typeof scheduledAtRaw === 'string' && scheduledAtRaw ? new Date(scheduledAtRaw) : null

  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    backToPost(postId, (await getMessages()).review.editErrors.badSchedule)
  }

  try {
    // The authoritative check. Runs against the database, not against whatever
    // the browser last rendered.
    await assertApprovable(session.orgId, postId)
  } catch (error) {
    if (error instanceof GateBlockedError) backToPost(postId, error.message)
    throw error
  }

  // False means the post moved out of a reviewable state between the page
  // rendering and this request — usually a second tab, or the worker picking it
  // up. Saying so beats a silent no-op that looks like success.
  if (!(await approvePost(session.orgId, postId, session.userId, scheduledAt))) {
    backToPost(postId, (await getMessages()).review.editErrors.notEditable)
  }

  revalidatePath(`/posts/${postId}`)
  revalidatePath('/')
}

/**
 * Take a scheduled post back off the queue.
 *
 * `publish`, like approving and rejecting: this is a decision about whether
 * something goes in front of an audience, not an edit to its contents.
 *
 * Not routed through `editableContext`, deliberately — that helper refuses any
 * post whose status is locked, and `scheduled` IS locked. That lock is what
 * made this impossible in the first place, so the guard lives in
 * `unschedulePost`, which only ever acts on a still-scheduled row.
 */
export async function unscheduleAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  const t = await getMessages()
  const postId = formText(formData, 'postId')
  if (!postId) return

  if (!can(session, 'publish')) backToPost(postId, t.review.editErrors.notPermitted)

  // False means the worker claimed it between the page rendering and this
  // request. Saying so beats a silent no-op that reads as success.
  if (!(await unschedulePost(session.orgId, postId))) {
    backToPost(postId, t.review.editErrors.alreadyPublishing)
  }

  refresh(postId)
  redirect(`/posts/${postId}`)
}

/** Same decision, smaller: keep the approval, change the time. */
export async function rescheduleAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  const t = await getMessages()
  const postId = formText(formData, 'postId')
  if (!postId) return

  if (!can(session, 'publish')) backToPost(postId, t.review.editErrors.notPermitted)

  const raw = formData.get('scheduledAt')
  const scheduledAt = typeof raw === 'string' && raw ? new Date(raw) : null
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    backToPost(postId, t.review.editErrors.badSchedule)
  }

  if (!(await reschedulePost(session.orgId, postId, scheduledAt))) {
    backToPost(postId, t.review.editErrors.alreadyPublishing)
  }

  refresh(postId)
  redirect(`/posts/${postId}`)
}

export async function rejectAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  if (!can(session, 'publish')) {
    backToPost(formText(formData, 'postId'), (await getMessages()).review.editErrors.notPermitted)
  }
  const postId = formText(formData, 'postId')
  if (!postId) return

  const reason = formText(formData, 'reason', 'Rejected in review').slice(0, 2000)

  if (!(await rejectPost(session.orgId, postId, reason))) {
    backToPost(postId, (await getMessages()).review.editErrors.notEditable)
  }

  revalidatePath(`/posts/${postId}`)
  revalidatePath('/')
}

/**
 * Human override of a claim verdict.
 *
 * The legitimate escape hatch the gate needs: a claim can be true and
 * unverifiable (paywalled source, a book on the reviewer's desk), and without
 * this the only way past the gate would be to bypass it entirely.
 *
 * A reason is mandatory. An override with no justification is indistinguishable
 * from clicking through a warning, and this ends up in the audit trail that
 * answers a challenge months later.
 */
export async function resolveClaimAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  /*
    Overriding a verdict is signing off on a claim the research would not stand
    behind, and it is recorded against the person who did it. That is a publish
    decision, not an edit.
  */
  if (!can(session, 'publish')) {
    backToPost(formText(formData, 'postId'), (await getMessages()).review.editErrors.notPermitted)
  }
  const claimId = formText(formData, 'claimId')
  const postId = formText(formData, 'postId')
  const note = formText(formData, 'note').trim()

  if (!claimId || !postId) return
  if (note.length < 10) {
    backToPost(postId, (await getMessages()).review.editErrors.overrideTooShort)
  }

  await resolveClaim(session.orgId, claimId, session.userId, note.slice(0, 2000))
  revalidatePath(`/posts/${postId}`)
  revalidatePath('/')
}
