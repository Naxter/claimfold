import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { latestMetrics, listAccounts, listUploadsForPost } from '@claimfold/db'
import { TEMPLATE_IDS, roleFixesLayout } from '@claimfold/templates'

import { ActionButton } from '../../../components/action-button.tsx'
import { AppearancePanel } from '../../../components/appearance-panel.tsx'
import { PostTextEditor } from '../../../components/post-text-editor.tsx'
import { ApproveControls } from '../../../components/approve-controls.tsx'
import { ScheduledControls } from '../../../components/scheduled-controls.tsx'
import { Shell, StatusBadge } from '../../../components/shell.tsx'
import { AddSlideForm, SlideStructureControls } from '../../../components/slide-controls.tsx'
import { SlideEditor } from '../../../components/slide-editor.tsx'
import { getLocale, getMessages, type Messages } from '../../../lib/i18n/index.ts'
import { DeferredPreview } from '../../../components/deferred-preview.tsx'
import { SlidePreview } from '../../../components/slide-preview.tsx'
import { evaluatePostGate, needsOverride } from '../../../lib/gate.ts'
import { packFromRow } from '../../../lib/niche.ts'
import { requireSession } from '../../../lib/session.ts'
import { can } from '../../../lib/permissions.ts'
import { fieldsForSlide, isEditable } from '../../../lib/slide-editing.ts'
import {
  approveAction,
  rescheduleAction,
  unscheduleAction,
  rejectAction,
  resolveClaimAction,
  savePostAccountAction,
} from './actions.ts'

/** Instagram's caption ceiling, shown as a live count in the editor. */
const MAX_CAPTION = 2_200

/**
 * How many slide previews are rendered on the server.
 *
 * Three covers what a reviewer sees before scrolling on a normal window. The
 * rest are built in the browser on approach — see `DeferredPreview`.
 */
const EAGER_PREVIEWS = 3

/** A carousel cannot go below this, so the last two slides cannot be deleted. */
const MIN_SLIDES = 2

export const dynamic = 'force-dynamic'

/**
 * The post's own title would be more useful in the tab than "Review", and it is
 * deliberately not used: fetching it here means a second gate evaluation, which
 * is the slowest thing on the slowest page in the product. A label that at
 * least distinguishes this from the board is worth more than a title that costs
 * a second of load.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).review.title }
}


/**
 * A source link supplied by the model, which read attacker-controllable pages.
 *
 * Two precautions. The scheme is allowlisted, so a `javascript:` or `data:`
 * URL cannot become a clickable link on an authenticated operator's screen.
 * And the visible text is the real hostname rather than the model's `title`,
 * so a page cannot claim to be a source it is not — the classic phishing shape
 * where the label says one domain and the href goes somewhere else.
 */
function SourceLink({ url, title, t }: { url: string; title?: string; t: Messages }) {
  let host: string | null = null
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') host = parsed.hostname
  } catch {
    host = null
  }

  if (!host) {
    return (
      <span className="text-subtle">
        {(title || url).slice(0, 90)} ({t.review.unusableLink})
      </span>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      /* The row this sits in truncates, and a truncation with no tooltip just
         loses the end of the sentence. The hostname leads so the real domain
         survives the ellipsis; the tooltip carries the rest. */
      title={host + (title ? ` — ${title}` : '')}
      className="text-accent hover:underline"
    >
      <span className="text-muted">{host}</span>
      {title ? ` — ${title.slice(0, 70)}` : ''}
    </a>
  )
}


/**
 * A gate issue in the reader's language.
 *
 * The pipeline states the finding as a code plus parameters and also carries
 * English prose. The prose is the durable record — it is what gets written
 * into `reviewNotes` and read back months later — so it is never discarded,
 * only overridden for display when this language has a phrasing for the code.
 *
 * Falling back rather than failing matters: a gate that renders nothing
 * because a translation is missing would hide the single most important
 * sentence on this screen.
 */
function gateText(issue: { code: string; message: string; params?: Record<string, string | number> }, t: Messages): string {
  const phrase = t.gate[issue.code]
  if (!phrase) return issue.message
  try {
    return phrase(issue.params ?? {})
  } catch {
    return issue.message
  }
}

/**
 * A finding, linked to the slide it is about when there is one.
 *
 * Underlined rather than coloured: the list item already carries the red or
 * amber, and a second colour on top of it reads as a different severity.
 */
function IssueText({
  issue,
  t,
  href,
}: {
  issue: { code: string; message: string; params?: Record<string, string | number>; slideIndex?: number }
  t: Messages
  href?: string
}) {
  const text = gateText(issue, t)
  if (!href) return <>{text}</>

  return (
    <Link href={href} className="underline decoration-dotted hover:decoration-solid">
      {text}
    </Link>
  )
}

/** One number. `lead` marks the two that should drive a decision. */
function Metric({ label, value, lead = false }: { label: string; value: number; lead?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className={lead ? 'text-fg text-lg font-semibold' : 'text-muted text-lg'}>{value}</dd>
    </div>
  )
}

const VERDICT_STYLE: Record<string, { badge: string; mark: string }> = {
  supported: { badge: 'bg-ok-weak text-ok', mark: '✓' },
  disputed: { badge: 'bg-warn-weak text-warn', mark: '~' },
  false: { badge: 'bg-err-weak text-err', mark: '✕' },
  unverifiable: { badge: 'bg-sunken text-muted', mark: '?' },
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; edit?: string }>
}) {
  const session = await requireSession()
  const { id } = await params
  const { error, edit } = await searchParams
  const t = await getMessages()
  const locale = await getLocale()

  // The same evaluation the approve action runs. Computing it separately here
  // is what let the page and the server disagree in the first place.
  const result = await evaluatePostGate(session.orgId, id)
  if (!result) notFound()

  const { detail, gate, account } = result
  const { post, niche, slides, claims } = detail

  /**
   * Shared with the server actions, so the greyed-out control and the actual
   * refusal cannot drift apart.
   *
   * Two conditions, not one: the post has to be in a state that can change, and
   * this member has to be allowed to change it. A viewer sees the post and all
   * its evidence and no controls — which is what the word means, and what the
   * role column has claimed ever since it existed while nothing enforced it.
   */
  const editable = isEditable(post.status) && can(session, 'edit')
  const mayPublish = can(session, 'publish')

  /**
   * The picture library, plus anything this post already uses.
   *
   * Loaded for the whole org rather than per slide: it is one query, the images
   * are content-hashed thumbnails on this origin, and the point of the library
   * is that a second post can reuse a first post's photograph.
   *
   * `listUploadsForPost` rather than `listUploads` because the gallery is
   * capped at the 60 newest, and a picture that fell out of that window used to
   * take the slide's own reference down with it — see the note on the query.
   *
   * The three reads below are independent, so they run together. They were five
   * sequential awaits on the heaviest page in the app.
   */
  const [uploads, accounts, performance] = await Promise.all([
    editable ? listUploadsForPost(session.orgId, id) : Promise.resolve([]),
    /*
      Accounts offered as a per-post override. Only when there is a real
      choice: with one account the channel's binding is the only possible
      answer, and a picker with a single entry is a control that cannot do
      anything.
    */
    editable ? listAccounts(session.orgId) : Promise.resolve([]),
    /*
      What the post actually did, once it is out. Collecting these and never
      showing them would repeat the mistake this whole pass has been fixing.
      Saves lead, because saves and shares are the ranking signals that matter —
      likes are here because they are cheap to collect, not because they should
      drive a decision.
    */
    post.status === 'published' ? latestMetrics(session.orgId, id) : Promise.resolve(null),
  ])
  const uploadOptions = uploads.map((asset) => ({ id: asset.id, path: asset.path }))
  const pathByAssetId = new Map(uploads.map((asset) => [asset.id, asset.path]))

  /** Where a slide's picture is served from. The renderer inlines it instead. */
  const imageSrcFor = (assetId: unknown): string | undefined => {
    if (typeof assetId !== 'string') return undefined
    const path = pathByAssetId.get(assetId)
    return path ? `/assets/${path}` : undefined
  }

  /**
   * Per-role character budgets from the niche's format, for the editor's
   * counters. Soft: the renderer shrinks type to fit, so over budget costs a
   * smaller headline rather than a broken slide.
   */
  const parsedNiche = packFromRow(niche)
  const format = parsedNiche.ok
    ? parsedNiche.pack.formats.find((candidate) => candidate.id === post.format)
    : undefined

  const budgetsFor = (role: string) => {
    const definition = format?.roles.find((candidate) => candidate.id === role)
    return {
      ...(definition?.headlineBudget ? { headline: definition.headlineBudget } : {}),
      ...(definition?.bodyBudget ? { body: definition.bodyBudget } : {}),
    }
  }

  const addableRoles = format?.roles.map((role) => role.id) ?? [
    ...new Set(slides.map((slide) => slide.role)),
  ]

  /** The slide whose editor is open, if the URL asked for one. */
  const editing = editable ? slides.find((slide) => slide.id === edit) : undefined

  /**
   * A gate finding that names a slide becomes a link to that slide's editor.
   *
   * The findings have carried a `slideIndex` since the gate was written and
   * nothing ever used it, because until now there was nothing to point at. This
   * is the whole reason the editor lives on the review page rather than behind
   * its own route: "Slide 3 has no alt text" should be one click from fixing
   * slide 3, not a fact to hold in your head while navigating.
   */
  const issueHref = (slideIndex: number | undefined): string | undefined => {
    if (slideIndex === undefined || !editable) return undefined
    const target = slides[slideIndex]
    return target ? `/posts/${post.id}?edit=${target.id}#slide-${slideIndex + 1}` : undefined
  }

  return (
    <Shell session={session}>
      {/* Wraps rather than refusing to shrink. The three controls were
          `shrink-0` beside a title that could not give up any width, so on a
          phone they simply ran 122px past the edge of the screen and took the
          document into horizontal scroll. The 18rem basis is what decides when
          the row breaks: below it the title has stopped being readable anyway,
          so the buttons take their own line. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-[var(--sp-5)]">
        <div className="min-w-0 flex-1 basis-72">
          <Link href="/" className="mb-2 inline-block text-xs text-subtle hover:text-muted">
            {t.nav.backToBoard}
          </Link>
          <h1 className="text-xl leading-tight font-semibold">{post.hook || post.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-subtle">
            <StatusBadge status={post.status} />
            <span>{niche.name}</span>
            <span>·</span>
            <span>{post.format}</span>
            <span>·</span>
            <span>{t.board.slideCount(slides.length)}</span>
            <span>·</span>
            {/* Where this is going, named before anyone approves it. The gate
                blocks when there is none, but a reviewer should be able to see
                the destination without reading a finding to find out. */}
            {/* The URL of the live post. It has been stored on every publish
                since publishing was written and nothing ever displayed it, so
                there was no way to get from a published post to the real thing.
                Not on the board card, because that card is itself a link and an
                anchor cannot nest inside one. */}
            {post.igPermalink && (
              <>
                <a
                  href={post.igPermalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  {t.review.viewOnInstagram}
                </a>
                <span>·</span>
              </>
            )}
            {account ? (
              <span title={t.review.accountFromChannel}>
                {t.review.publishesTo} @{account.username}
              </span>
            ) : (
              <span className="text-err">{t.review.publishesToNone}</span>
            )}
          </div>
        </div>

        {/* Bottom-aligned, not centred. Three of these controls are bare
            buttons and the rest are labelled fields, and a label adds ~19px
            above the control it names. Centring measured every button against
            the tallest item in the row, so the two bare buttons floated 9px
            above the one button that sat on the input's baseline — the row
            read as broken rather than as one row. The shared edge is the
            bottom edge, because every control here is `--control-h` tall; only
            what sits above them differs. */}
        <div className="flex flex-wrap items-end gap-[var(--sp-4)]">
          {/* Only when there is genuinely a choice. With one account the
              channel's binding is the only possible answer, and a picker with a
              single entry is a control that cannot do anything.

              `mayPublish`, not `editable`: `savePostAccountAction` requires the
              `publish` capability, and this was rendered for anyone who could
              edit. An editor could change where a post lands and the server
              refused silently — a control that does nothing is worse than one
              that is not there. */}
          {editable && mayPublish && accounts.length > 1 && (
            <form action={savePostAccountAction} className="flex items-end gap-2">
              <input type="hidden" name="postId" value={post.id} />
              <label>
                <span className="mb-1 block text-xs text-subtle">{t.review.publishesTo}</span>
                <select
                  name="igAccountId"
                  defaultValue={post.igAccountId ?? ''}
                  className="field text-xs"
                >
                  <option value="">{t.review.publishesToNone}</option>
                  {accounts.map((option) => (
                    <option key={option.id} value={option.id}>
                      @{option.username}
                    </option>
                  ))}
                </select>
              </label>
              <ActionButton
                idle={t.review.changeAccount}
                busy="…"
                className="btn btn-quiet shrink-0 px-2 py-1 text-xs"
              />
            </form>
          )}

          {/* The claims, sources, overrides and approver in one exportable
              document — the answer to "where did you get that?", and the
              evidence the AI Act's human-review exemption asks for. */}
          <Link
            href={`/posts/${post.id}/record`}
            className="btn btn-ghost"
          >
            {t.review.record}
          </Link>

          {/* The reason field, which never existed. `rejectAction` has always
              read a `reason` from the form and defaulted to the literal English
              string "Rejected in review" — so every human rejection in the
              product recorded the same sentence, in one language, in the column
              the editorial record reads back. In a product whose thesis is a
              defensible per-post record, the reviewer could not say why they
              stopped a post. Optional rather than required: the default is
              honest, and forcing prose would make stopping something harder
              than approving it. */}
          <form action={rejectAction} className="flex flex-wrap items-end gap-[var(--sp-3)]">
            <input type="hidden" name="postId" value={post.id} />
            <label className="min-w-0">
              <span className="mb-1 block text-xs text-subtle">{t.review.rejectReason}</span>
              <input
                name="reason"
                maxLength={2000}
                placeholder={t.review.rejectReasonPlaceholder}
                className="field w-full text-xs sm:w-56"
              />
            </label>
            <ActionButton
              idle={t.review.reject}
              busy={t.review.rejecting}
              // `rejectAction` asks for `publish`, same as approving — sending a
              // post back is a decision about whether it goes out, not an edit.
              // This checked only `editable`, so an editor got an enabled button
              // and a refusal.
              disabled={!editable || !mayPublish}
              className="btn btn-ghost shrink-0 hover:border-err hover:text-err"
            />
          </form>

          {/* Approving *is* scheduling. There is no separate publish step and
              no "approved, now what" state — the time is part of the decision,
              and leaving it empty means as soon as possible. The field is only
              offered when the gate passes, because choosing a time for a post
              that cannot go out is a question with no answer. */}
          <form action={approveAction} className="flex flex-wrap items-end gap-[var(--sp-4)]">
            <input type="hidden" name="postId" value={post.id} />
            <ApproveControls
              showSchedule={gate.passed && editable}
              disabled={!gate.passed || !editable || !mayPublish}
              {...(gate.passed ? {} : { title: t.review.approveBlocked })}
              labels={{
                publishAt: t.review.publishAt,
                publishAtHint: t.review.publishAtHint,
                approveNow: t.review.approveNow,
                approveScheduled: t.review.approveScheduled,
                approving: t.review.approving,
              }}
            />
          </form>

          {/**
           * The way back out, which did not exist.
           *
           * Approving moves a post to `scheduled`, and `isEditable` locks that
           * status — so from the moment someone approved, the product offered
           * no cancel, no unschedule and no reschedule. Combined with an
           * Approve button whose default is "publish immediately", the most
           * likely reason to want this was realising a second later that the
           * time was wrong.
           *
           * Only while `scheduled`. Once the worker has claimed the row it owns
           * it, may already have created containers, and may be between
           * `media_publish` and its own commit — racing that is how a duplicate
           * carousel happens, so `publishing` deliberately offers nothing.
           */}
          {post.status === 'scheduled' && mayPublish && (
            <ScheduledControls
              postId={post.id}
              unschedule={unscheduleAction}
              reschedule={rescheduleAction}
              labels={{
                scheduledFor: post.scheduledAt
                  ? t.review.scheduledFor(post.scheduledAt.toLocaleString(locale))
                  : t.review.scheduledSoon,
                newTime: t.review.rescheduleTo,
                reschedule: t.review.reschedule,
                rescheduling: t.review.rescheduling,
                unschedule: t.review.unschedule,
                unscheduling: t.review.unscheduling,
                unscheduleHint: t.review.unscheduleHint,
              }}
            />
          )}
        </div>
      </div>

      {/* An action was refused server-side — most often the gate.

          `role="alert"` because this arrives after a full redirect: without a
          live region a screen-reader user gets no signal that anything was
          refused, and the page simply looks unchanged. `tabIndex`/`autoFocus`
          on a non-interactive element would be wrong, so the alert role is what
          announces it. */}
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-err bg-err-weak p-3 text-sm text-err"
        >
          {error}
        </div>
      )}

      {/**
       * What the worker hit, when it could not publish.
       *
       * `markFailed` and `markAccountBroken` write carefully worded,
       * operator-facing text into `failureReason` — and nothing in the whole web
       * app read the column. A post that failed to publish showed a red badge
       * and no reason at all, which is the same dead end `reviewNotes` exists to
       * prevent, on the more urgent half of the lifecycle.
       *
       * `publishAttempts` alongside it, because "failed once" and "failed four
       * times and gave up" are different situations and the badge cannot tell
       * them apart.
       */}
      {post.failureReason?.trim() && (
        <div
          className="mb-6 rounded-lg border border-err bg-err-weak p-3 text-sm whitespace-pre-wrap text-err"
          role={post.status === 'failed' ? 'alert' : undefined}
        >
          <span className="mb-1 block text-xs font-medium tracking-wide uppercase">
            {t.review.publishProblem}
            {post.publishAttempts > 1 ? ` · ${t.review.attemptCount(post.publishAttempts)}` : ''}
          </span>
          {post.failureReason}
        </div>
      )}

      {/* Why a person or the gate stopped this. Without it, a rejected post is
          an unexplained dead end and the reason has to be guessed. */}
      {post.reviewNotes?.trim() && (
        <div className="mb-6 rounded-lg border border-rule bg-raised p-3 text-sm whitespace-pre-wrap text-muted">
          <span className="mb-1 block text-xs font-medium tracking-wide text-subtle uppercase">
            {t.review.reviewNote}
          </span>
          {post.reviewNotes}
        </div>
      )}

      {performance && (
        <section className="mb-6 rounded-[var(--radius-2)] border border-rule bg-raised p-4">
          <h2 className="mb-3 text-xs font-medium tracking-wide text-subtle uppercase">
            {t.review.performance}
          </h2>
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <Metric label={t.review.metricSaved} value={performance.saved} lead />
            <Metric label={t.review.metricShares} value={performance.shares} lead />
            <Metric label={t.review.metricReach} value={performance.reach} />
            <Metric label={t.review.metricComments} value={performance.comments} />
            <Metric label={t.review.metricLikes} value={performance.likes} />
            <Metric label={t.review.metricFollows} value={performance.follows} />
          </dl>
          <p className="mt-2 text-xs text-subtle">
            {t.review.metricAsOf} {performance.capturedOn}
          </p>
        </section>
      )}

      {/* ── Gate ─────────────────────────────────────────────────────────── */}
      <section
        className={`mb-6 rounded-lg border p-4 ${
          gate.passed ? 'border-ok bg-ok-weak' : 'border-err bg-err-weak'
        }`}
      >
        <h2 className="mb-2 text-sm font-semibold">
          {gate.passed ? t.review.ready : t.review.blocked(gate.blocks.length)}
        </h2>
        <ul className="space-y-1 text-sm">
          {gate.blocks.map((issue, i) => (
            <li key={`b${i}`} className="text-err">
              ✕ <IssueText issue={issue} t={t} href={issueHref(issue.slideIndex)} />
            </li>
          ))}
          {gate.warnings.map((issue, i) => (
            <li key={`w${i}`} className="text-warn">
              ! <IssueText issue={issue} t={t} href={issueHref(issue.slideIndex)} />
            </li>
          ))}
          {gate.passed && gate.warnings.length === 0 && (
            <li className="text-muted">{t.review.allGood}</li>
          )}
        </ul>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ── Slides ─────────────────────────────────────────────────────── */}
        <section className="min-w-0">
          <h2 className="mb-3 text-xs font-medium tracking-wide text-subtle uppercase">
            {t.review.slides}
          </h2>
          {/* A post the gate refused has no slides at all, and generateAction
              sends every one of them straight here — so this is the landing
              page for the product's signature outcome, not an edge case. An
              unexplained empty box was telling that story badly. */}
          {slides.length === 0 && (
            <div className="border-rule rounded-[var(--radius-2)] border border-dashed p-[var(--sp-7)]">
              <p className="prose mb-[var(--sp-5)] text-sm">{t.review.noSlides}</p>
              <Link href={`/posts/${post.id}/record`} className="btn btn-ghost">
                {t.review.noSlidesAction}
              </Link>
            </div>
          )}

          {/* Theme, accent and watermark. All three were built and none of them
              had a switch until this panel. */}
          {editable && slides.length > 0 && (
            <AppearancePanel
              postId={post.id}
              themeId={post.themeId}
              accentColor={niche.accentColor}
              watermark={niche.watermark}
              sample={{
                templateId: slides[0]!.templateId ?? post.templateId,
                role: slides[0]!.role,
                content: slides[0]!.content,
                total: slides.length,
                lang: niche.language,
                ...(imageSrcFor(slides[0]!.content.imageAssetId)
                  ? { imageSrc: imageSrcFor(slides[0]!.content.imageAssetId)! }
                  : {}),
              }}
              labels={t.review.edit}
            />
          )}

          <div className="space-y-[var(--sp-5)]">
            {slides.map((slide) => {
              const isEditing = editing?.id === slide.id

              return (
                <div key={slide.id} id={`slide-${slide.index + 1}`} className="scroll-mt-6">
                  {isEditing ? (
                    <div className="rounded-[var(--radius-2)] border border-accent bg-raised p-[var(--sp-5)]">
                      <SlideEditor
                        slide={{
                          id: slide.id,
                          index: slide.index,
                          role: slide.role,
                          content: slide.content,
                          altText: slide.altText,
                          templateId: slide.templateId,
                          updatedAt: slide.updatedAt.toISOString(),
                        }}
                        postId={post.id}
                        postTemplateId={post.templateId}
                        themeId={post.themeId}
                        accentColor={niche.accentColor}
                        watermark={niche.watermark}
                        lang={niche.language}
                        total={slides.length}
                        fields={fieldsForSlide(slide.role, slide.templateId, post.templateId)}
                        budgets={budgetsFor(slide.role)}
                        layoutOptions={roleFixesLayout(slide.role) ? [] : [...TEMPLATE_IDS]}
                        uploads={uploadOptions}
                        labels={t.review.edit}
                      />
                    </div>
                  ) : (
                    <figure className="flex flex-wrap items-start gap-[var(--sp-5)]">
                      {/*
                        Only the first few previews are built on the server.

                        Each one is a complete 1080×1350 template tree; eight of
                        them measured 562 KB of HTML and ~430 ms of render time,
                        on a page whose first job is to show the gate verdict.
                        The ones above the fold are worth paying for immediately;
                        the rest are built in the browser as they are scrolled
                        to, from a few hundred bytes of props.

                        `DeferredPreview` takes props rather than children on
                        purpose — see the note there.
                      */}
                      {slide.index < EAGER_PREVIEWS ? (
                        <SlidePreview
                          templateId={slide.templateId ?? post.templateId}
                          themeId={post.themeId}
                          accentColor={niche.accentColor}
                          role={slide.role}
                          content={slide.content}
                          page={slide.index + 1}
                          total={slides.length}
                          watermark={niche.watermark || undefined}
                          lang={niche.language}
                          imageSrc={imageSrcFor(slide.content.imageAssetId)}
                        />
                      ) : (
                        <DeferredPreview
                          templateId={slide.templateId ?? post.templateId}
                          themeId={post.themeId}
                          accentColor={niche.accentColor}
                          role={slide.role}
                          content={slide.content}
                          page={slide.index + 1}
                          total={slides.length}
                          watermark={niche.watermark || undefined}
                          lang={niche.language}
                          imageSrc={imageSrcFor(slide.content.imageAssetId)}
                        />
                      )}

                      <figcaption className="min-w-0 flex-1 basis-48 text-xs text-subtle">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            {slide.index + 1}. {slide.role}
                          </span>
                          {!slide.altText?.trim() && (
                            <span className="text-err">{t.review.noAltText}</span>
                          )}
                          {slide.editedAt && (
                            <span className="text-muted">· {t.review.edit.editedByHand}</span>
                          )}
                        </div>

                        {editable && (
                          <div className="mt-[var(--sp-4)] flex flex-wrap items-center gap-[var(--sp-3)]">
                            <Link
                              href={`/posts/${post.id}?edit=${slide.id}#slide-${slide.index + 1}`}
                              className="btn btn-ghost px-2 py-1 text-xs"
                            >
                              {t.review.edit.open}
                            </Link>
                            <SlideStructureControls
                              postId={post.id}
                              slideId={slide.id}
                              slideCount={slides.length}
                              isFirst={slide.index === 0}
                              isLast={slide.index === slides.length - 1}
                              canDelete={slides.length > MIN_SLIDES}
                              labels={t.review.edit}
                            />
                          </div>
                        )}
                      </figcaption>
                    </figure>
                  )}
                </div>
              )
            })}
          </div>

          {/* Offered even with no slides at all, which is the state that needed
              it most. A post the gate stopped before writing is saved with an
              empty carousel and lands here with a "0 slides; a carousel takes
              2–10" block — and this form used to be hidden behind
              `slides.length > 0`, so the one control that could resolve that
              block disappeared in exactly the case it was for. */}
          {editable && (
            <div className="mt-[var(--sp-5)] border-t border-rule pt-[var(--sp-5)]">
              <AddSlideForm
                postId={post.id}
                afterIndex={slides.length - 1}
                slideCount={slides.length}
                roles={addableRoles}
                labels={t.review.edit}
              />
            </div>
          )}

          <h2 className="mt-8 mb-2 text-xs font-medium tracking-wide text-subtle uppercase">
            {t.review.caption}
            {!editable && (
              <span className="ml-2 normal-case">
                ({t.review.captionCount(post.caption.length, MAX_CAPTION)})
              </span>
            )}
          </h2>

          {/* The gate blocks on caption length and hashtag count, so leaving
              these read-only made two of its findings unfixable in exactly the
              way a missing alt text was. */}
          {editable ? (
            <PostTextEditor
              postId={post.id}
              caption={post.caption}
              hashtags={post.hashtags}
              hook={post.hook}
              firstComment={post.firstComment ?? ''}
              maxCaption={MAX_CAPTION}
              labels={t.review.edit}
            />
          ) : (
            <>
              <div className="rounded-lg border border-rule bg-raised p-4 text-sm whitespace-pre-wrap text-fg">
                {post.caption}
              </div>
              <p className="mt-2 text-xs text-subtle">
                {post.hashtags.map((h) => `#${h}`).join(' ')}
              </p>
            </>
          )}
        </section>

        {/* ── Evidence ───────────────────────────────────────────────────── */}
        <section className="min-w-0">
          <h2 className="mb-3 text-xs font-medium tracking-wide text-subtle uppercase">
            {t.review.evidence(claims.length)}
          </h2>

          {claims.length === 0 && (
            <p className="prose text-sm">{t.review.noClaims}</p>
          )}

          <div className="space-y-3">
            {claims.map((claim) => {
              const style = VERDICT_STYLE[claim.verdict] ?? VERDICT_STYLE['unverifiable']!
              return (
                <article
                  key={claim.id}
                  className="rounded-lg border border-rule bg-raised p-3"
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${style.badge}`}>
                      {style.mark} {t.review.verdicts[claim.verdict] ?? claim.verdict}
                    </span>
                    <span className="text-xs text-subtle">
                      {claim.confidence.toFixed(2)}
                    </span>
                    {claim.isCore && (
                      <span className="rounded bg-sunken px-1.5 py-0.5 text-xs tracking-wide text-muted uppercase">
                        {t.review.core}
                      </span>
                    )}
                  </div>

                  <p className="mb-2 text-sm leading-snug text-fg">{claim.claim}</p>
                  <p className="mb-2 text-xs leading-relaxed text-subtle">{claim.reasoning}</p>

                  {claim.sources.length > 0 && (
                    <ul className="space-y-1">
                      {claim.sources.map((source, i) => (
                        <li key={i} className="truncate text-xs">
                          <SourceLink url={source.url} title={source.title} t={t} />
                        </li>
                      ))}
                    </ul>
                  )}

                  {claim.resolvedBy ? (
                    <p className="mt-2 rounded bg-sunken p-2 text-xs text-muted">
                      {t.review.overridden}
                      {claim.resolvedNote ? `: ${claim.resolvedNote}` : ''}
                    </p>
                  ) : (
                    needsOverride(claim, niche.rules) &&
                    editable &&
                    // `resolveClaimAction` requires `publish`, and says why:
                    // overriding a verdict is signing off on a claim the
                    // research would not stand behind, recorded against the
                    // person who did it. Rendered for `editable` alone, an
                    // editor could fill the box, submit, and be refused.
                    mayPublish && (
                      <form action={resolveClaimAction} className="mt-2 flex gap-1.5">
                        <input type="hidden" name="claimId" value={claim.id} />
                        <input type="hidden" name="postId" value={post.id} />
                        <input
                          name="note"
                          required
                          minLength={10}
                          placeholder={t.review.overridePlaceholder}
                          className="field min-w-0 flex-1"
                        />
                        <ActionButton
                          idle={t.review.override}
                          busy={t.review.overriding}
                          className="btn btn-ghost shrink-0 hover:border-warn hover:text-warn"
                        />
                      </form>
                    )
                  )}
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </Shell>
  )
}
