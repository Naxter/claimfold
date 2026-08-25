'use client'

import { generateChannelAction } from '../app/niches/actions.ts'
import type { Messages } from '../lib/i18n/messages/en.ts'
import { ActionButton } from './action-button.tsx'

/**
 * The path `presets.ts` has described since the beginning.
 *
 * Its opening comment calls the presets "examples, not a menu" and names the
 * intended route as the channel generator or editing one in the interface.
 * Neither existed, which left three hardcoded starter packs as the only way to
 * have a channel at all.
 *
 * The result lands on the editor rather than going live. A generated channel
 * decides the confidence floor the publication gate enforces and the subjects the
 * channel will refuse — nobody should find out what those are by discovering what
 * got published.
 */
export function ChannelGenerator({
  languages,
  defaultLanguage,
  labels,
}: {
  languages: Array<{ value: string; label: string }>
  defaultLanguage: string
  labels: Messages['channels']['generator']
}) {
  return (
    <form
      action={generateChannelAction}
      className="mb-[var(--sp-6)] max-w-2xl rounded-[var(--radius-2)] border border-rule bg-raised p-[var(--sp-5)]"
    >
      <h2 className="mb-1 text-sm font-semibold">{labels.heading}</h2>
      <p className="mb-[var(--sp-4)] text-xs leading-relaxed text-subtle">{labels.hint}</p>

      <textarea
        name="description"
        rows={3}
        required
        minLength={12}
        maxLength={600}
        placeholder={labels.placeholder}
        className="field mb-[var(--sp-4)] w-full"
      />

      <div className="flex flex-wrap items-end gap-[var(--sp-4)]">
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-medium text-muted">{labels.language}</span>
          <select name="language" defaultValue={defaultLanguage} className="field">
            {languages.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
        </label>

        <ActionButton idle={labels.submit} busy={labels.working} className="btn shrink-0" />
      </div>

      <p className="mt-[var(--sp-4)] text-xs leading-relaxed text-subtle">{labels.cost}</p>
    </form>
  )
}
