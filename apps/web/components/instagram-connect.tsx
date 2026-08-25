import type { ReactNode } from 'react'

import { CopyField } from './copy-field.tsx'
import { getMessages } from '../lib/i18n/index.ts'
import {
  dataDeletionUri,
  deauthorizeUri,
  redirectUri,
  redirectUriIsLocal,
  tokenIsHealthy,
  type ReadinessState,
} from '../lib/instagram-setup.ts'

/**
 * The pieces shared by the settings page and the setup wizard.
 *
 * The wizard walks a first-time operator through these; settings shows the
 * same things to someone who already knows what they are looking at. Keeping
 * one implementation means the credential labels — the thing most likely to be
 * got wrong — can only ever say one thing, in every language.
 */

/** Canonical documentation. Linked rather than paraphrased: see {@link AppCredentialsNote}. */
export const INSTAGRAM_LOGIN_DOC =
  'https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login'

export const META_APPS_URL = 'https://developers.facebook.com/apps'

/** One publish precondition. */
export function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className={ok ? 'text-accent' : 'text-warn'}>{ok ? '✓' : '!'}</span>
      <span className="min-w-0">
        <span className="text-fg">{label}</span>
        {detail && <span className="ml-2 text-xs break-all text-subtle">{detail}</span>}
      </span>
    </li>
  )
}

/**
 * The three things that must hold before a carousel can go out.
 *
 * Every one of these would otherwise surface as an opaque Meta error at
 * scheduled publish time, with nobody watching.
 */
export async function ReadinessChecks({ state }: { state: ReadinessState }) {
  const { readiness } = (await getMessages()).settings

  return (
    <>
      <ul className="space-y-2 text-sm">
        <Check
          ok={state.appUrl.ok}
          label={readiness.appUrl}
          detail={state.appUrl.ok ? process.env.APP_URL : state.appUrl.reason}
        />
        <Check
          ok={state.asset.ok}
          label={readiness.images}
          detail={state.asset.ok ? process.env.PUBLIC_ASSET_URL : readiness.imagesNotSet}
        />
        <Check
          ok={state.account !== null}
          label={readiness.account}
          detail={state.account ? `@${state.account.username}` : readiness.accountNone}
        />
        <Check
          ok={tokenIsHealthy(state.daysLeft)}
          label={readiness.token}
          detail={
            state.daysLeft === null
              ? readiness.tokenNone
              : readiness.tokenDays(state.daysLeft)
          }
        />
      </ul>

      {!state.asset.ok && (
        <p className="mt-3 rounded-md bg-warn-weak p-3 text-xs leading-relaxed text-warn">
          {readiness.imagesWarning}
        </p>
      )}
    </>
  )
}

/** The redirect URI, with a warning when it will not survive to production. */
export async function RedirectUriField() {
  const t = await getMessages()

  return (
    <>
      <CopyField
        label={t.settings.connect.redirectLabel}
        value={redirectUri()}
        copyLabel={t.common.copy}
        copiedLabel={t.common.copied}
        manualHint={t.common.copyManualHint}
      />
      {redirectUriIsLocal() && (
        <p className="mt-2 text-xs leading-relaxed text-subtle">
          {t.setup.redirect.localWarning}
        </p>
      )}

      {/* The two URLs Meta also demands, and the wizard never mentioned.

          Both are required fields on the app configuration, so an operator
          following these steps exactly hit two boxes nobody had told them
          about — and either invented values or stopped there. */}
      <div className="mt-[var(--sp-5)] space-y-[var(--sp-4)]">
        <p className="text-xs leading-relaxed text-subtle">{t.setup.redirect.alsoRequired}</p>
        <CopyField
          label={t.setup.redirect.deauthorizeLabel}
          value={deauthorizeUri()}
          copyLabel={t.common.copy}
          copiedLabel={t.common.copied}
          manualHint={t.common.copyManualHint}
        />
        <CopyField
          label={t.setup.redirect.dataDeletionLabel}
          value={dataDeletionUri()}
          copyLabel={t.common.copy}
          copiedLabel={t.common.copied}
          manualHint={t.common.copyManualHint}
        />
      </div>
    </>
  )
}

/**
 * The mistake that costs an afternoon.
 *
 * `packages/ig/src/oauth.ts` authorises against `instagram.com/oauth/authorize`
 * and exchanges at `api.instagram.com/oauth/access_token` — the Instagram
 * Login pair, not the Meta app's own credentials. Both values are long
 * numbers, so the wrong one fails at consent with an error that names neither.
 *
 * The copy describes what to look for rather than a click path on purpose:
 * Meta relabels this dashboard often enough that exact menu names age into
 * lies, and a confidently wrong instruction is worse than none.
 */
export async function AppCredentialsNote() {
  const { connect } = (await getMessages()).setup

  return (
    <div className="rounded-md border border-warn bg-warn-weak p-3 text-xs leading-relaxed text-muted">
      <strong className="mb-1 block text-warn">{connect.warningTitle}</strong>
      {connect.warningBody}
      <br />
      <br />
      {connect.warningRelabel}{' '}
      <a
        href={INSTAGRAM_LOGIN_DOC}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent hover:underline"
      >
        Instagram API with Instagram Login
      </a>
    </div>
  )
}

/**
 * Credential entry. Posts to the connect route, which stores the pair and
 * redirects to Meta for consent.
 *
 * `returnTo` names which page the callback should land on, because consent
 * leaves the app entirely and comes back through a redirect that has no idea
 * where it started. Sending a wizard user back to settings would drop them out
 * of the flow one step from the end.
 */
export async function ConnectForm({
  hasAccount,
  returnTo,
}: {
  hasAccount: boolean
  returnTo: 'setup' | 'settings'
}) {
  const { connect } = (await getMessages()).settings

  return (
    <form action="/api/instagram/connect" method="post" className="space-y-3">
      <input type="hidden" name="returnTo" value={returnTo} />

      <label className="block">
        <span className="mb-1 block text-xs text-muted">{connect.appId}</span>
        <input
          name="appId"
          required
          inputMode="numeric"
          placeholder="1234567890123456"
          className="field"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-muted">{connect.appSecret}</span>
        <input
          name="appSecret"
          type="password"
          required
          autoComplete="off"
          className="field"
        />
        <span className="mt-1 block text-xs text-subtle">{connect.secretNote}</span>
      </label>

      <button
        type="submit"
        className="btn"
      >
        {hasAccount ? connect.submitExisting : connect.submitNew}
      </button>
    </form>
  )
}

/** Result banners, driven by the query string the callback redirects with. */
export function Banner({ kind, children }: { kind: 'ok' | 'error'; children: ReactNode }) {
  return (
    <div
      className={`mb-6 max-w-3xl rounded-lg border p-3 text-sm ${
        kind === 'ok'
          ? 'border-ok bg-ok-weak text-ok'
          : 'border-err bg-err-weak text-err'
      }`}
    >
      {children}
    </div>
  )
}

/**
 * Copy with a link in the middle of it.
 *
 * Translated sentences put the link in different places — German moves it to
 * the end, French keeps it mid-clause — so the position is a property of the
 * string, marked with `{link}`, rather than of the JSX. Splitting on the
 * placeholder is what lets a translator move it without touching code.
 */
export function WithLink({
  template,
  href,
  label,
}: {
  template: string
  href: string
  label: string
}) {
  const [before, after = ''] = template.split('{link}')

  return (
    <>
      {before}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent hover:underline"
      >
        {label}
      </a>
      {after}
    </>
  )
}
