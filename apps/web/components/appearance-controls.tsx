'use client'

import { useState } from 'react'

import {
  DENSITIES,
  DENSITY_COOKIE,
  THEMES,
  THEME_COOKIE,
  type Density,
  type Theme,
} from '../lib/preferences.ts'
import type { Messages } from '../lib/i18n/messages/en.ts'

/** Only the appearance slice, which is plain strings and so can cross into
 *  the browser. The full catalogue contains functions and cannot. */
export type AppearanceLabels = Messages['appearance']

/**
 * Theme and row-height switches.
 *
 * Applied straight to `<html>` and written to a cookie in the same handler —
 * no server round trip, no re-render of the page behind it. These are toggles
 * a person flicks while looking at the thing they are changing, and a 300ms
 * round trip to repaint a colour would be felt every time.
 *
 * The server reads the same cookies on the next navigation, so the markup
 * arrives already correct and nothing flashes.
 */

const YEAR = 365 * 24 * 60 * 60

function persist(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`
}

export function AppearanceControls({
  theme,
  density,
  t,
}: {
  theme: Theme
  density: Density
  t: AppearanceLabels
}) {
  const [currentTheme, setTheme] = useState(theme)
  const [currentDensity, setDensity] = useState(density)

  function applyTheme(next: Theme) {
    setTheme(next)
    persist(THEME_COOKIE, next)
    const root = document.documentElement
    // `system` means "no opinion" — the attribute is removed so the
    // stylesheet's prefers-color-scheme block takes over again.
    if (next === 'system') root.removeAttribute('data-theme')
    else root.dataset['theme'] = next
  }

  function applyDensity(next: Density) {
    setDensity(next)
    persist(DENSITY_COOKIE, next)
    document.documentElement.dataset['density'] = next
  }

  const themeLabels: Record<Theme, string> = {
    system: t.themeSystem,
    light: t.themeLight,
    dark: t.themeDark,
  }

  const densityLabels: Record<Density, string> = {
    compact: t.densityCompact,
    comfortable: t.densityComfortable,
    spacious: t.densitySpacious,
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <fieldset>
        <legend className="label mb-4 block">{t.theme}</legend>
        <SegmentedControl
          name="theme"
          options={THEMES.map((value) => ({ value, label: themeLabels[value] }))}
          current={currentTheme}
          onSelect={applyTheme}
        />
      </fieldset>

      <fieldset>
        <legend className="label mb-4 block">{t.density}</legend>
        <SegmentedControl
          name="density"
          options={DENSITIES.map((value) => ({ value, label: densityLabels[value] }))}
          current={currentDensity}
          onSelect={applyDensity}
        />
        <p className="text-subtle mt-4 text-xs">{t.densityHelp}</p>
      </fieldset>
    </div>
  )
}

/**
 * Radio inputs under the hood, not buttons.
 *
 * A row of buttons where one is "on" is a radio group wearing a costume:
 * arrow keys would not move between them and a screen reader would not
 * announce which is selected. Real inputs, visually hidden, get both for free.
 */
function SegmentedControl<T extends string>({
  name,
  options,
  current,
  onSelect,
}: {
  name: string
  options: Array<{ value: T; label: string }>
  current: T
  onSelect: (value: T) => void
}) {
  return (
    <div className="border-rule bg-sunken inline-flex rounded-[var(--radius-1)] border p-[2px]">
      {options.map((option) => {
        const active = option.value === current
        return (
          <label
            key={option.value}
            className={`segmented-option inline-flex h-[var(--control-h)] cursor-pointer items-center rounded-[2px] px-[var(--sp-5)] text-sm transition-colors ${
              active
                ? 'bg-raised text-fg shadow-[0_1px_1px_oklch(0%_0_0/0.06)]'
                : 'text-muted hover:text-fg'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={active}
              onChange={() => onSelect(option.value)}
              className="visually-hidden"
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}
