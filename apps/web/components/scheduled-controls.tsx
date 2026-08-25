'use client'

import { useState } from 'react'

import { ActionButton } from './action-button.tsx'
import { ScheduleField } from './schedule-field.tsx'

/**
 * What a reviewer can still do after approving.
 *
 * Before this, nothing. Approving wrote `scheduled`, `isEditable` locks that
 * status, and the product offered no cancel, no unschedule and no reschedule
 * anywhere — so the only remaining move was to wait for the post to publish.
 * With an Approve button whose default is "publish immediately", the most
 * likely reason to want this is realising a second later that the time was
 * wrong.
 *
 * Two separate decisions, deliberately not one control:
 *
 *  - **Reschedule** keeps the approval. "Yes, but at seven" is not a review
 *    decision, and making someone re-approve — re-reading the gate, re-signing
 *    it off — to change a timestamp is how you train people to approve without
 *    reading.
 *  - **Take off the schedule** returns the post to review. "Not this, not yet"
 *    IS a review decision, so it goes back to where review decisions are made.
 *
 * The unschedule button is a client component only so the confirmation can be
 * inline. A destructive-ish action that is one click from "publish now" wants a
 * beat of friction, and a `window.confirm` is not a beat — it is a reflex.
 */
export function ScheduledControls({
  postId,
  unschedule,
  reschedule,
  labels,
}: {
  postId: string
  unschedule: (formData: FormData) => Promise<void>
  reschedule: (formData: FormData) => Promise<void>
  labels: {
    scheduledFor: string
    newTime: string
    reschedule: string
    rescheduling: string
    unschedule: string
    unscheduling: string
    unscheduleHint: string
  }
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="flex w-full flex-col gap-[var(--sp-4)] rounded-[var(--radius-2)] border border-rule bg-raised p-[var(--sp-5)]">
      <p className="text-xs text-muted">{labels.scheduledFor}</p>

      <div className="flex flex-wrap items-end gap-[var(--sp-5)]">
        <form action={reschedule} className="flex flex-wrap items-end gap-[var(--sp-4)]">
          <input type="hidden" name="postId" value={postId} />
          <ScheduleField name="scheduledAt" label={labels.newTime} hint={labels.unscheduleHint} />
          <ActionButton
            idle={labels.reschedule}
            busy={labels.rescheduling}
            className="btn btn-ghost"
          />
        </form>

        {confirming ? (
          <form action={unschedule} className="flex items-end gap-[var(--sp-3)]">
            <input type="hidden" name="postId" value={postId} />
            <ActionButton
              idle={labels.unschedule}
              busy={labels.unscheduling}
              className="btn btn-ghost hover:border-err hover:text-err"
            />
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn btn-quiet"
            >
              ✕
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="btn btn-quiet">
            {labels.unschedule}
          </button>
        )}
      </div>
    </div>
  )
}
