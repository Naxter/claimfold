'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { createAuthClient } from 'better-auth/react'
import { organizationClient } from 'better-auth/client/plugins'

import { APP_NAME } from '../../lib/app-name.ts'

/**
 * Only plain strings cross into the browser.
 *
 * The message catalogue holds functions for the strings that interpolate, and
 * a function cannot be serialised across the server/client boundary — React
 * throws at render time, not at compile time, which is exactly the kind of
 * error that reaches a user. So each client component declares the strings it
 * needs and the server resolves them.
 */
export interface SignInLabels {
  title: string
  subtitle: string
  signUpSubtitle: string
  invitedSignUpSubtitle: string
  name: string
  email: string
  password: string
  passwordHint: string
  submit: string
  createAccount: string
  noAccount: string
  createOne: string
  haveAccount: string
  loading: string
  /** Contains the placeholder `{owner}`, replaced with the new account's name. */
  workspaceNameTemplate: string
}

const client = createAuthClient({ plugins: [organizationClient()] })

/**
 * Sign in / sign up.
 *
 * A self-hosted install starts with no users at all, so the same screen does
 * both. The first person to sign up gets a personal organization; there is no
 * separate "create your workspace" step to get stuck on.
 *
 * Strings arrive as props: this runs in the browser, and the page that renders
 * it has already resolved the language server-side.
 */
export function SignInForm({
  t,
  /** False once this install has an operator and `ALLOW_SIGNUP` is not set. */
  canSignUp,
  /** A server-validated invitation destination, never an arbitrary URL. */
  returnTo,
}: {
  t: SignInLabels
  canSignUp: boolean
  returnTo?: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      if (mode === 'sign-up') {
        const { error: signUpError } = await client.signUp.email({ email, password, name })
        if (signUpError) throw new Error(signUpError.message ?? 'Sign-up failed')

        // Every user needs a tenant before any query can run — RLS has nothing
        // to scope to otherwise. Created here rather than as a separate step
        // so a fresh install cannot land in a stateless dead end.
        if (!returnTo) {
          const local = email.split('@')[0]!
          const slug = local.replace(/[^a-z0-9]/gi, '-').toLowerCase()
          const { error: organizationError } = await client.organization.create({
            name: t.workspaceNameTemplate.replace('{owner}', name || local),
            slug: `${slug}-${Date.now().toString(36)}`,
          })
          if (organizationError) {
            throw new Error(organizationError.message ?? 'Workspace creation failed')
          }
        }
      } else {
        const { error: signInError } = await client.signIn.email({ email, password })
        if (signInError) throw new Error(signInError.message ?? 'Sign-in failed')
      }

      router.replace(returnTo ?? '/')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    /* `<main>`, not a bare `<div>`. This is the first screen of the product and
       it had no landmark at all — no way to skip to content, and nothing for a
       screen reader to orient against, on the one page every user must pass
       through. */
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* `APP_NAME`, not a hardcoded string. Every other screen resolves the
            product name through it; this one would have kept saying "Claimfold"
            after a rebrand. */}
        <h1 className="mb-1 text-lg font-semibold">{APP_NAME}</h1>
        <p className="mb-6 text-sm text-subtle">
          {mode === 'sign-in'
            ? t.subtitle
            : returnTo
              ? t.invitedSignUpSubtitle
              : t.signUpSubtitle}
        </p>

        {/* `void` rather than passing the async function straight in: React
            never awaits the returned promise, so anything that escaped the
            try/catch would become an unhandled rejection and the person would
            watch a spinner instead of an error. */}
        <form
          onSubmit={(event) => {
            void submit(event)
          }}
          className="space-y-3"
        >
          {mode === 'sign-up' && (
            <Field
              label={t.name}
              value={name}
              onChange={setName}
              type="text"
              autoComplete="name"
            />
          )}
          <Field
            label={t.email}
            value={email}
            onChange={setEmail}
            type="email"
            autoComplete="email"
          />
          <Field
            label={t.password}
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            hint={mode === 'sign-up' ? t.passwordHint : undefined}
          />

          {/* `role="alert"`: a failed sign-in re-renders in place with no
              navigation, so without a live region the only feedback a screen
              reader gets is silence. */}
          {error && (
            <p role="alert" className="text-sm text-err">
              {error}
            </p>
          )}

          {/* No `disabled:opacity-50`: `.btn:disabled` already swaps to the
              sunken fill and the subtle foreground, and halving the opacity of
              that pair on top of it drops the label under the contrast floor
              the token file is tested against. One disabled treatment, defined
              once. */}
          <button type="submit" disabled={busy} className="btn w-full">
            {busy
              ? t.loading
              : mode === 'sign-in'
                ? t.submit
                : t.createAccount}
          </button>
        </form>

        {/* Explicitly `button`, and disabled while a request is in flight.
            Switching mode mid-submit leaves the resolving call answering for a
            screen that is no longer the one being shown — a sign-up error
            landing under a form that now says "Sign in". */}
        <button
          type="button"
          hidden={!canSignUp}
          disabled={busy || !canSignUp}
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
            setError(null)
          }}
          className="mt-4 text-xs text-subtle hover:text-muted disabled:cursor-not-allowed"
        >
          {mode === 'sign-in'
            ? `${t.noAccount} ${t.createOne}`
            : t.haveAccount}
        </button>
      </div>
    </main>
  )
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type: string
  autoComplete?: string
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        required
        className="field"
      />
      {hint && <span className="mt-1 block text-xs text-subtle">{hint}</span>}
    </label>
  )
}
