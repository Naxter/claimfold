import type { Metadata } from 'next'

import { listMembers, listPendingInvitations } from '@claimfold/db'

import { ActionButton } from '../../components/action-button.tsx'
import { Shell } from '../../components/shell.tsx'
import { getLocale, getMessages } from '../../lib/i18n/index.ts'
import { can } from '../../lib/permissions.ts'
import { requireSession } from '../../lib/session.ts'
import { removeMemberAction, revokeInvitationAction, setRoleAction } from './actions.ts'
import { InviteForm } from './invite-form.tsx'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).members.title }
}

/** Roles a person can be given. `owner` is not offered — see the actions file. */
const ASSIGNABLE = ['admin', 'editor', 'viewer'] as const

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await requireSession()
  const { error } = await searchParams
  const t = await getMessages()
  const locale = await getLocale()

  const mayManage = can(session, 'publish')

  const [members, invitations] = await Promise.all([
    listMembers(session.orgId),
    mayManage ? listPendingInvitations(session.orgId) : Promise.resolve([]),
  ])

  return (
    <Shell session={session} title={t.members.title}>
      <p className="mb-[var(--sp-6)] max-w-prose text-sm text-subtle">{t.members.intro}</p>

      {error && (
        <div
          role="alert"
          className="mb-6 max-w-2xl rounded-[var(--radius-2)] border border-err bg-err-weak p-3 text-sm text-err"
        >
          {error}
        </div>
      )}

      <section className="mb-[var(--sp-8)] max-w-2xl">
        <h2 className="mb-[var(--sp-4)] text-xs font-medium tracking-wide text-subtle uppercase">
          {t.members.people}
        </h2>

        <ul className="space-y-[var(--sp-3)]">
          {members.map((person) => {
            const isSelf = person.userId === session.userId
            const isOwner = person.role === 'owner'

            return (
              <li
                key={person.userId}
                className="flex flex-wrap items-center gap-[var(--sp-4)] rounded-[var(--radius-2)] border border-rule bg-raised p-[var(--sp-4)]"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-sm text-fg">
                    {person.name}
                    {isSelf && <span className="ml-2 text-xs text-subtle">{t.members.you}</span>}
                  </p>
                  <p className="truncate text-xs text-subtle">{person.email}</p>
                </div>

                {/* An owner's row is deliberately inert: there is no
                    ownership-transfer flow, so demoting or removing the only
                    owner would leave a workspace nobody can administer. */}
                {!mayManage || isOwner || isSelf ? (
                  <span className="text-xs text-muted">{t.members.roles[person.role] ?? person.role}</span>
                ) : (
                  <>
                    <form action={setRoleAction} className="flex items-center gap-[var(--sp-3)]">
                      <input type="hidden" name="userId" value={person.userId} />
                      <label className="sr-only" htmlFor={`role-${person.userId}`}>
                        {t.members.role}
                      </label>
                      <select
                        id={`role-${person.userId}`}
                        name="role"
                        defaultValue={person.role}
                        className="field text-xs"
                      >
                        {ASSIGNABLE.map((role) => (
                          <option key={role} value={role}>
                            {t.members.roles[role]}
                          </option>
                        ))}
                      </select>
                      <ActionButton
                        idle={t.common.save}
                        busy={t.common.loading}
                        className="btn btn-quiet text-xs"
                      />
                    </form>

                    <form action={removeMemberAction}>
                      <input type="hidden" name="userId" value={person.userId} />
                      <ActionButton
                        idle={t.members.remove}
                        busy={t.members.removing}
                        className="btn btn-quiet text-xs hover:border-err hover:text-err"
                      />
                    </form>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {mayManage && (
        <>
          {invitations.length > 0 && (
            <section className="mb-[var(--sp-8)] max-w-2xl">
              <h2 className="mb-[var(--sp-4)] text-xs font-medium tracking-wide text-subtle uppercase">
                {t.members.pending}
              </h2>
              <ul className="space-y-[var(--sp-3)]">
                {invitations.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-[var(--sp-4)] rounded-[var(--radius-2)] border border-dashed border-rule p-[var(--sp-4)]"
                  >
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="truncate text-sm text-muted">{row.email}</p>
                      <p className="text-xs text-subtle">
                        {t.members.expires(row.expiresAt.toLocaleDateString(locale))}
                      </p>
                    </div>
                    <span className="text-xs text-muted">
                      {t.members.roles[row.role] ?? row.role}
                    </span>
                    <form action={revokeInvitationAction}>
                      <input type="hidden" name="token" value={row.id} />
                      <ActionButton
                        idle={t.members.revoke}
                        busy={t.members.revoking}
                        className="btn btn-quiet text-xs hover:border-err hover:text-err"
                      />
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="max-w-2xl">
            <h2 className="mb-[var(--sp-4)] text-xs font-medium tracking-wide text-subtle uppercase">
              {t.members.invite}
            </h2>
            {/* The link this produces comes back through the action's return
                value, not the URL — see the comment on `InviteFormState`. */}
            <InviteForm
              roles={ASSIGNABLE.map((role) => ({
                value: role,
                label: t.members.roles[role] ?? role,
              }))}
              labels={{
                email: t.members.email,
                role: t.members.role,
                createInvite: t.members.createInvite,
                creatingInvite: t.members.creatingInvite,
                inviteReady: t.members.inviteReady,
                inviteLink: t.members.inviteLink,
                inviteOnce: t.members.inviteOnce,
                inviteHint: t.members.inviteHint,
                copy: t.common.copy,
                copied: t.common.copied,
                copyManualHint: t.common.copyManualHint,
              }}
            />
          </section>
        </>
      )}
    </Shell>
  )
}
