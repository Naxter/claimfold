'use client'

import { useActionState } from 'react'

import { ActionButton } from '../../components/action-button.tsx'
import { CopyField } from '../../components/copy-field.tsx'
import { inviteMemberAction } from './actions.ts'
import type { InviteFormState } from './invite-state.ts'

/**
 * Creating an invitation, and showing the link exactly once.
 *
 * `useActionState` rather than a plain `<form action={…}>` because the link
 * has to come back to the page without going through the URL. It is a bearer
 * credential with a seven-day life: a query string would leave it in browser
 * history and in the reverse proxy's access log, both of which outlive the
 * seven days and neither of which the operator can clear.
 *
 * The state lives in the browser and is gone on the next navigation, which is
 * what "shown once" was always supposed to mean.
 */
export function InviteForm({
  roles,
  labels,
}: {
  roles: ReadonlyArray<{ value: string; label: string }>
  labels: {
    email: string
    role: string
    createInvite: string
    creatingInvite: string
    inviteReady: string
    inviteLink: string
    inviteOnce: string
    inviteHint: string
    copy: string
    copied: string
    copyManualHint: string
  }
}) {
  const [state, action] = useActionState<InviteFormState, FormData>(inviteMemberAction, {})

  return (
    <>
      {state.error && (
        <div
          role="alert"
          className="mb-[var(--sp-5)] rounded-[var(--radius-2)] border border-err bg-err-weak p-3 text-sm text-err"
        >
          {state.error}
        </div>
      )}

      {state.link && (
        <div className="mb-[var(--sp-5)] rounded-[var(--radius-2)] border border-ok bg-ok-weak p-[var(--sp-5)]">
          <p className="mb-[var(--sp-4)] text-sm text-ok">{labels.inviteReady}</p>
          <CopyField
            label={labels.inviteLink}
            value={state.link}
            copyLabel={labels.copy}
            copiedLabel={labels.copied}
            manualHint={labels.copyManualHint}
          />
          <p className="mt-[var(--sp-4)] text-xs text-muted">{labels.inviteOnce}</p>
        </div>
      )}

      <form action={action} className="flex flex-wrap items-end gap-[var(--sp-4)]">
        <label className="min-w-0 flex-1 basis-64">
          <span className="mb-1 block text-xs text-muted">{labels.email}</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="kollege@example.com"
            className="field w-full"
          />
        </label>

        <label>
          <span className="mb-1 block text-xs text-muted">{labels.role}</span>
          <select name="role" defaultValue="editor" className="field">
            {roles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </label>

        <ActionButton
          idle={labels.createInvite}
          busy={labels.creatingInvite}
          className="btn"
        />
      </form>

      <p className="mt-[var(--sp-4)] max-w-prose text-xs text-subtle">{labels.inviteHint}</p>
    </>
  )
}
