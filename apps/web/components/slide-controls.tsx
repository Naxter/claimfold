import type { Messages } from '../lib/i18n/messages/en.ts'
import { ActionButton } from './action-button.tsx'
import { addSlideAction, deleteSlideAction, moveSlideAction } from '../app/posts/[id]/actions.ts'

/**
 * Rearranging the carousel.
 *
 * Plain server-rendered forms with no client state, because there is nothing to
 * preview: the result of moving a slide is the page redrawn in a different
 * order. Up and down rather than drag-and-drop is a deliberate first version —
 * it works on a phone, it works without JavaScript, and it cannot half-finish.
 *
 * Every form carries `slideCount`. If the carousel gained or lost a slide since
 * the page was drawn — another tab, another person — the position someone
 * clicked no longer means what they thought, so the server refuses rather than
 * moving the wrong slide. Cheap, and the alternative is silent.
 */

export function SlideStructureControls({
  postId,
  slideId,
  slideCount,
  isFirst,
  isLast,
  canDelete,
  labels,
}: {
  postId: string
  slideId: string
  slideCount: number
  isFirst: boolean
  isLast: boolean
  canDelete: boolean
  labels: Messages['review']['edit']
}) {
  return (
    // `gap-2` between the move pair and the destructive control, `gap-1` within
    // it. All three used to sit in one `gap-1` row at roughly 24×32px each, so
    // "delete this slide" was 4px from "move it down" — the two are not the same
    // kind of mistake to make by accident.
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {(['up', 'down'] as const).map((direction) => (
          <form key={direction} action={moveSlideAction}>
            <input type="hidden" name="postId" value={postId} />
            <input type="hidden" name="slideId" value={slideId} />
            <input type="hidden" name="slideCount" value={slideCount} />
            <input type="hidden" name="direction" value={direction} />
            <ActionButton
              idle={direction === 'up' ? '↑' : '↓'}
              busy="·"
              disabled={direction === 'up' ? isFirst : isLast}
              // The glyph is the content; the wording is the name. `title`
              // stays for the pointer tooltip, but it is not what a screen
              // reader announces.
              title={direction === 'up' ? labels.moveUp : labels.moveDown}
              ariaLabel={direction === 'up' ? labels.moveUp : labels.moveDown}
              className="btn btn-quiet px-2 py-1 text-xs"
            />
          </form>
        ))}
      </div>

      <form action={deleteSlideAction}>
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="slideId" value={slideId} />
        <input type="hidden" name="slideCount" value={slideCount} />
        <ActionButton
          idle="✕"
          busy="·"
          disabled={!canDelete}
          title={labels.remove}
          ariaLabel={labels.remove}
          className="btn btn-quiet px-2 py-1 text-xs hover:border-err hover:text-err"
        />
      </form>
    </div>
  )
}

/**
 * Add a slide after `afterIndex`.
 *
 * The role list comes from the post's format rather than being free text: a role
 * decides which layout renders the slide — hook, sources and cta bypass the
 * template entirely — so an invented one would silently fall through to the
 * editorial layout and read as a rendering bug.
 *
 * The new slide arrives empty, which means the gate immediately blocks approval
 * for missing alt text. That is the intended shape rather than an oversight:
 * the block is now something a person can act on.
 */
export function AddSlideForm({
  postId,
  afterIndex,
  slideCount,
  roles,
  labels,
}: {
  postId: string
  afterIndex: number
  slideCount: number
  roles: string[]
  labels: Messages['review']['edit']
}) {
  if (roles.length === 0) return null

  return (
    <form action={addSlideAction} className="flex flex-wrap items-end gap-[var(--sp-3)]">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="afterIndex" value={afterIndex} />
      <input type="hidden" name="slideCount" value={slideCount} />

      <label className="min-w-0">
        <span className="mb-1 block text-xs font-medium text-muted">{labels.addRole}</span>
        <select name="role" defaultValue={roles[0]} className="field">
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </label>

      <ActionButton
        idle={labels.add}
        busy={labels.saving}
        className="btn btn-ghost shrink-0"
      />
    </form>
  )
}
