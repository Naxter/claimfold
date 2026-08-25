'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import { invitationPathFrom } from '../../lib/return-to.ts'

const client = createAuthClient({ plugins: [organizationClient()] })

/**
 * The three ways out of an account that belongs to no workspace.
 *
 * All three go through Better Auth's own client, the same way sign-up and the
 * invitation button do, so the session cookie is only ever written by the
 * library's route handler and never by a hand-rolled session-table update.
 */
export function NoWorkspaceControls({
  suggestedName,
  suggestedSlug,
  labels,
}: {
  suggestedName: string
  suggestedSlug: string
  labels: {
    pasteLabel: string
    pasteHint: string
    pasteAction: string
    pasteInvalid: string
    startTitle: string
    startHint: string
    startAction: string
    startFailed: string
    signOut: string
    working: string
  }
}) {
  const router = useRouter()
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function openInvitation(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    // Validated against the same allowlist the `returnTo` parameter uses, so a
    // pasted link cannot become a navigation to anywhere but this app's own
    // invitation route.
    const path = invitationPathFrom(pasted)
    if (!path) {
      setError(labels.pasteInvalid)
      return
    }

    router.push(path)
  }

  async function startWorkspace() {
    setBusy(true)
    setError(null)

    try {
      const { error: createError } = await client.organization.create({
        name: suggestedName,
        // Suffixed the same way sign-up does it: slugs are unique across the
        // install, and two people called `tom` must not collide.
        slug: `${suggestedSlug}-${Date.now().toString(36)}`,
      })
      if (createError) throw new Error(createError.message ?? labels.startFailed)

      router.replace('/')
      router.refresh()
    } catch {
      setError(labels.startFailed)
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setBusy(true)
    try {
      await client.signOut()
      router.replace('/sign-in')
      router.refresh()
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

      <form onSubmit={openInvitation} className="mb-[var(--sp-7)]">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">{labels.pasteLabel}</span>
          <input
            type="text"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="field w-full"
          />
        </label>
        <p className="mt-1 text-xs text-subtle">{labels.pasteHint}</p>
        <button type="submit" disabled={busy} className="btn mt-[var(--sp-4)]">
          {labels.pasteAction}
        </button>
      </form>

      <section className="border-rule border-t pt-[var(--sp-6)]">
        <h2 className="mb-[var(--sp-2)] text-xs font-medium tracking-wide text-subtle uppercase">
          {labels.startTitle}
        </h2>
        <p className="prose mb-[var(--sp-4)] text-sm">{labels.startHint}</p>
        <button
          type="button"
          onClick={() => void startWorkspace()}
          disabled={busy}
          className="btn btn-quiet"
        >
          {busy ? labels.working : labels.startAction}
        </button>
      </section>

      <button
        type="button"
        onClick={() => void signOut()}
        disabled={busy}
        className="mt-[var(--sp-6)] text-xs text-subtle hover:text-muted disabled:cursor-not-allowed"
      >
        {labels.signOut}
      </button>
    </>
  )
}
