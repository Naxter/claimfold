'use client'

import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { SteadyLabel } from '../../components/steady-label.tsx'

/**
 * Plain strings only.
 *
 * The message catalogue holds functions for anything that interpolates, and a
 * function cannot be serialised across the server/client boundary — React
 * throws at render time rather than at compile time. The two that interpolate
 * here (the slide-count hint and the per-channel layout count) are resolved on
 * the server, where their arguments already are.
 */
export interface GenerateLabels {
  niche: string
  nicheHelp: string
  topic: string
  topicPlaceholder: string
  topicFromDiscovery: string
  slides: string
  slidesPlaceholder: string
  slidesHelp: string
  submit: string
  working: string
  cost: string
  stages: readonly string[]
  gateNote: string
  misconfigured: string
  optional: string
}

/**
 * The generation form.
 *
 * A client component only because of `useFormStatus`. The run takes about a
 * minute — long enough that a button which merely greys out reads as a hang —
 * so the pending state names the stages and says what it is spending. Silence
 * during a paid, minute-long operation is how people end up clicking twice.
 *
 * Strings arrive as props rather than being read here: this runs in the
 * browser, and shipping four dictionaries to resolve one language would be
 * paying for three of them every page load.
 */

export interface NicheOption {
  id: string
  name: string
  language: string
  /** Already-formatted, e.g. "5 layouts" — the plural rule lives server-side. */
  formatsLabel: string
  isDefault: boolean
  /** Present when the stored configuration does not validate. */
  problem?: string
}

export function GenerateForm({
  niches,
  action,
  maxSlides,
  t,
  defaultNicheId,
  defaultTopic,
  topicId,
}: {
  niches: NicheOption[]
  action: (formData: FormData) => Promise<void>
  maxSlides: number
  t: GenerateLabels
  /** Preselected when arriving from a discovered topic. */
  defaultNicheId?: string
  defaultTopic?: string
  /** Set when the topic came from discovery, so it can be marked used. */
  topicId?: string
}) {
  const usable = niches.filter((n) => !n.problem)
  const preselected =
    defaultNicheId && usable.some((n) => n.id === defaultNicheId) ? defaultNicheId : undefined

  return (
    <form action={action} className="max-w-xl space-y-5">
      {topicId && <input type="hidden" name="topicId" value={topicId} />}

      <fieldset className="space-y-2">
        <label
          htmlFor="nicheId"
          className="block text-xs font-medium tracking-wide text-subtle uppercase"
        >
          {t.niche}
        </label>
        <select
          id="nicheId"
          name="nicheId"
          required
          defaultValue={preselected ?? usable.find((n) => n.isDefault)?.id ?? usable[0]?.id ?? ''}
          className="field"
        >
          {niches.map((niche) => (
            <option key={niche.id} value={niche.id} disabled={Boolean(niche.problem)}>
              {niche.name} · {niche.language}
              {niche.problem
                ? ` — ${t.misconfigured}`
                : ` · ${niche.formatsLabel}`}
            </option>
          ))}
        </select>
        <p className="text-xs text-subtle">{t.nicheHelp}</p>
      </fieldset>

      <fieldset className="space-y-2">
        <label
          htmlFor="topic"
          className="block text-xs font-medium tracking-wide text-subtle uppercase"
        >
          {t.topic} <span className="normal-case">({t.optional})</span>
        </label>
        <input
          id="topic"
          name="topic"
          maxLength={300}
          defaultValue={defaultTopic ?? ''}
          placeholder={t.topicPlaceholder}
          className="field"
        />
        {topicId && <p className="text-xs text-subtle">{t.topicFromDiscovery}</p>}
      </fieldset>

      <fieldset className="space-y-2">
        <label
          htmlFor="slideCount"
          className="block text-xs font-medium tracking-wide text-subtle uppercase"
        >
          {t.slides} <span className="normal-case">({t.optional})</span>
        </label>
        <input
          id="slideCount"
          name="slideCount"
          type="number"
          min={2}
          max={maxSlides}
          placeholder={t.slidesPlaceholder}
          // Wide enough for the placeholder. At w-32 it read "Let the format".
          className="field w-56"
        />
        <p className="text-xs text-subtle">{t.slidesHelp}</p>
      </fieldset>

      <SubmitButton disabled={usable.length === 0} t={t} />
    </form>
  )
}

/** `m:ss`, so a minute-long wait reads as a minute rather than as 63 seconds. */
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Seconds since this mounted.
 *
 * Its own component, rendered only while the action is in flight, so the count
 * resets by unmounting rather than by a `setElapsed(0)` in an effect body — a
 * cascading render, and what `react-hooks/set-state-in-effect` is there to
 * catch. Mounting is the reset.
 */
function ElapsedTimer() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setElapsed((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <p className="mb-3 font-mono text-sm text-fg" aria-live="off">
      {formatElapsed(elapsed)}
    </p>
  )
}

function SubmitButton({ disabled, t }: { disabled: boolean; t: GenerateLabels }) {
  const { pending } = useFormStatus()

  return (
    <div className="space-y-3 pt-1">
      <button
        type="submit"
        disabled={disabled || pending}
        className="btn"
      >
        <SteadyLabel idle={t.submit} busy={t.working} showBusy={pending} />
      </button>

      {pending && (
        <div role="status" className="rounded-lg border border-rule bg-raised p-4">
          <p className="mb-3 text-sm text-muted">{t.cost}</p>

          {/* An elapsed counter, which is true, next to a list of what the run
              does — which is also true.

              The list used to stand alone with no marker for the current stage,
              so it read as progress while showing none: four bullets that never
              changed for a minute. Nothing here can know the real stage, because
              the pipeline runs inside one server action with no channel back.
              Rather than imply knowledge we do not have, the only moving number
              on screen is the one we can actually measure. */}
          <ElapsedTimer />

          <ol className="space-y-1.5 text-xs text-subtle">
            {t.stages.map((stage) => (
              <li key={stage} className="flex items-center gap-2">
                <span className="inline-block h-1 w-1 rounded-full bg-rule-strong" />
                {stage}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-subtle">{t.gateNote}</p>
        </div>
      )}
    </div>
  )
}
