'use client'

import { useId, useState } from 'react'
import { ChevronDownIcon } from '@/components/icons'
import { useNow } from '@/lib/hooks/useNow'
import { Chip } from '@/components/ui/form'
import {
  formatShortDate,
  formatTime,
  localDateKey,
  localTimeValue,
  localToUtcCandidates,
  tzAbbreviation,
} from '@/lib/time/zoned'

export type WhenValue = {
  mode: 'now' | 'custom'
  date: string
  time: string
  ambiguityChoice: number
}

export type ResolvedWhen = { occurredAt: string | null; error: string | null; candidates: Date[] }

const FUTURE_SKEW_MS = 5 * 60_000

/** Turn the picker state into an instant (null = "now at Save", decided by the server). */
/** `now` = 0 skips the future check (used before the client clock is available). */
export function resolveWhen(value: WhenValue, tz: string, now: number): ResolvedWhen {
  if (value.mode === 'now') return { occurredAt: null, error: null, candidates: [] }
  const candidates = localToUtcCandidates(value.date, value.time, tz)
  if (candidates.length === 0) {
    return {
      occurredAt: null,
      candidates,
      error:
        /^\d{4}-\d{2}-\d{2}$/.test(value.date) && /^\d{2}:\d{2}$/.test(value.time)
          ? 'That time didn’t exist (clocks moved forward). Choose another time.'
          : 'Choose a date and time.',
    }
  }
  const chosen = candidates[Math.min(value.ambiguityChoice, candidates.length - 1)]!
  if (now > 0 && chosen.getTime() > now + FUTURE_SKEW_MS) {
    return { occurredAt: null, candidates, error: 'That time is in the future.' }
  }
  return { occurredAt: chosen.toISOString(), error: null, candidates }
}

export function presetValue(minutesAgo: number, tz: string, now = Date.now()): WhenValue {
  const at = new Date(now - minutesAgo * 60_000)
  return {
    mode: 'custom',
    date: localDateKey(at, tz),
    time: localTimeValue(at, tz),
    ambiguityChoice: 0,
  }
}

const PRESETS = [5, 15, 30] as const

export function TimePicker({
  value,
  onChange,
  timezone,
  error,
}: {
  value: WhenValue
  onChange: (v: WhenValue) => void
  timezone: string
  error?: string | null
}) {
  // 0 until the clock ticks after hydration; time-dependent hints wait for it.
  const now = useNow()
  const clock = now
  const id = useId()
  const [open, setOpen] = useState(value.mode === 'custom')
  const resolved = resolveWhen(value, timezone, now)
  const shownError = error ?? resolved.error

  const activePreset =
    value.mode === 'custom' && now > 0
      ? PRESETS.find((m) => {
          const p = presetValue(m, timezone, now)
          return (
            p.date === value.date &&
            Math.abs(timeToMinutes(p.time) - timeToMinutes(value.time)) <= 1
          )
        })
      : undefined

  return (
    <section aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-label`} className="text-[15px] font-semibold">
          When
        </h2>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-[15px] font-semibold text-muted hover:text-text"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((o) => !o)}
        >
          Change time
          <ChevronDownIcon size={18} className={open ? 'rotate-180' : ''} />
        </button>
      </div>

      <p className="text-lg font-semibold tabular" aria-live="polite">
        {value.mode === 'now' ? (
          <>
            Now{' '}
            {clock ? (
              <span className="font-normal text-muted">
                · {formatTime(new Date(clock), timezone)}
              </span>
            ) : null}
          </>
        ) : resolved.occurredAt ? (
          <>
            {formatTime(new Date(resolved.occurredAt), timezone)}{' '}
            <span className="font-normal text-muted">
              · {formatShortDate(new Date(resolved.occurredAt), timezone)}
            </span>
          </>
        ) : (
          <span className="text-muted">Choose a time</span>
        )}
      </p>

      {open ? (
        <div
          id={`${id}-panel`}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2 p-3"
        >
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Quick times">
            <Chip
              pressed={value.mode === 'now'}
              onClick={() => onChange({ ...value, mode: 'now' })}
            >
              Now
            </Chip>
            {PRESETS.map((m) => (
              <Chip
                key={m}
                pressed={activePreset === m}
                onClick={() => onChange(presetValue(m, timezone))}
              >
                {m} min ago
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-[1.3fr_1fr] gap-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Date
              <input
                type="date"
                className="min-h-12 rounded-xl border border-border-strong bg-surface px-3 text-base"
                value={value.mode === 'custom' ? value.date : localDateKey(new Date(now), timezone)}
                max={localDateKey(new Date(now), timezone)}
                onChange={(e) =>
                  onChange({
                    mode: 'custom',
                    date: e.target.value,
                    time:
                      value.mode === 'custom'
                        ? value.time
                        : localTimeValue(new Date(now), timezone),
                    ambiguityChoice: 0,
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Time
              <input
                type="time"
                className="min-h-12 rounded-xl border border-border-strong bg-surface px-3 text-base"
                value={
                  value.mode === 'custom' ? value.time : localTimeValue(new Date(now), timezone)
                }
                onChange={(e) =>
                  onChange({
                    mode: 'custom',
                    date:
                      value.mode === 'custom' ? value.date : localDateKey(new Date(now), timezone),
                    time: e.target.value,
                    ambiguityChoice: 0,
                  })
                }
              />
            </label>
          </div>
          {resolved.candidates.length === 2 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">
                Clocks went back that night, so this time happened twice. Which one?
              </legend>
              {resolved.candidates.map((c, i) => (
                <label key={c.toISOString()} className="flex min-h-11 items-center gap-3">
                  <input
                    type="radio"
                    name={`${id}-ambiguous`}
                    className="h-5 w-5 accent-[var(--primary)]"
                    checked={value.ambiguityChoice === i}
                    onChange={() => onChange({ ...value, ambiguityChoice: i })}
                  />
                  {formatTime(c, timezone)} {tzAbbreviation(c, timezone)} (
                  {i === 0 ? 'first time' : 'second time'})
                </label>
              ))}
            </fieldset>
          ) : null}
          <p className="text-sm text-muted">
            Times are in the family time zone ({timezone.replace(/_/g, ' ')}).
          </p>
        </div>
      ) : null}
      {shownError ? (
        <p role="alert" className="text-sm font-semibold text-danger-ink">
          {shownError}
        </p>
      ) : null}
    </section>
  )
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}
