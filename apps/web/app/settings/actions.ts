'use server'

import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'

import { db, organization } from '@claimfold/db'

import { auth } from '../../lib/auth.ts'
import { formText } from '../../lib/form.ts'
import { getMessages, isLocale, LOCALE_COOKIE } from '../../lib/i18n/index.ts'
import { can } from '../../lib/permissions.ts'
import { requireSession } from '../../lib/session.ts'

/**
 * Saving the two language settings.
 *
 * They are stored in different places because they answer different
 * questions. The interface language describes a browser — two people sharing
 * a workspace can want different ones — so it lives in a cookie. The default
 * output language describes the workspace, so it lives on the organization.
 */

/** A year: long enough that nobody re-picks their own language every week. */
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60

export async function saveLanguageAction(formData: FormData): Promise<void> {
  const session = await requireSession()
  /*
    The interface language is a per-browser cookie anyone may set; the workspace's
    default output language is configuration. So the cookie is written either way
    and only the organization write is gated.
  */

  const ui = formText(formData, 'interfaceLanguage').trim()
  const output = formText(formData, 'outputLanguage').trim()

  if (isLocale(ui)) {
    const jar = await cookies()
    jar.set(LOCALE_COOKIE, ui, {
      // Readable by the browser is fine — it is a display preference, not a
      // credential, and nothing is authorised on the strength of it.
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    })
  }

  // An empty value means "follow the dashboard", stored as null rather than as
  // a copy of today's interface language — otherwise changing the dashboard
  // later would silently stop affecting new channels.
  const nextDefault = isLocale(output) ? output : null

  /*
    Refuse out loud rather than skipping the write and reporting success.

    This used to be `if (can(...)) { write }` with no else: a viewer submitting
    the form got the same "Saved" the operator gets, and the workspace default
    was silently unchanged. A permission check that fails quietly teaches people
    the setting is broken, not that they lack the role.

    The cookie above is deliberately still set — that is the person's own
    interface language, which every role may change. Only the workspace default
    needs `edit`.
  */
  if (!can(session, 'edit')) {
    redirect(`/settings?error=${encodeURIComponent((await getMessages()).errors.notPermitted)}`)
  }

  // `organization` sits outside row-level security: a user has to be able to
  // read it before any tenant context exists. So this writes through the
  // unscoped client, and the org id comes from `requireSession`, which
  // re-verifies membership on every request rather than trusting the cookie.
  await db
    .update(organization)
    .set({ defaultLanguage: nextDefault })
    .where(eq(organization.id, session.orgId))

  revalidatePath('/', 'layout')
}

/* ─── Your own account ───────────────────────────────────────────────────── */

/**
 * Editing the person rather than the workspace.
 *
 * Everything goes through Better Auth's own API rather than an UPDATE on the
 * `user` table. That is not ceremony: the library owns the password hash format,
 * the session records and the rate limits, and writing round it would produce a
 * hash sign-in cannot verify or a password change that leaves stolen sessions
 * alive. The one thing this file owns is turning the library's failures into
 * sentences somebody can act on.
 */

/** Where to send the reader back, with something to read. */
function backToSettings(params: Record<string, string>): never {
  redirect(`/settings?${new URLSearchParams(params).toString()}`)
}

/**
 * Forward the request's own headers into the auth API.
 *
 * Better Auth identifies the caller from the session cookie, so a server action
 * that omits these is an unauthenticated call — it fails with a confusing
 * "session required" rather than doing nothing, which is at least loud.
 */
async function authHeaders(): Promise<Headers> {
  return new Headers(await headers())
}

export async function saveProfileAction(formData: FormData): Promise<void> {
  await requireSession()
  const t = (await getMessages()).settings.account

  const name = formText(formData, 'name').trim().slice(0, 120)
  const email = formText(formData, 'email').trim().slice(0, 320)

  if (!name) backToSettings({ accountError: t.errors.nameEmpty })

  // Deliberately loose. The authority on whether an address works is whether
  // mail reaches it, and this install may have no mail at all — so this only
  // catches the shapes that are certainly wrong.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    backToSettings({ accountError: t.errors.emailInvalid })
  }

  try {
    await auth.api.updateUser({ body: { name }, headers: await authHeaders() })

    /**
     * The address is changed separately, because it is not the same kind of
     * change. Better Auth treats it as one: with verification enabled it sends a
     * confirmation and leaves the old address in place until it is used. This
     * install has verification off (see lib/auth.ts), so it takes effect
     * immediately — which is worth knowing when reading this, because the same
     * call behaves differently the moment SMTP is configured.
     */
    const current = await auth.api.getSession({ headers: await authHeaders() })
    if (current && current.user.email !== email) {
      await auth.api.changeEmail({ body: { newEmail: email }, headers: await authHeaders() })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    backToSettings({
      accountError: /exist|taken|unique/i.test(message) ? t.errors.emailTaken : t.errors.failed,
    })
  }

  revalidatePath('/settings', 'layout')
  backToSettings({ accountSaved: '1' })
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  await requireSession()
  const t = (await getMessages()).settings.account

  const currentPassword = formText(formData, 'currentPassword')
  const newPassword = formText(formData, 'newPassword')
  const confirmPassword = formText(formData, 'confirmPassword')

  // Checked here as well as by the library, so the message names the actual
  // problem instead of the library's generic one.
  if (newPassword !== confirmPassword) backToSettings({ accountError: t.errors.mismatch })
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    backToSettings({ accountError: t.errors.tooShort(MIN_PASSWORD_LENGTH) })
  }
  if (newPassword === currentPassword) backToSettings({ accountError: t.errors.sameAsOld })

  try {
    await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        /**
         * Every other session ends.
         *
         * The reason most people change a password is that they think someone
         * else has it. Leaving those sessions alive would make the change
         * cosmetic — and this session is kept so the person is not thrown out of
         * the page they just used.
         */
        revokeOtherSessions: true,
      },
      headers: await authHeaders(),
    })
  } catch {
    // The library does not distinguish a wrong current password from other
    // refusals in a way worth parsing, and the wrong password is what it almost
    // always is.
    backToSettings({ accountError: t.errors.wrongPassword })
  }

  revalidatePath('/settings', 'layout')
  backToSettings({ passwordChanged: '1' })
}

/** Kept in step with `emailAndPassword.minPasswordLength` in lib/auth.ts. */
const MIN_PASSWORD_LENGTH = 12

export async function signOutOtherSessionsAction(): Promise<void> {
  await requireSession()

  try {
    await auth.api.revokeOtherSessions({ headers: await authHeaders() })
  } catch {
    const t = (await getMessages()).settings.account
    backToSettings({ accountError: t.errors.failed })
  }

  backToSettings({ accountSaved: '1' })
}
