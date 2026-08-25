'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import { acceptInvitationAction } from './actions.ts'

const client = createAuthClient({ plugins: [organizationClient()] })

export function JoinInviteButton({
  token,
  labels,
}: {
  token: string
  labels: {
    join: string
    joining: string
    invalid: string
    alreadyMember: string
    wrongEmail: (invited: string, current: string) => string
    activateFailed: string
  }
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function join() {
    setBusy(true)
    setError(null)

    try {
      const result = await acceptInvitationAction(token)
      if (!result.ok) {
        setError(
          result.reason === 'wrong_email'
            ? labels.wrongEmail(result.invitedEmail, result.currentEmail)
            : labels.invalid,
        )
        return
      }

      const { error: activationError } = await client.organization.setActive({
        organizationId: result.orgId,
      })
      if (activationError) {
        setError(labels.activateFailed)
        return
      }

      router.replace('/')
      router.refresh()
    } catch {
      setError(labels.activateFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-[var(--sp-5)] text-sm text-err">
          {error}
        </p>
      )}
      <button type="button" onClick={() => void join()} disabled={busy} className="btn">
        {busy ? labels.joining : labels.join}
      </button>
    </>
  )
}
