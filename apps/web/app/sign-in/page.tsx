import type { Metadata } from 'next'

import { isInvitationPending } from '@claimfold/db'

import { signupAllowed } from '../../lib/auth.ts'
import { getMessages } from '../../lib/i18n/index.ts'
import { invitationReturnTo, invitationTokenFromReturnTo } from '../../lib/return-to.ts'
import { SignInForm } from './sign-in-form.tsx'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).signIn.title }
}

/**
 * A thin server shell around the sign-in form.
 *
 * The form itself has to run in the browser — it holds field state and calls
 * the auth client — but the language is resolved here, before anything is
 * sent. That keeps one dictionary in the payload instead of four, and means
 * the very first screen of the product is already in the right language.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>
}) {
  const t = await getMessages()
  const returnTo = invitationReturnTo((await searchParams).returnTo)
  // Courtesy, not the control — `databaseHooks` in lib/auth.ts is what refuses.
  // Offering a link to a door that is locked is its own small dishonesty.
  const canSignUp =
    (await signupAllowed()) ||
    (returnTo !== null && (await isInvitationPending(invitationTokenFromReturnTo(returnTo))))

  return (
    <SignInForm
      canSignUp={canSignUp}
      t={{
        title: t.signIn.title,
        subtitle: t.signIn.subtitle,
        signUpSubtitle: t.signIn.signUpSubtitle,
        invitedSignUpSubtitle: t.signIn.invitedSignUpSubtitle,
        name: t.signIn.name,
        email: t.signIn.email,
        password: t.signIn.password,
        passwordHint: t.signIn.passwordHint,
        submit: t.signIn.submit,
        createAccount: t.signIn.createAccount,
        noAccount: t.signIn.noAccount,
        createOne: t.signIn.createOne,
        haveAccount: t.signIn.haveAccount,
        loading: t.common.loading,
        workspaceNameTemplate: t.signIn.workspaceNameTemplate,
      }}
      returnTo={returnTo ?? undefined}
    />
  )
}
