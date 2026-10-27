'use client'

import { useId, useRef } from 'react'
import { PlusIcon } from '@/components/icons'
import { Chip } from '@/components/ui/form'
import { MAX_NOTE_LENGTH } from '@/lib/domain/notes'

/** Optional note, collapsed by default so it never slows down a one-tap save. */
export function NotesField({
  value,
  onChange,
  open,
  onOpenChange,
  templates,
  error,
}: {
  value: string
  onChange: (v: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: readonly string[]
  error?: string
}) {
  const id = useId()
  const ref = useRef<HTMLTextAreaElement>(null)
  if (!open && !value) {
    return (
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl px-1 text-[15px] font-semibold text-muted hover:text-text"
        onClick={() => {
          onOpenChange(true)
          requestAnimationFrame(() => ref.current?.focus())
        }}
      >
        <PlusIcon size={20} /> Add note <span className="font-normal">(optional)</span>
      </button>
    )
  }
  const remaining = MAX_NOTE_LENGTH - value.length
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[15px] font-semibold">
        Note <span className="font-normal text-muted">(optional)</span>
      </label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick notes">
        {templates.map((t) => (
          <Chip
            key={t}
            pressed={value.includes(t)}
            onClick={() =>
              onChange(value.includes(t) ? value : value ? `${value.trimEnd()}. ${t}` : t)
            }
          >
            {t}
          </Chip>
        ))}
      </div>
      <textarea
        ref={ref}
        id={id}
        value={value}
        rows={3}
        maxLength={MAX_NOTE_LENGTH + 50}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-count`}
        onChange={(e) => onChange(e.target.value)}
        // Enter adds a newline; it must never submit the form.
        className="block w-full resize-y rounded-xl border border-border-strong bg-surface px-3.5 py-3 text-base text-text focus:border-focus"
      />
      <p
        id={`${id}-count`}
        className={`text-sm ${remaining < 0 ? 'font-semibold text-danger-ink' : 'text-muted'}`}
      >
        {remaining >= 0 ? `${remaining} characters left` : `${-remaining} characters too long`}
      </p>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  )
}
