'use client'

import { useFormStatus } from 'react-dom'

import { SteadyLabel } from './steady-label.tsx'

/**
 * A submit button that admits it is working.
 *
 * Server actions on this dashboard take a round trip and sometimes a database
 * write; approving a post also re-runs the gate. Without a pending state the
 * button looks untouched for that whole time, which reads as "the click did not
 * land" and gets clicked again — on the three controls where a second click is
 * least welcome: approve, stop, and override.
 *
 * `useFormStatus` only reports the status of the *enclosing* form, and only
 * from a child component, which is why this is its own client component rather
 * than a prop on the page. Disabling while pending is the useful half: it makes
 * the double-click impossible rather than merely discouraged.
 *
 * `aria-busy` because the visual change is a label swap, and a screen reader
 * following focus on the button would otherwise get no signal at all.
 */
export function ActionButton({
  idle,
  busy,
  className,
  disabled = false,
  title,
  ariaLabel,
}: {
  idle: string
  busy: string
  className: string
  disabled?: boolean
  title?: string
  /**
   * The button's name, when `idle` is a glyph rather than a word.
   *
   * The slide controls used `↑`, `↓` and `✕` as their content with the real
   * wording only in `title` — so the accessible name resolved to the arrow
   * character, and `title` is not reliably announced. A button called "↑" is a
   * button nobody can find by voice or by screen reader.
   */
  ariaLabel?: string
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      title={title}
      aria-label={ariaLabel}
      className={className}
    >
      <SteadyLabel idle={idle} busy={busy} showBusy={pending} />
    </button>
  )
}
