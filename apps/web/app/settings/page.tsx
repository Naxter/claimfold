import type { Metadata } from 'next'
import Link from 'next/link'
import { eq } from 'drizzle-orm'

import { channelsUsingAccount, db, organization } from '@claimfold/db'

import { Shell } from '../../components/shell.tsx'
import {
  AppCredentialsNote,
  Banner,
  ConnectForm,
  META_APPS_URL,
  ReadinessChecks,
  RedirectUriField,
  WithLink,
} from '../../components/instagram-connect.tsx'
import { AccountPanel } from '../../components/account-panel.tsx'
import { AppearanceControls } from '../../components/appearance-controls.tsx'
import { getMessages, getTranslation, LOCALES, LOCALE_LABELS } from '../../lib/i18n/index.ts'
import { loadReadiness } from '../../lib/instagram-setup.ts'
import { syncLicenseTier } from '../../lib/license.server.ts'
import { getPreferences } from '../../lib/preferences.server.ts'
import { requireSession } from '../../lib/session.ts'
import { saveLanguageAction } from './actions.ts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).settings.title }
}

/**
 * Settings, and the pre-flight checks for publishing.
 *
 * Every failure this page catches would otherwise appear as an opaque Meta
 * error at scheduled publish time, with nobody watching. Surfacing them here
 * — before an account is even connected — is the difference between a five
 * minute fix and a silent outage.
 *
 * This is the reference view for someone who already knows the moving parts.
 * A first-time operator is better served by `/setup`, which is the same
 * material in order and with the reasoning attached.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string
    error?: string
    saved?: string
    accountError?: string
    accountSaved?: string
    passwordChanged?: string
  }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const { locale, t } = await getTranslation()
  /*
    Bring `organization.licenseTier` in step with the key. The column's comment
    has always said it is cached from the licence at boot, and nothing ever wrote
    it. Done here rather than on every request because this is the one screen
    where somebody is looking at licence state anyway, and it writes only when the
    value actually differs.
  */
  await syncLicenseTier(session.orgId)

  const state = await loadReadiness(session.orgId)

  /*
    Channels bound to the connected account, so the page can say what would
    break if it went away. Empty when nothing is connected yet, which is the
    common case on a fresh install.
  */
  const dependentChannels = state.account
    ? await channelsUsingAccount(session.orgId, state.account.id)
    : []
  const prefs = await getPreferences()

  const [org] = await db
    .select({ defaultLanguage: organization.defaultLanguage })
    .from(organization)
    .where(eq(organization.id, session.orgId))
    .limit(1)

  return (
    <Shell session={session} title={t.settings.title}>
      {params.connected && <Banner kind="ok">{params.connected}</Banner>}
      {params.error && <Banner kind="error">{params.error}</Banner>}
      {params.saved && <Banner kind="ok">{t.settings.language.saved}</Banner>}
      {params.accountError && <Banner kind="error">{params.accountError}</Banner>}
      {params.accountSaved && <Banner kind="ok">{t.settings.account.profileSaved}</Banner>}
      {params.passwordChanged && (
        <Banner kind="ok">{t.settings.account.passwordChanged}</Banner>
      )}

      <div className="grid max-w-3xl gap-6">
        {/* ── Your account ────────────────────────────────────────────────
            First, because it is the only section on this page about the person
            rather than the workspace — and because the name here is what the
            editorial record shows against every post they approve. */}
        <AccountPanel
          name={session.name}
          email={session.email}
          labels={t.settings.account}
        />

        {/* ── Appearance ──────────────────────────────────────────────────
            Theme and row height apply the moment they are clicked, with no
            save button: they are things a person adjusts while looking at the
            result, and a round trip to repaint a colour would be felt. */}
        <section className="panel p-5">
          <h2 className="mb-4 text-sm font-semibold">{t.appearance.heading}</h2>
          <AppearanceControls theme={prefs.theme} density={prefs.density} t={t.appearance} />
        </section>

        {/* ── Language ────────────────────────────────────────────────── */}
        <section className="rounded-lg border border-rule bg-raised p-5">
          <h2 className="mb-3 text-sm font-semibold">{t.settings.language.heading}</h2>

          <form action={saveLanguageAction} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">
                {t.settings.language.interface}
              </span>
              <select
                name="interfaceLanguage"
                defaultValue={locale}
                className="field"
              >
                {LOCALES.map((option) => (
                  <option key={option} value={option}>
                    {LOCALE_LABELS[option]}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-subtle">
                {t.settings.language.interfaceHelp}
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-muted">
                {t.settings.language.output}
              </span>
              <select
                name="outputLanguage"
                defaultValue={org?.defaultLanguage ?? ''}
                className="field"
              >
                <option value="">{t.settings.language.followInterface}</option>
                {LOCALES.map((option) => (
                  <option key={option} value={option}>
                    {LOCALE_LABELS[option]}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-subtle">
                {t.settings.language.outputHelp}
              </span>
            </label>

            <button
              type="submit"
              className="btn"
            >
              {t.common.save}
            </button>
          </form>
        </section>

        {/* ── Publishing readiness ────────────────────────────────────── */}
        <section className="rounded-lg border border-rule bg-raised p-5">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-semibold">{t.settings.readiness.heading}</h2>
            {!state.account && (
              <Link href="/setup" className="text-xs text-accent hover:underline">
                {t.settings.readiness.guidedSetup}
              </Link>
            )}
          </div>
          <ReadinessChecks state={state} />

          {/**
           * Which channels depend on this account.
           *
           * `niches.ig_account_id` is `ON DELETE set null`, so if this account
           * is ever removed — Meta's data-deletion callback is the one path
           * that does — every channel pointing at it silently becomes
           * unpublishable. The failure then surfaces per post, at scheduled
           * publish time, as "no connected account is resolved", which is a
           * long way from the action that caused it.
           *
           * `restrict` would fail at the right moment but make Meta's deletion
           * request impossible to satisfy, and that request is not optional. So
           * the dependency is named here instead, while the operator is looking
           * at the account rather than at a failed post a week later.
           */}
          {dependentChannels.length > 0 && (
            <p className="mt-[var(--sp-4)] text-xs leading-relaxed text-subtle">
              {t.settings.readiness.usedByChannels(
                dependentChannels.map((channel) => channel.name).join(', '),
              )}
            </p>
          )}
        </section>

        {/* ── Connect ─────────────────────────────────────────────────── */}
        <section className="rounded-lg border border-rule bg-raised p-5">
          <h2 className="mb-1 text-sm font-semibold">
            {state.account ? t.settings.connect.headingExisting : t.settings.connect.headingNew}
          </h2>
          <p className="mb-4 text-xs leading-relaxed text-subtle">
            <WithLink
              template={t.settings.connect.intro}
              href={META_APPS_URL}
              label="developers.facebook.com/apps"
            />{' '}
            <Link href="/setup" className="text-accent hover:underline">
              {t.settings.connect.stepByStep}
            </Link>
            .
          </p>

          <div className="mb-4">
            <RedirectUriField />
          </div>

          <div className="mb-4">
            <AppCredentialsNote />
          </div>

          <ConnectForm hasAccount={state.account !== null} returnTo="settings" />
        </section>
      </div>
    </Shell>
  )
}
