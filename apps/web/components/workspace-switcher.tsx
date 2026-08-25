'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

const client = createAuthClient({ plugins: [organizationClient()] })

interface Workspace {
  orgId: string
  orgName: string
}

/**
 * Switching workspaces means updating Better Auth's active-organization
 * cookie. The auth client owns that request so the server never writes its
 * session table directly.
 */
export function WorkspaceSwitcher({
  workspaces,
  activeId,
  labels,
}: {
  workspaces: Workspace[]
  activeId: string
  labels: { select: string; failed: string }
}) {
  const router = useRouter()
  const [selected, setSelected] = useState(activeId)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function switchWorkspace(orgId: string) {
    if (orgId === activeId) return

    setSelected(orgId)
    setBusy(true)
    setError(null)

    try {
      const { error: switchError } = await client.organization.setActive({ organizationId: orgId })
      if (switchError) throw new Error(switchError.message)
      router.refresh()
    } catch {
      setSelected(activeId)
      setError(labels.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="sidebar-label mt-[var(--sp-2)] block min-w-0">
      <span className="visually-hidden">{labels.select}</span>
      <select
        aria-label={labels.select}
        value={selected}
        disabled={busy}
        onChange={(event) => void switchWorkspace(event.target.value)}
        className="border-rule bg-bg text-fg w-full rounded-[var(--radius-1)] border px-2 py-1 text-xs disabled:cursor-wait"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.orgId} value={workspace.orgId}>
            {workspace.orgName}
          </option>
        ))}
      </select>
      {error && <span role="alert" className="mt-1 block text-xs text-err">{error}</span>}
    </label>
  )
}
