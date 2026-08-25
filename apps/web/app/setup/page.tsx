import type { Metadata } from 'next'
import Link from 'next/link'

import { Shell } from '../../components/shell.tsx'
import {
  AppCredentialsNote,
  Banner,
  ConnectForm,
  META_APPS_URL,
  ReadinessChecks,
  RedirectUriField,
  WithLink,
  INSTAGRAM_LOGIN_DOC,
} from '../../components/instagram-connect.tsx'
import { getMessages, type Messages } from '../../lib/i18n/index.ts'
import { canPublish, loadReadiness, type ReadinessState } from '../../lib/instagram-setup.ts'
import { requireSession } from '../../lib/session.ts'

export const dynamic = 'force-dynamic'

/**
 * A tab you can tell apart from the other eight.
 *
 * The root layout supplies the `%s · Claimfold` template; this only names the
 * page. Resolved through the catalogue so the tab is in the reader's language
 * like everything else.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).setup.title }
}


/**
 * Guided Meta setup.
 *
 * The honest constraint shapes this whole page: steps 1 to 3 happen inside
 * Meta's and Instagram's own products, and nothing here can see whether they
 * were done. So they are never ticked. A green tick that means "you clicked
 * Continue" is worse than no tick at all — it is the wizard telling you a
 * configuration is correct when it has not looked.
 *
 * Steps 4 and 5 are checked against real state, and those ticks mean what they
 * appear to mean.
 */

const STEPS = ['account', 'metaApp', 'redirect', 'connect', 'ready'] as const

type StepKey = (typeof STEPS)[number]

const LAST = STEPS.length

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; connected?: string; error?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const t = await getMessages()

  const parsed = Number.parseInt(params.step ?? '1', 10)
  const step = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), LAST) : 1
  const key: StepKey = STEPS[step - 1]!

  const state = await loadReadiness(session.orgId)

  return (
    <Shell session={session} title={t.setup.title}>
      {params.connected && <Banner kind="ok">{params.connected}</Banner>}
      {params.error && <Banner kind="error">{params.error}</Banner>}

      <div className="max-w-3xl">
        <Stepper current={step} state={state} t={t} />

        <section className="rounded-lg border border-rule bg-raised p-5">
          <h2 className="mb-1 text-sm font-semibold">
            {t.setup.stepOf(step, LAST)} · {t.setup.steps[key].title}
          </h2>

          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted">
            {key === 'account' && <StepAccount t={t} />}
            {key === 'metaApp' && <StepMetaApp t={t} />}
            {key === 'redirect' && <StepRedirectUri t={t} />}
            {key === 'connect' && <StepConnect state={state} t={t} />}
            {key === 'ready' && <StepReady state={state} t={t} />}
          </div>

          <Footer step={step} state={state} t={t} />
        </section>
      </div>
    </Shell>
  )
}

/**
 * Progress markers.
 *
 * Steps 1 to 3 render their number forever — there is nothing to verify, so
 * there is nothing to tick. Only 4 and 5 can turn green, and only because
 * something was actually read from the database or the environment.
 */
function Stepper({
  current,
  state,
  t,
}: {
  current: number
  state: ReadinessState
  t: Messages
}) {
  const done: Record<number, boolean> = {
    4: state.account !== null,
    5: canPublish(state),
  }

  return (
    <ol className="mb-5 flex flex-wrap items-center gap-1 text-xs">
      {STEPS.map((key, index) => {
        const n = index + 1
        const isCurrent = n === current
        const isDone = done[n] === true
        return (
          <li key={key}>
            <Link
              href={`/setup?step=${n}`}
              // Marks the current step for assistive technology, not only with
              // a background colour. Without it every step in the list sounded
              // identical and there was no way to tell where you were.
              aria-current={isCurrent ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors ${
                isCurrent
                  ? 'bg-sunken text-fg'
                  : 'text-subtle hover:bg-sunken hover:text-muted'
              }`}
            >
              <span
                aria-hidden
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  isDone
                    ? 'bg-ok-weak text-ok'
                    : isCurrent
                      ? 'bg-rule-strong text-fg'
                      : 'bg-sunken text-subtle'
                }`}
              >
                {isDone ? '✓' : n}
              </span>
              {t.setup.steps[key].short}
              {/* The tick was bare text with no word beside it, so a completed
                  step and an incomplete one read the same. Said in words for
                  the reader who cannot see the colour. */}
              {isDone && <span className="visually-hidden">{t.setup.stepDone}</span>}
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

function StepAccount({ t }: { t: Messages }) {
  return (
    <>
      <p>{t.setup.account.body}</p>
      <p>{t.setup.account.how}</p>
      <Unverifiable t={t}>{t.setup.account.unverifiable}</Unverifiable>
    </>
  )
}

function StepMetaApp({ t }: { t: Messages }) {
  return (
    <>
      <p>
        <WithLink
          template={t.setup.metaApp.body}
          href={META_APPS_URL}
          label="developers.facebook.com/apps"
        />
      </p>
      <p>{t.setup.metaApp.roleHolder}</p>
      <p>
        {t.setup.metaApp.reference}{' '}
        <a
          href={INSTAGRAM_LOGIN_DOC}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          Instagram API with Instagram Login
        </a>
      </p>
      <Unverifiable t={t}>{t.setup.metaApp.unverifiable}</Unverifiable>
    </>
  )
}

function StepRedirectUri({ t }: { t: Messages }) {
  return (
    <>
      <p>{t.setup.redirect.body}</p>
      <RedirectUriField />
      <Unverifiable t={t}>{t.setup.redirect.unverifiable}</Unverifiable>
    </>
  )
}

function StepConnect({ state, t }: { state: ReadinessState; t: Messages }) {
  return (
    <>
      {state.account && (
        <p className="rounded-md border border-ok bg-ok-weak p-3 text-ok">
          {t.setup.connect.connected(state.account.username)}
        </p>
      )}

      <p>{t.setup.connect.body}</p>

      <AppCredentialsNote />
      <ConnectForm hasAccount={state.account !== null} returnTo="setup" />
    </>
  )
}

function StepReady({ state, t }: { state: ReadinessState; t: Messages }) {
  return (
    <>
      <ReadinessChecks state={state} />
      <p className="pt-2">
        {canPublish(state) ? t.setup.ready.allGood : t.setup.ready.blocked}
      </p>
      {canPublish(state) && <p className="pt-2 text-xs text-subtle">{t.setup.ready.canary}</p>}
    </>
  )
}

/**
 * The visible admission that a step cannot be checked.
 *
 * Stated per step rather than once at the top, because the place someone
 * wonders "did that work?" is the step itself.
 */
function Unverifiable({ t, children }: { t: Messages; children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-rule bg-bg p-3 text-xs leading-relaxed text-subtle">
      <strong className="text-muted">{t.setup.notChecked}</strong> {children}
    </p>
  )
}

function Footer({ step, state, t }: { step: number; state: ReadinessState; t: Messages }) {
  const connected = state.account !== null

  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-rule pt-4">
      {step > 1 ? (
        <Link
          href={`/setup?step=${step - 1}`}
          className="btn btn-ghost"
        >
          {t.common.back}
        </Link>
      ) : (
        <span />
      )}

      {step < LAST ? (
        <Link
          href={`/setup?step=${step + 1}`}
          className="btn"
        >
          {/* Named for what it actually asserts. On steps 1 to 3 that is the
              operator's word, not a check, and the label should not pretend
              otherwise. On step 4 the connection either happened or it did not. */}
          {step <= 3
            ? t.setup.doneContinue
            : connected
              ? t.common.continue
              : t.setup.skipForNow}
        </Link>
      ) : (
        <Link
          href="/"
          className="btn"
        >
          {t.common.finish}
        </Link>
      )}
    </div>
  )
}
