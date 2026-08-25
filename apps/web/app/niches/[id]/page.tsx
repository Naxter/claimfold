import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getNiche, listAccounts, soleConnectedAccountId } from '@claimfold/db'
import { BUILT_IN_FORMATS } from '@claimfold/niches'
import { DEFAULT_THEME_ID } from '@claimfold/templates'

import { ChannelForm } from '../../../components/channel-form.tsx'
import { Shell } from '../../../components/shell.tsx'
import { channelFormDefaults } from '../../../lib/channel-form.ts'
import { getMessages } from '../../../lib/i18n/index.ts'
import { requireSession } from '../../../lib/session.ts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).channels.editTitle }
}

/**
 * Editing one channel, or creating the first one from blank.
 *
 * `/niches/new` is the same page with starting values instead of a row, which
 * keeps one form rather than two that drift. The blank defaults are deliberately
 * cautious: sources required, every layout available, and the confidence floor at
 * the schema's own minimum plus a margin — a channel someone creates and forgets
 * to tune should be strict, not permissive.
 */
export default async function ChannelEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ generated?: string }>
}) {
  const session = await requireSession()
  const { id } = await params
  const { generated } = await searchParams
  const t = await getMessages()

  const accounts = await listAccounts(session.orgId)
  const isNew = id === 'new'
  const row = isNew ? null : await getNiche(session.orgId, id)
  if (!isNew && !row) notFound()

  const defaults = row
    ? channelFormDefaults(row)
    : {
        slug: '',
        name: '',
        description: '',
        language: 'en',
        audience: '',
        voice: '',
        topicSeeds: '',
        formatIds: BUILT_IN_FORMATS.map((format) => format.id),
        promptIdeate: '',
        promptWrite: '',
        hashtagSets: '',
        themeId: DEFAULT_THEME_ID,
        requireSources: true,
        publicInterest: false,
        requireAdLabel: true,
        minConfidence: 0.75,
        forbiddenTopics: '',
        postsPerWeek: 4,
        preferredTimes: '18:30 12:00',
        timezone: 'Europe/Berlin',
        watermark: '',
        accentColor: '',
        /*
          Pre-chosen only when there is exactly one connected account, so a
          single-account workspace is never asked a question with one answer.
          With several, guessing would be the thing the publish worker refuses
          to do.
        */
        igAccountId: (await soleConnectedAccountId(session.orgId)) ?? '',
        isDefault: false,
      }

  return (
    <Shell session={session} title={isNew ? t.channels.createTitle : t.channels.editTitle}>
      <Link href="/niches" className="mb-4 inline-block text-xs text-subtle hover:text-muted">
        ← {t.niches.title}
      </Link>

      {/* Drafted by the model and not yet used for anything. Worth saying out
          loud, because the rules on this page decide what the gate enforces. */}
      {generated && (
        <div className="mb-6 max-w-3xl rounded-[var(--radius-2)] border border-rule bg-sunken p-[var(--sp-4)] text-sm text-muted">
          {t.channels.generatedBanner}
        </div>
      )}

      <ChannelForm
        {...(row ? { nicheId: row.id } : {})}
        defaults={defaults}
        accounts={accounts}
        labels={t.channels.form}
        cancelHref="/niches"
      />
    </Shell>
  )
}
