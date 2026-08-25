'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'

import { BUILT_IN_FORMATS } from '@claimfold/niches'
import { THEMES } from '@claimfold/templates'

import { saveChannelAction } from '../app/niches/actions.ts'
import {
  EMPTY_CHANNEL_STATE,
  type ChannelFormDefaults,
  type ChannelFormState,
} from '../lib/channel-form.ts'
import type { Messages } from '../lib/i18n/messages/en.ts'
import { ActionButton } from './action-button.tsx'

/**
 * The whole channel, on one form.
 *
 * Long on purpose. A channel is the entire editorial configuration — who it is
 * for, how it sounds, what it will and will not cover, and how sure a claim has
 * to be before it can be published — and splitting that across a wizard would
 * hide the fact that these settings only make sense together. The fact-check bar
 * and the voice belong on the same screen because changing one usually means
 * changing the other.
 *
 * Errors come back through `useActionState` rather than a redirect, unlike every
 * other form in this dashboard. With twenty fields, a redirect carrying a message
 * in the query string would also throw away everything typed — and the people
 * most likely to hit a validation error are the ones who wrote the most.
 *
 * Every field is CONTROLLED, and that is not a style choice. React 19 resets a
 * form once its action completes, including when the action came back with
 * errors, so uncontrolled fields snap back to their stored values and the person
 * loses the edit that was refused. Holding the values in state is what actually
 * makes "your work survives a refusal" true — the first version of this file
 * claimed it with `defaultValue` and was wrong, which only showed up on a real
 * keystroke.
 */

type FormLabels = Messages['channels']['form']

export function ChannelForm({
  nicheId,
  defaults,
  accounts,
  labels,
  cancelHref,
}: {
  /** Empty for a new channel. */
  nicheId?: string
  defaults: ChannelFormDefaults
  /**
   * Connected accounts to choose between.
   *
   * Includes accounts that are not healthy, deliberately: hiding a broken one
   * would leave somebody unable to see why publishing stopped.
   */
  accounts: Array<{ id: string; username: string; status: string }>
  labels: FormLabels
  cancelHref: string
}) {
  const [state, action] = useActionState<ChannelFormState, FormData>(
    saveChannelAction,
    EMPTY_CHANNEL_STATE,
  )

  const [values, setValues] = useState(defaults)

  function set<K extends keyof typeof defaults>(key: K, value: (typeof defaults)[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  /** Toggle one layout in or out of the chosen set. */
  const toggleFormat = (id: string, on: boolean) =>
    set(
      'formatIds',
      on ? [...values.formatIds, id] : values.formatIds.filter((chosen) => chosen !== id),
    )

  /** The message for one field, if the last save refused it. */
  const errorFor = (path: string): string | undefined =>
    state.errors.find((error) => error.path === path || error.path.startsWith(`${path}.`))?.message

  return (
    <form action={action} className="grid max-w-3xl gap-[var(--sp-6)]">
      {nicheId ? <input type="hidden" name="nicheId" value={nicheId} /> : null}

      {(state.errors.length > 0 || state.message) && (
        <div
          className="rounded-[var(--radius-2)] border border-err bg-err-weak p-[var(--sp-4)] text-sm text-err"
          role="alert"
        >
          <p className="mb-1 font-medium">{state.message ?? labels.problems}</p>
          {state.errors.length > 0 && (
            <ul className="list-inside list-disc space-y-0.5">
              {state.errors.map((error, index) => (
                <li key={index}>{error.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Section title={labels.identityHeading}>
        <Field label={labels.name} error={errorFor('name')}>
          <input name="name" value={values.name}
            onChange={(event) => set('name', event.target.value)} required className="field w-full" />
        </Field>

        <Field label={labels.slug} hint={labels.slugHint} error={errorFor('slug')}>
          <input
            name="slug"
            value={values.slug}
            onChange={(event) => set('slug', event.target.value)}
            required
            pattern="[a-z0-9-]+"
            className="field w-full"
          />
        </Field>

        <Field label={labels.description} hint={labels.descriptionHint}>
          <textarea
            name="description"
            rows={2}
            value={values.description}
            onChange={(event) => set('description', event.target.value)}
            className="field w-full"
          />
        </Field>

        <Field label={labels.language} hint={labels.languageHint} error={errorFor('language')}>
          <input
            name="language"
            value={values.language}
            onChange={(event) => set('language', event.target.value)}
            required
            className="field w-full sm:w-40"
          />
        </Field>

        {/* Which account this channel publishes to. Here rather than on each
            post, because a channel already owns the handle and the schedule —
            see docs/decisions/0004-which-account-a-post-goes-to.md. */}
        <Field
          label={labels.account}
          hint={accounts.length === 0 ? labels.accountNoneAvailable : labels.accountHint}
          error={errorFor('igAccountId')}
        >
          <select
            name="igAccountId"
            value={values.igAccountId}
            onChange={(event) => set('igAccountId', event.target.value)}
            disabled={accounts.length === 0}
            className="field w-full sm:w-72"
          >
            <option value="">{labels.accountNone}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                @{account.username}
                {account.status === 'connected' ? '' : ` — ${account.status}`}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title={labels.voiceHeading}>
        <Field label={labels.audience} hint={labels.audienceHint} error={errorFor('audience')}>
          <textarea
            name="audience"
            rows={3}
            value={values.audience}
            onChange={(event) => set('audience', event.target.value)}
            required
            className="field w-full"
          />
        </Field>

        <Field label={labels.voice} hint={labels.voiceHint} error={errorFor('voice')}>
          <textarea
            name="voice"
            rows={3}
            value={values.voice}
            onChange={(event) => set('voice', event.target.value)}
            required
            className="field w-full"
          />
        </Field>
      </Section>

      <Section title={labels.whatHeading}>
        <Field label={labels.topicSeeds} hint={labels.topicSeedsHint} error={errorFor('topicSeeds')}>
          <textarea
            name="topicSeeds"
            rows={5}
            value={values.topicSeeds}
            onChange={(event) => set('topicSeeds', event.target.value)}
            className="field w-full"
          />
        </Field>

        {/* `group`: five checkboxes, so this is a fieldset. As a `<label>` it
            nested labels inside a label, and clicking the heading toggled the
            first format. */}
        <Field label={labels.formats} hint={labels.formatsHint} error={errorFor('formats')} group>
          <div className="grid gap-1.5">
            {BUILT_IN_FORMATS.map((format) => (
              <label key={format.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="formatIds"
                  value={format.id}
                  checked={values.formatIds.includes(format.id)}
                  onChange={(event) => toggleFormat(format.id, event.target.checked)}
                  className="mt-0.5 shrink-0"
                />
                <span className="min-w-0">
                  <span className="text-fg">{format.name}</span>{' '}
                  <span className="text-subtle">
                    {format.minSlides}–{format.maxSlides}
                  </span>
                  <span className="block text-xs leading-relaxed text-subtle">
                    {format.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        <Field label={labels.hashtagSets} hint={labels.hashtagSetsHint}>
          <textarea
            name="hashtagSets"
            rows={3}
            value={values.hashtagSets}
            onChange={(event) => set('hashtagSets', event.target.value)}
            className="field w-full"
          />
        </Field>
      </Section>

      <Section title={labels.lookHeading}>
        <Field label={labels.theme}>
          <select name="themeId" value={values.themeId}
            onChange={(event) => set('themeId', event.target.value)} className="field w-full sm:w-64">
            {THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name} — {theme.useWhen}
              </option>
            ))}
          </select>
        </Field>

        <Field label={labels.accent} hint={labels.accentHint} error={errorFor('accentColor')}>
          <input
            name="accentColor"
            value={values.accentColor}
            onChange={(event) => set('accentColor', event.target.value)}
            placeholder="#B4472B"
            className="field w-full sm:w-40"
          />
        </Field>

        <Field label={labels.watermark} hint={labels.watermarkHint}>
          <input
            name="watermark"
            value={values.watermark}
            onChange={(event) => set('watermark', event.target.value)}
            maxLength={40}
            className="field w-full sm:w-64"
          />
        </Field>
      </Section>

      <Section title={labels.rulesHeading}>
        <Toggle
          name="requireSources"
          label={labels.requireSources}
          hint={labels.requireSourcesHint}
          checked={values.requireSources}
          onChange={(on) => set('requireSources', on)}
        />
        <Toggle
          name="publicInterest"
          label={labels.publicInterest}
          hint={labels.publicInterestHint}
          checked={values.publicInterest}
          onChange={(on) => set('publicInterest', on)}
        />
        <Toggle
          name="requireAdLabel"
          label={labels.requireAdLabel}
          hint={labels.requireAdLabelHint}
          checked={values.requireAdLabel}
          onChange={(on) => set('requireAdLabel', on)}
        />

        <Field
          label={labels.minConfidence}
          hint={labels.minConfidenceHint}
          error={errorFor('rules.minConfidence')}
        >
          <input
            name="minConfidence"
            type="number"
            /* The floor is 0.5 in the schema and cannot be argued down. Setting
               `min` here matches it so the browser refuses before the server
               has to, but the schema is the control. */
            min={0.5}
            max={1}
            step={0.05}
            value={values.minConfidence}
            onChange={(event) => set('minConfidence', Number(event.target.value))}
            required
            className="field w-full sm:w-32"
          />
        </Field>

        <Field label={labels.forbiddenTopics} hint={labels.forbiddenTopicsHint}>
          <textarea
            name="forbiddenTopics"
            rows={3}
            value={values.forbiddenTopics}
            onChange={(event) => set('forbiddenTopics', event.target.value)}
            className="field w-full"
          />
        </Field>
      </Section>

      <Section title={labels.promptHeading} intro={labels.promptIntro}>
        <Field label={labels.promptIdeate}>
          <textarea
            name="promptIdeate"
            rows={3}
            value={values.promptIdeate}
            onChange={(event) => set('promptIdeate', event.target.value)}
            className="field w-full"
          />
        </Field>
        <Field label={labels.promptWrite}>
          <textarea
            name="promptWrite"
            rows={3}
            value={values.promptWrite}
            onChange={(event) => set('promptWrite', event.target.value)}
            className="field w-full"
          />
        </Field>
      </Section>

      <Section title={labels.cadenceHeading}>
        {/* Said out loud, because it was not.

            These three fields are edited, validated and stored, and nothing
            reads them — no recurring scheduling exists. A person filling them
            in reasonably concluded their channel would start posting three
            times a week, and it never would. Until the scheduler is built, the
            honest thing is to say so where the fields are, rather than let the
            form imply a feature. */}
        <p className="mb-[var(--sp-4)] rounded-[var(--radius-2)] border border-warn bg-warn-weak p-[var(--sp-4)] text-xs text-warn">
          {labels.cadenceNotWiredUp}
        </p>

        <Field label={labels.postsPerWeek} error={errorFor('cadence.postsPerWeek')}>
          <input
            name="postsPerWeek"
            type="number"
            min={1}
            max={50}
            value={values.postsPerWeek}
            onChange={(event) => set('postsPerWeek', Number(event.target.value))}
            required
            className="field w-full sm:w-32"
          />
        </Field>

        <Field
          label={labels.preferredTimes}
          hint={labels.preferredTimesHint}
          error={errorFor('cadence.preferredTimes')}
        >
          <input
            name="preferredTimes"
            value={values.preferredTimes}
            onChange={(event) => set('preferredTimes', event.target.value)}
            required
            className="field w-full sm:w-64"
          />
        </Field>

        <Field
          label={labels.timezone}
          hint={labels.timezoneHint}
          error={errorFor('cadence.timezone')}
        >
          <input
            name="timezone"
            value={values.timezone}
            onChange={(event) => set('timezone', event.target.value)}
            required
            className="field w-full sm:w-64"
          />
        </Field>
      </Section>

      <div className="flex flex-wrap items-center gap-[var(--sp-4)] border-t border-rule pt-[var(--sp-5)]">
        <ActionButton idle={labels.save} busy={labels.saving} className="btn" />
        <Link href={cancelHref} className="btn btn-ghost">
          {labels.cancel}
        </Link>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="isDefault" checked={values.isDefault}
            onChange={(event) => set('isDefault', event.target.checked)} />
          {labels.makeDefault}
        </label>
      </div>
    </form>
  )
}

function Section({
  title,
  intro,
  children,
}: {
  title: string
  intro?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[var(--radius-2)] border border-rule bg-raised p-[var(--sp-5)]">
      <h2 className="mb-1 text-sm font-semibold">{title}</h2>
      {intro && <p className="mb-[var(--sp-4)] text-xs leading-relaxed text-subtle">{intro}</p>}
      <div className="grid gap-[var(--sp-5)]">{children}</div>
    </section>
  )
}

function Field({
  label,
  hint,
  error,
  group = false,
  children,
}: {
  label: string
  hint?: string
  error?: string
  /**
   * Render as `<fieldset>`/`<legend>` instead of `<label>`.
   *
   * Required whenever `children` is more than one control. `Field` wrapped
   * everything in a `<label>`, and the Formats picker passed it five checkboxes
   * each already inside their own `<label>` — nested labels are invalid HTML,
   * and the practical result was that clicking the "Formats" heading toggled
   * the first format. A group of controls also has no single thing to be
   * labelled by, so `<legend>` is what names it.
   */
  group?: boolean
  children: React.ReactNode
}) {
  const body = (
    <>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-err">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs leading-relaxed text-subtle">{hint}</span>
      ) : null}
    </>
  )

  if (group) {
    return (
      <fieldset className="block">
        <legend className="mb-1 block text-xs font-medium text-muted">{label}</legend>
        {body}
      </fieldset>
    )
  }

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {body}
    </label>
  )
}

/**
 * A checkbox with its reasoning attached.
 *
 * Every toggle in this section has a legal or platform consequence — an
 * originality policy, the EU AI Act, § 5a UWG — so none of them ships as a bare
 * label. Someone switching one off should be able to see what they are taking on.
 */
function Toggle({
  name,
  label,
  hint,
  checked,
  onChange,
}: {
  name: string
  label: string
  hint: string
  checked: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        <span className="block text-xs leading-relaxed text-subtle">{hint}</span>
      </span>
    </label>
  )
}
