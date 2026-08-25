'use client'

import { useState } from 'react'

import { savePostTextAction } from '../app/posts/[id]/actions.ts'
import type { Messages } from '../lib/i18n/messages/en.ts'
import { ActionButton } from './action-button.tsx'

/**
 * The post's own text: caption, hashtags, hook.
 *
 * Here because the gate blocks on two of them — `caption_too_long` and
 * `too_many_hashtags` — and until this existed those were dead ends in exactly
 * the way a missing alt text was: an error message pointing at a control that
 * did not exist.
 *
 * The character count is live and the limit is Instagram's, so it is a hard
 * ceiling rather than editorial advice. The feed truncates a caption after
 * roughly 125 characters, which is why the count matters long before 2,200 does.
 */
export function PostTextEditor({
  postId,
  caption,
  hashtags,
  hook,
  firstComment,
  maxCaption,
  labels,
}: {
  postId: string
  caption: string
  hashtags: string[]
  hook: string
  firstComment: string
  maxCaption: number
  /**
   * Plain strings only. `Messages` also holds functions like `captionCount`,
   * and a function cannot be handed to a client component — so the counter
   * below is bare numbers rather than a translated sentence, which is also what
   * the editor's budget counters do.
   */
  labels: Messages['review']['edit']
}) {
  const [text, setText] = useState(caption)

  return (
    <form action={savePostTextAction} className="space-y-[var(--sp-4)]">
      <input type="hidden" name="postId" value={postId} />

      <label className="block">
        <span className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted">{labels.caption}</span>
          <span className={`text-xs ${text.length > maxCaption ? 'text-err' : 'text-subtle'}`}>
            {text.length} / {maxCaption}
          </span>
        </span>
        <textarea
          name="caption"
          rows={6}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="field w-full"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{labels.hashtags}</span>
        <input
          name="hashtags"
          defaultValue={hashtags.join(' ')}
          className="field w-full"
        />
        <span className="mt-1 block text-xs text-subtle">{labels.hashtagsHint}</span>
      </label>

      {/* Posted as its own comment right after publishing. The publishing client
          has supported this from the start and no field ever filled it, so it
          always posted nothing. */}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{labels.firstComment}</span>
        <textarea
          name="firstComment"
          rows={2}
          defaultValue={firstComment}
          maxLength={2200}
          className="field w-full"
        />
        <span className="mt-1 block text-xs text-subtle">{labels.firstCommentHint}</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{labels.hook}</span>
        <input name="hook" defaultValue={hook} maxLength={300} className="field w-full" />
        <span className="mt-1 block text-xs text-subtle">{labels.hookHint}</span>
      </label>

      <ActionButton idle={labels.save} busy={labels.saving} className="btn" />
    </form>
  )
}
