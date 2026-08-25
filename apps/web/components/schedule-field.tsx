'use client'

import { useState } from 'react'

/**
 * When a post should go out.
 *
 * A client component for one reason, and it is not interactivity: timezones.
 * `<input type="datetime-local">` submits a bare wall clock — `2026-07-26T18:00`
 * with no offset — and `new Date()` on the server reads that in the *server's*
 * zone. On a self-hosted product the server is a €4 box in whatever region was
 * cheapest, and a German reviewer asking for 18:00 would get 20:00. So the
 * browser, which is the only party that knows what the reviewer meant, converts
 * to an instant and that is what gets submitted.
 *
 * Empty means "as soon as possible" rather than being an error. That is the
 * common case — most posts are approved to go out now — so it is the default
 * state, and the hint says what empty does rather than leaving it to be
 * discovered.
 */
export function ScheduleField({
  label,
  hint,
  name,
  value,
  onValueChange,
}: {
  label: string
  hint: string
  name: string
  /**
   * Optional controlled value.
   *
   * Uncontrolled by default, because most callers only need the hidden instant
   * this produces. `ApproveControls` supplies these because the Approve button
   * beside it has to say something different depending on whether this is
   * empty, and "publish now" versus "schedule" is not a difference the reviewer
   * should have to infer.
   */
  value?: string
  onValueChange?: (next: string) => void
}) {
  const [internal, setInternal] = useState('')

  const local = value ?? internal
  const setLocal = (next: string) => {
    if (onValueChange) onValueChange(next)
    else setInternal(next)
  }

  /*
    Validity is checked before converting, because `toISOString()` on an
    Invalid Date throws a RangeError — and this runs during render, so the
    throw would take out the whole review page rather than producing a bad
    field. Browsers disagree about what `value` holds for a half-typed
    datetime, which is exactly the input this must not crash on.
  */
  const parsed = local ? new Date(local) : null
  const instant = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : ''

  return (
    <label className="min-w-0">
      <span className="label mb-[var(--sp-2)] block">{label}</span>
      <input
        type="datetime-local"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        title={hint}
        aria-describedby={`${name}-hint`}
        className="field w-52"
      />
      {/*
        Visible, not `visually-hidden`.

        This sentence says that leaving the field empty publishes immediately —
        and empty is the field's default state, sitting next to the Approve
        button, on the least reversible control in the product. It was readable
        only by a screen reader and by hovering for the tooltip, so the default
        behaviour of "publish now, to a real audience, under your own name" was
        documented to everyone except the person about to click.

        It is already wired up with `aria-describedby`, so showing it costs
        nothing and duplicates nothing.
      */}
      <span id={`${name}-hint`} className="mt-[var(--sp-1)] block text-xs text-subtle">
        {hint}
      </span>
      {/* The instant. Parsing the local string in the browser resolves it
          against the reviewer's own zone, which is the whole point. */}
      <input type="hidden" name={name} value={instant} />
    </label>
  )
}
