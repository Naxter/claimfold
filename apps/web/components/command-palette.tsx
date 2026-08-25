'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { Messages } from '../lib/i18n/messages/en.ts'

/**
 * Jump anywhere with the keyboard.
 *
 * Once a tool has more than a handful of screens, typing three letters beats
 * moving a hand to a mouse and clicking down a hierarchy — which is why every
 * product this one is modelled on ships one. The convention is Cmd-K on macOS
 * and Ctrl-K elsewhere, and matching it exactly is the point: a shortcut
 * nobody guesses is a shortcut nobody uses.
 *
 * Built on the native `<dialog>` element rather than a div with a high
 * z-index. That is not laziness — it hands us the focus trap, the Escape
 * handler, the inert background and the top-layer stacking for free, and all
 * four are things hand-rolled modals routinely get wrong.
 */

/** The platform does not change while the page is open, so there is nothing to subscribe to. */
const subscribeNever = () => () => {}

const optionId = (index: number) => `palette-option-${index}`

const serverSnapshot = () => '⌘K'

const macSnapshot = () => {
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    ''
  return /mac|iphone|ipad/i.test(platform) ? '⌘K' : 'Ctrl K'
}

export interface PaletteItem {
  href: string
  label: string
  group: string
}

export function CommandPalette({
  items,
  t,
}: {
  items: PaletteItem[]
  t: Messages['palette']
}) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  /**
   * The hint has to match the key that actually works.
   *
   * Showing ⌘K to someone on Windows is worse than showing nothing — they try
   * it, nothing happens, and they conclude the feature is broken.
   *
   * `useSyncExternalStore` rather than an effect, because this is precisely
   * what it is for: a value the server cannot know and the client can, with a
   * declared server snapshot so hydration never mismatches. The subscribe
   * function is a no-op — the platform does not change mid-session.
   */
  const shortcut = useSyncExternalStore(subscribeNever, macSnapshot, serverSnapshot)

  const matches = items.filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase()),
  )

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // metaKey on macOS, ctrlKey everywhere else. Checking both rather than
      // sniffing the platform: a Mac keyboard on Windows should still work.
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        const node = dialog.current
        if (!node) return
        if (node.open) node.close()
        else node.showModal()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function open() {
    dialog.current?.showModal()
  }

  function go(href: string) {
    dialog.current?.close()
    router.push(href)
  }

  function onListKey(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((c) => Math.min(c + 1, matches.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const target = matches[cursor]
      if (target) go(target.href)
    }
  }

  return (
    <>
      <button type="button" onClick={open} className="btn btn-ghost gap-[var(--sp-4)]">
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          className="h-4 w-4"
        >
          <circle cx="7" cy="7" r="4.25" />
          <line x1="10.2" y1="10.2" x2="13.5" y2="13.5" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">{t.open}</span>
        {/* The shortcut is shown, not hidden in documentation nobody reads. */}
        <kbd className="border-rule bg-sunken text-subtle hidden rounded-[var(--radius-1)] border px-[var(--sp-3)] py-[1px] font-mono text-xs whitespace-nowrap md:inline">
          {shortcut}
        </kbd>
      </button>

      <dialog
        ref={dialog}
        onClose={() => {
          setQuery('')
          setCursor(0)
        }}
        className="bg-raised border-rule text-fg m-0 w-[min(34rem,calc(100vw-2rem))] rounded-[var(--radius-2)] border p-0 shadow-[var(--shadow-pop)] backdrop:bg-black/40"
        style={{ marginInline: 'auto', marginBlockStart: '12vh' }}
      >
        <div className="border-rule border-b p-[var(--sp-5)]">
          <input
            ref={input}
            value={query}
            autoFocus
            onChange={(event) => {
              setQuery(event.target.value)
              setCursor(0)
            }}
            onKeyDown={onListKey}
            placeholder={t.placeholder}
            aria-label={t.placeholder}
            /* Combobox semantics, so the arrow keys mean something to a screen
               reader. Without aria-activedescendant the highlight below is a
               purely visual effect: sighted users see the selection move and
               everyone else hears silence. */
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls="palette-options"
            aria-autocomplete="list"
            {...(matches[cursor] ? { 'aria-activedescendant': optionId(cursor) } : {})}
            /* No `focus:outline-none` here. It was removing the only focus
               indicator this input had — `border-0` already strips the border,
               so suppressing the ring left nothing at all. The shared rule in
               globals.css says the ring is never removed without a
               replacement, and there was no replacement. */
            className="field border-0 bg-transparent px-0 text-lg"
          />
        </div>

        {matches.length === 0 ? (
          <p className="text-subtle p-[var(--sp-6)] text-sm">{t.noResults}</p>
        ) : (
          <ul
            id="palette-options"
            role="listbox"
            aria-label={t.placeholder}
            className="max-h-[50vh] overflow-y-auto p-[var(--sp-3)]"
          >
            {matches.map((item, index) => (
              <li key={item.href} role="presentation">
                <button
                  type="button"
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === cursor}
                  tabIndex={-1}
                  onClick={() => go(item.href)}
                  onMouseEnter={() => setCursor(index)}
                  className={`flex w-full items-center gap-[var(--sp-5)] rounded-[var(--radius-1)] px-[var(--sp-5)] py-[var(--sp-4)] text-left text-sm ${
                    index === cursor ? 'bg-selected text-fg' : 'text-muted'
                  }`}
                >
                  <span className="text-subtle text-xs">{item.group}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="border-rule text-subtle border-t px-[var(--sp-5)] py-[var(--sp-3)] text-xs">
          {t.hint}
        </p>
      </dialog>
    </>
  )
}
