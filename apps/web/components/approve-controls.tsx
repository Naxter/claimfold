'use client'

import { useState } from 'react'

import { ActionButton } from './action-button.tsx'
import { ScheduleField } from './schedule-field.tsx'

/**
 * The schedule field and the Approve button, sharing one piece of state.
 *
 * They are together in a client component because the button's label depends on
 * whether the field is empty, and that difference matters more than it looks:
 * an empty field means "publish as soon as possible", so the same button either
 * queues a post for Thursday or puts it in front of a real audience, right now,
 * under the operator's own name — and approving also locks the post against
 * further editing.
 *
 * The button used to read "Approve" in both cases and the only thing
 * distinguishing them was a hint rendered `visually-hidden`. Saying which of
 * the two is about to happen, on the control that does it, is the cheapest
 * possible guard against the one action here that cannot be taken back.
 */
export function ApproveControls({
  showSchedule,
  disabled,
  title,
  labels,
}: {
  /** The gate passed and this member may edit; otherwise there is no choice to offer. */
  showSchedule: boolean
  disabled: boolean
  title?: string
  labels: {
    publishAt: string
    publishAtHint: string
    approveNow: string
    approveScheduled: string
    approving: string
  }
}) {
  const [scheduledAt, setScheduledAt] = useState('')
  const isImmediate = scheduledAt.trim() === ''

  return (
    <>
      {showSchedule && (
        <ScheduleField
          name="scheduledAt"
          label={labels.publishAt}
          hint={labels.publishAtHint}
          value={scheduledAt}
          onValueChange={setScheduledAt}
        />
      )}
      <ActionButton
        idle={isImmediate ? labels.approveNow : labels.approveScheduled}
        busy={labels.approving}
        // Not a soft warning: if the gate blocks, the control is unavailable. A
        // reviewer who wants to publish anyway must first resolve the specific
        // claim, which is recorded against them.
        disabled={disabled}
        {...(title ? { title } : {})}
        className="btn"
      />
    </>
  )
}
