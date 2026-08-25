'use client'

import { useRef, useState } from 'react'

/**
 * A value you have to paste into someone else's dashboard.
 *
 * Exists because the redirect URI must match what Meta has registered
 * *exactly* — a trailing slash or an http/https mismatch produces an error
 * message that blames the code rather than the mismatch. Retyping it by hand
 * is the most likely way to get this wrong, so the only offered action is
 * copying it.
 *
 * The failure path is not hypothetical. `navigator.clipboard` is only defined
 * on a secure context — https, or localhost — and this product is self-hosted,
 * so a good share of installs are reached over plain http at a LAN address or
 * a bare IP. There `navigator.clipboard` is `undefined` and the old code threw
 * a TypeError into a `void`ed promise: the button did nothing, silently, on the
 * one screen where the value cannot be retyped by hand.
 *
 * So: try the API, and when it is missing or refuses, select the text instead
 * and say what happened. Selecting is worth more than an error message, because
 * it turns "you cannot copy this" into "press Ctrl+C".
 */
export function CopyField({
  label,
  value,
  copyLabel,
  copiedLabel,
  manualHint,
}: {
  label: string
  value: string
  copyLabel: string
  copiedLabel: string
  manualHint: string
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const valueRef = useRef<HTMLElement>(null)

  /** Put the value under the user's cursor so the keyboard shortcut works. */
  const selectValue = () => {
    const node = valueRef.current
    const selection = window.getSelection()
    if (!node || !selection) return
    const range = document.createRange()
    range.selectNodeContents(node)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  const copy = () => {
    // Tested for rather than assumed: on a non-secure origin the whole
    // `clipboard` object is absent, so reaching straight for `writeText` is a
    // TypeError, not a rejection, and no `.catch` would ever see it.
    const clipboard = navigator.clipboard as Clipboard | undefined
    if (!clipboard) {
      selectValue()
      setState('manual')
      return
    }

    void clipboard.writeText(value).then(
      () => {
        setState('copied')
        setTimeout(() => setState('idle'), 2000)
      },
      () => {
        // Present and still refused — a permissions policy, or a document that
        // was not focused when the click was dispatched.
        selectValue()
        setState('manual')
      },
    )
  }

  return (
    <div className="rounded-md border border-rule bg-bg p-3">
      <span className="mb-1.5 block text-xs tracking-wide text-subtle uppercase">
        {label}
      </span>
      <div className="flex items-start gap-3">
        <code ref={valueRef} className="min-w-0 flex-1 text-xs break-all text-accent">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="btn btn-ghost shrink-0 hover:border-accent hover:text-accent"
        >
          {state === 'copied' ? copiedLabel : copyLabel}
        </button>
      </div>

      {/* `role="status"` so the explanation is announced. Someone who cannot
          see that the text became selected is exactly who needs telling. */}
      {state === 'manual' && (
        <p role="status" className="mt-2 text-xs leading-relaxed text-warn">
          {manualHint}
        </p>
      )}
    </div>
  )
}
