'use client'

/**
 * A button label that does not resize when it changes.
 *
 * "Create" becoming "Creating…" is a wider string, so the button grows the
 * moment it is pressed and everything beside it jumps. That is a layout shift
 * caused entirely by a label, and it happens at the exact moment the person is
 * looking at the button to confirm the click registered.
 *
 * Both labels are stacked in one grid cell and the longer one is rendered
 * invisibly, so the box is always sized for the widest state. No magic
 * min-width to keep in sync with the copy — which matters here, because the
 * copy exists in four languages and German is reliably the long one.
 */
export function SteadyLabel({ idle, busy, showBusy }: { idle: string; busy: string; showBusy: boolean }) {
  const widest = busy.length >= idle.length ? busy : idle

  return (
    <span className="grid place-items-center">
      <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
        {widest}
      </span>
      <span className="col-start-1 row-start-1 whitespace-nowrap">{showBusy ? busy : idle}</span>
    </span>
  )
}
