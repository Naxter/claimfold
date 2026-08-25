import { ActionButton } from './action-button.tsx'
import type { Messages } from '../lib/i18n/messages/en.ts'
import {
  changePasswordAction,
  saveProfileAction,
  signOutOtherSessionsAction,
} from '../app/settings/actions.ts'

/**
 * Your own account, as opposed to the workspace.
 *
 * There was no way to change a name, an address or a password anywhere in the
 * product. The account was created at signup and then frozen — so somebody who
 * mistyped their email at setup, or who wanted a password they had not reused,
 * had to go into the database.
 *
 * The name is not cosmetic here, which is why it comes first: it is what the
 * editorial record shows as the person who took responsibility for a post. An
 * account called "Dev" approving public-interest content is a worse record than
 * one with a real name on it.
 *
 * Three separate forms rather than one. A password change needs the current
 * password and a profile edit does not, and putting them together would mean
 * asking for a password to correct a typo in a name.
 */
export function AccountPanel({
  name,
  email,
  labels,
}: {
  name: string
  email: string
  labels: Messages['settings']['account']
}) {
  return (
    <section className="rounded-lg border border-rule bg-raised p-5">
      <h2 className="mb-4 text-sm font-semibold">{labels.heading}</h2>

      <form action={saveProfileAction} className="mb-6 grid gap-4">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">{labels.name}</span>
          <input name="name" defaultValue={name} required className="field w-full sm:w-80" />
          <span className="mt-1 block text-xs text-subtle">{labels.nameHint}</span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-muted">{labels.email}</span>
          <input
            name="email"
            type="email"
            defaultValue={email}
            required
            className="field w-full sm:w-80"
          />
          <span className="mt-1 block text-xs text-subtle">{labels.emailHint}</span>
        </label>

        <ActionButton
          idle={labels.saveProfile}
          busy={labels.saving}
          className="btn justify-self-start"
        />
      </form>

      <div className="border-t border-rule pt-5">
        <h3 className="mb-3 text-sm font-semibold">{labels.passwordHeading}</h3>

        {/*
          `autoComplete` is set on all three so a password manager offers the
          right thing: the current one to fill, and a suggested new one to save.
          Without it browsers routinely offer the stored password for every field
          and the change silently becomes a no-op.
        */}
        <form action={changePasswordAction} className="grid gap-4">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">{labels.currentPassword}</span>
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              className="field w-full sm:w-80"
            />
            <span className="mt-1 block text-xs leading-relaxed text-subtle">
              {labels.currentPasswordHint}
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-muted">{labels.newPassword}</span>
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              className="field w-full sm:w-80"
            />
            <span className="mt-1 block text-xs text-subtle">{labels.newPasswordHint}</span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-muted">{labels.confirmPassword}</span>
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              className="field w-full sm:w-80"
            />
          </label>

          <ActionButton
            idle={labels.changePassword}
            busy={labels.saving}
            className="btn justify-self-start"
          />
        </form>
      </div>

      <div className="mt-6 border-t border-rule pt-5">
        <form action={signOutOtherSessionsAction}>
          <ActionButton
            idle={labels.signOutOthers}
            busy={labels.saving}
            className="btn btn-ghost"
          />
          <p className="mt-1 text-xs text-subtle">{labels.signOutOthersHint}</p>
        </form>
      </div>
    </section>
  )
}
