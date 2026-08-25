'use client'

import { useFormStatus } from 'react-dom'

import { SteadyLabel } from '../../components/steady-label.tsx'

import type { Messages } from '../../lib/i18n/messages/en.ts'

/** Plain strings only: the full catalogue contains functions, which cannot be
 *  serialised across the server/client boundary. */
export type DiscoverLabels = Pick<
  Messages['topics'],
  'niche' | 'discover' | 'working' | 'waitTitle' | 'waitBody' | 'waitCached'
>

/**
 * Starting a discovery run.
 *
 * A client component only for `useFormStatus`. Same reasoning as the create
 * form: the run takes minutes, and a button that greys out silently for that
 * long reads as broken and gets clicked again. Here the wait has a cause worth
 * stating — the rate limit is self-imposed, so the honest thing is to say the
 * slowness is deliberate rather than let it look like a hang.
 */

export interface NicheChoice {
  id: string
  name: string
  language: string
}

export function DiscoverForm({
  niches,
  selectedId,
  action,
  t,
}: {
  niches: NicheChoice[]
  selectedId: string
  action: (formData: FormData) => Promise<void>
  t: DiscoverLabels
}) {
  return (
    <form action={action} className="max-w-2xl">
      {/* The row holds only the two controls. The waiting note used to live
          inside this flex item, and its own 36rem measure became the item's
          basis — pushing the row past the form's width and wrapping the select
          onto a line of its own the moment the button was pressed. A note about
          waiting has no business changing the layout it is explaining. */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-xs font-medium tracking-wide text-subtle uppercase">
            {t.niche}
          </span>
          <select
            name="nicheId"
            defaultValue={selectedId}
            className="field"
          >
            {niches.map((niche) => (
              <option key={niche.id} value={niche.id}>
                {niche.name} · {niche.language}
              </option>
            ))}
          </select>
        </label>

        <SubmitButton t={t} />
      </div>

      <WaitingNote t={t} />
    </form>
  )
}

function SubmitButton({ t }: { t: DiscoverLabels }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="btn shrink-0"
    >
      <SteadyLabel idle={t.discover} busy={t.working} showBusy={pending} />
    </button>
  )
}

/**
 * Sibling of the row rather than a child of it, so appearing costs nothing but
 * height. `useFormStatus` still works because it reads the enclosing `<form>`,
 * which this is inside — it is the flex row it needed to get out of.
 */
function WaitingNote({ t }: { t: DiscoverLabels }) {
  const { pending } = useFormStatus()
  if (!pending) return null

  return (
    <div
      role="status"
      className="mt-3 max-w-xl rounded-lg border border-rule bg-raised p-4 text-xs leading-relaxed text-subtle"
    >
      <p className="mb-2 text-sm text-muted">{t.waitTitle}</p>
      <p>{t.waitBody}</p>
      <p className="mt-2">{t.waitCached}</p>
    </div>
  )
}
