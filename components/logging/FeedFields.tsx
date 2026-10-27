'use client'

import { useEffect, useId, useState } from 'react'
import { BottleIcon, NursingIcon } from '@/components/icons'
import { Checkbox, Chip, Segmented } from '@/components/ui/form'
import { Banner } from '@/components/ui/primitives'
import { ML_PRESETS, OZ_PRESETS, mlToOz, ozToMl, parseAmount } from '@/lib/domain/units'
import type { FormState } from '@/lib/logging/attempt'
import { useNow } from '@/lib/hooks/useNow'
import { presetValue } from './TimePicker'

export type FeedSuggestions = {
  lastMethod: 'BOTTLE' | 'NURSING' | null
  lastBottle: { milkType: string; value: number; unit: 'oz' | 'ml' } | null
}

const METHOD_OPTIONS = [
  { value: 'BOTTLE' as const, label: 'Bottle', icon: <BottleIcon size={20} /> },
  { value: 'NURSING' as const, label: 'Nursing', icon: <NursingIcon size={20} /> },
]
const MILK_OPTIONS = [
  { value: 'BREASTMILK' as const, label: 'Breastmilk' },
  { value: 'FORMULA' as const, label: 'Formula' },
  { value: 'UNKNOWN' as const, label: 'Unknown' },
]
const SIDE_OPTIONS = [
  { value: 'LEFT' as const, label: 'Left' },
  { value: 'RIGHT' as const, label: 'Right' },
  { value: 'BOTH' as const, label: 'Both' },
  { value: 'UNKNOWN' as const, label: 'Not tracked' },
]
const UNIT_OPTIONS = [
  { value: 'oz' as const, label: 'oz' },
  { value: 'ml' as const, label: 'mL' },
]
const MINUTE_PRESETS = [5, 10, 15, 20, 30] as const

const ACTIVE = 'bg-feed text-feed-fg border-feed'

function formatAmount(n: number) {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
}

/** Convert the typed amount when the unit is switched (oz → whole mL, mL → 0.1 oz). */
export function convertAmount(amount: string, from: 'oz' | 'ml', to: 'oz' | 'ml'): string {
  if (from === to) return amount
  const value = parseAmount(amount)
  if (value === null) return ''
  return to === 'ml'
    ? String(Math.round(ozToMl(value)))
    : formatAmount(Math.round(mlToOz(value) * 10) / 10)
}

/** Initial feeding form values: visible suggestions only, never an amount the parent didn't pick. */
export function initialFeedForm(
  suggestions: FeedSuggestions | null,
  householdDefault: 'BOTTLE' | 'NURSING' | null,
  unit: 'oz' | 'ml',
): Partial<FormState> {
  const method = suggestions?.lastMethod ?? householdDefault ?? null
  const lastMilk = suggestions?.lastBottle?.milkType
  return {
    feedMethod: method,
    milkType: lastMilk === 'BREASTMILK' || lastMilk === 'FORMULA' ? lastMilk : null,
    amountUnit: suggestions?.lastBottle?.unit ?? unit,
  }
}

export function FeedFields({
  form,
  update,
  fieldErrors,
  disabled,
  suggestions,
  timerKey,
  timezone,
}: {
  form: FormState
  update: (patch: Partial<FormState>) => void
  fieldErrors: Record<string, string>
  disabled?: boolean
  suggestions?: FeedSuggestions | null
  /** When set, offers the optional nursing timer (stored per form in sessionStorage). */
  timerKey?: string
  timezone: string
}) {
  const id = useId()
  const presets = form.amountUnit === 'oz' ? OZ_PRESETS : ML_PRESETS
  const last = suggestions?.lastBottle ?? null
  const lastInUnit = last
    ? last.unit === form.amountUnit
      ? formatAmount(last.value)
      : convertAmount(String(last.value), last.unit, form.amountUnit)
    : null
  const methodError = fieldErrors.feeding

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        legend="Method"
        name={`${id}-method`}
        value={form.feedMethod}
        options={METHOD_OPTIONS}
        activeClass={ACTIVE}
        onChange={(feedMethod) => update({ feedMethod })}
      />
      {suggestions?.lastMethod && form.feedMethod === suggestions.lastMethod ? (
        <p className="-mt-2 text-sm text-muted">
          Selected because the last feeding was{' '}
          {suggestions.lastMethod === 'BOTTLE' ? 'a bottle' : 'nursing'}. Change it if needed.
        </p>
      ) : null}
      {methodError && !form.feedMethod ? (
        <p role="alert" className="-mt-2 text-sm font-semibold text-danger-ink">
          {methodError}
        </p>
      ) : null}

      {form.feedMethod === 'BOTTLE' ? (
        <>
          <Segmented
            legend="Milk"
            name={`${id}-milk`}
            value={form.milkType === 'OTHER' ? null : form.milkType}
            options={MILK_OPTIONS}
            activeClass={ACTIVE}
            onChange={(milkType) => update({ milkType })}
            size="md"
          />
          {fieldErrors['feeding.milkType'] ? (
            <p role="alert" className="-mt-2 text-sm font-semibold text-danger-ink">
              {fieldErrors['feeding.milkType']}
            </p>
          ) : null}

          <fieldset className="flex flex-col gap-2" disabled={disabled}>
            <div className="flex items-center justify-between gap-3">
              <legend className="text-[15px] font-semibold">Amount</legend>
              <div className="w-28">
                <Segmented
                  legend="Unit"
                  legendHidden
                  name={`${id}-unit`}
                  value={form.amountUnit}
                  options={UNIT_OPTIONS}
                  size="md"
                  onChange={(amountUnit) =>
                    update({
                      amountUnit,
                      amount: convertAmount(form.amount, form.amountUnit, amountUnit),
                    })
                  }
                />
              </div>
            </div>
            <div
              className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-6"
              role="group"
              aria-label={`Common amounts in ${form.amountUnit === 'oz' ? 'ounces' : 'millilitres'}`}
            >
              {presets.map((p) => (
                <Chip
                  key={p}
                  pressed={!form.amountUnknown && parseAmount(form.amount) === p}
                  disabled={form.amountUnknown}
                  aria-label={`${p} ${form.amountUnit === 'oz' ? 'ounces' : 'millilitres'}`}
                  onClick={() => update({ amount: String(p), amountUnknown: false })}
                  className="min-h-12 text-lg"
                >
                  {p}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold">
                Custom amount ({form.amountUnit === 'oz' ? 'oz' : 'mL'})
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={form.amountUnit === 'oz' ? 'e.g. 3.5' : 'e.g. 120'}
                  value={form.amountUnknown ? '' : form.amount}
                  disabled={form.amountUnknown}
                  aria-invalid={fieldErrors['feeding.amountValue'] ? true : undefined}
                  onChange={(e) =>
                    update({
                      amount: e.target.value.replace(/[^0-9.,]/g, '').slice(0, 7),
                      amountUnknown: false,
                    })
                  }
                  className="min-h-12 w-full rounded-xl border border-border-strong bg-surface px-3 text-lg tabular disabled:opacity-50"
                />
              </label>
              {lastInUnit && !form.amountUnknown ? (
                <Chip
                  pressed={parseAmount(form.amount) === parseAmount(lastInUnit)}
                  onClick={() =>
                    update({
                      amount: lastInUnit,
                      amountUnknown: false,
                      milkType: form.milkType ?? (last!.milkType as FormState['milkType']),
                    })
                  }
                  className="min-h-12"
                >
                  Last: {lastInUnit} {form.amountUnit === 'oz' ? 'oz' : 'mL'}
                </Chip>
              ) : null}
            </div>
            <Checkbox
              label="Amount not measured"
              hint="Records this bottle without an amount — never as zero."
              checked={form.amountUnknown}
              onChange={(e) =>
                update({
                  amountUnknown: e.target.checked,
                  amount: e.target.checked ? '' : form.amount,
                })
              }
            />
            {fieldErrors['feeding.amountValue'] || fieldErrors['feeding.amountUnit'] ? (
              <p role="alert" className="text-sm font-semibold text-danger-ink">
                {fieldErrors['feeding.amountValue'] ?? fieldErrors['feeding.amountUnit']}
              </p>
            ) : null}
            {form.amountUnknown ? (
              <Banner tone="warning">This bottle will be saved with “amount not measured”.</Banner>
            ) : null}
          </fieldset>
        </>
      ) : null}

      {form.feedMethod === 'NURSING' ? (
        <>
          <Segmented
            legend="Side"
            name={`${id}-side`}
            value={form.side}
            options={SIDE_OPTIONS}
            activeClass={ACTIVE}
            columns={2}
            size="md"
            onChange={(side) => update({ side })}
          />
          <fieldset className="flex flex-col gap-2" disabled={disabled}>
            <legend className="text-[15px] font-semibold">
              Duration <span className="font-normal text-muted">(optional)</span>
            </legend>
            <div className="grid grid-cols-5 gap-2" role="group" aria-label="Common durations">
              {MINUTE_PRESETS.map((m) => (
                <Chip
                  key={m}
                  pressed={form.durationMinutes === String(m)}
                  aria-label={`${m} minutes`}
                  onClick={() =>
                    update({ durationMinutes: form.durationMinutes === String(m) ? '' : String(m) })
                  }
                >
                  {m}
                </Chip>
              ))}
            </div>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Minutes
              <input
                inputMode="numeric"
                autoComplete="off"
                placeholder="Not tracked"
                value={form.durationMinutes}
                aria-invalid={fieldErrors['feeding.durationSeconds'] ? true : undefined}
                onChange={(e) =>
                  update({ durationMinutes: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })
                }
                className="min-h-12 w-full rounded-xl border border-border-strong bg-surface px-3 text-lg tabular"
              />
            </label>
            {fieldErrors['feeding.durationSeconds'] ? (
              <p role="alert" className="text-sm font-semibold text-danger-ink">
                {fieldErrors['feeding.durationSeconds']}
              </p>
            ) : null}
            {timerKey ? (
              <NursingTimer storageKey={timerKey} update={update} timezone={timezone} />
            ) : null}
          </fieldset>
        </>
      ) : null}
    </div>
  )
}

/**
 * Optional nursing timer. Starting it sets the feeding's start time; stopping fills in minutes.
 * It survives screen sleep / reload (sessionStorage) and never blocks saving: if it's still
 * running at Save, the elapsed minutes so far are used.
 */
function NursingTimer({
  storageKey,
  update,
  timezone,
}: {
  storageKey: string
  update: (patch: Partial<FormState>) => void
  timezone: string
}) {
  const key = `nfcb:timer:${storageKey}`
  const now = useNow()
  const [startedAt, setStartedAt] = useState<number | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore a running timer once
      if (raw) setStartedAt(Number(raw))
    } catch {
      // storage unavailable: timer works in memory only
    }
  }, [key])

  const minutes = startedAt && now ? Math.max(0, Math.floor((now - startedAt) / 60_000)) : 0

  useEffect(() => {
    if (startedAt) update({ durationMinutes: String(Math.max(1, minutes)) })
  }, [startedAt, minutes, update])

  if (!startedAt) {
    return (
      <button
        type="button"
        className="min-h-11 self-start rounded-xl border border-border-strong px-4 font-semibold"
        onClick={() => {
          const start = Date.now()
          setStartedAt(start)
          try {
            sessionStorage.setItem(key, String(start))
          } catch {
            // ignore
          }
          // The feeding's time is when it started.
          const at = presetValue(0, timezone, start)
          update({
            whenMode: 'custom',
            date: at.date,
            time: at.time,
            ambiguityChoice: 0,
            durationMinutes: '1',
          })
        }}
      >
        Start timer
      </button>
    )
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-feed-tint px-3 py-2">
      <span className="font-semibold tabular text-feed-ink" aria-live="polite">
        Timer running · {minutes} min
      </span>
      <button
        type="button"
        className="min-h-11 rounded-xl border border-border-strong bg-surface px-4 font-semibold"
        onClick={() => {
          setStartedAt(null)
          try {
            sessionStorage.removeItem(key)
          } catch {
            // ignore
          }
          update({ durationMinutes: String(Math.max(1, minutes)) })
        }}
      >
        Stop
      </button>
    </div>
  )
}
