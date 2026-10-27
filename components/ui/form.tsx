'use client'

import { useId, type ComponentProps, type ReactNode } from 'react'

const INPUT =
  'block w-full rounded-xl border border-border-strong bg-surface px-3.5 py-3 text-base text-text ' +
  'placeholder:text-muted/80 focus:border-focus focus:outline-none focus-visible:outline-3 ' +
  'focus-visible:outline-focus aria-[invalid=true]:border-danger disabled:opacity-60'

type FieldShellProps = {
  label: ReactNode
  hint?: ReactNode
  error?: string
  id: string
  children: ReactNode
  labelHidden?: boolean
}

export function FieldShell({ label, hint, error, id, children, labelHidden }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelHidden ? 'sr-only' : 'text-[15px] font-semibold'}>
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  )
}

type TextFieldProps = Omit<ComponentProps<'input'>, 'id'> & {
  label: ReactNode
  hint?: ReactNode
  error?: string
  labelHidden?: boolean
}

export function TextField({
  label,
  hint,
  error,
  labelHidden,
  className = '',
  ...rest
}: TextFieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <FieldShell label={label} hint={hint} error={error} id={id} labelHidden={labelHidden}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${INPUT} ${className}`}
        {...rest}
      />
    </FieldShell>
  )
}

type TextAreaProps = Omit<ComponentProps<'textarea'>, 'id'> & {
  label: ReactNode
  hint?: ReactNode
  error?: string
  labelHidden?: boolean
}

export function TextArea({
  label,
  hint,
  error,
  labelHidden,
  className = '',
  ...rest
}: TextAreaProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <FieldShell label={label} hint={hint} error={error} id={id} labelHidden={labelHidden}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${INPUT} min-h-24 resize-y ${className}`}
        {...rest}
      />
    </FieldShell>
  )
}

type SelectProps = Omit<ComponentProps<'select'>, 'id'> & {
  label: ReactNode
  hint?: ReactNode
  error?: string
}

export function SelectField({
  label,
  hint,
  error,
  className = '',
  children,
  ...rest
}: SelectProps) {
  const id = useId()
  return (
    <FieldShell label={label} hint={hint} error={error} id={id}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`${INPUT} appearance-none ${className}`}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  )
}

export type SegmentOption<T extends string> = {
  value: T
  label: ReactNode
  icon?: ReactNode
  /** Accessible name when label is visual-only. */
  ariaLabel?: string
}

/**
 * Segmented control implemented as a native radio group, so VoiceOver announces
 * "Bottle, radio button, 1 of 2" and arrow keys work without custom key handling.
 */
export function Segmented<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  legendHidden,
  size = 'lg',
  activeClass = 'bg-primary text-primary-fg border-primary',
  columns,
}: {
  legend: ReactNode
  name: string
  options: SegmentOption<T>[]
  value: T | null
  onChange: (value: T) => void
  legendHidden?: boolean
  size?: 'md' | 'lg'
  activeClass?: string
  columns?: number
}) {
  const height = size === 'lg' ? 'min-h-12' : 'min-h-11'
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={legendHidden ? 'sr-only' : 'mb-1.5 text-[15px] font-semibold'}>
        {legend}
      </legend>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const checked = value === option.value
          return (
            <label
              key={option.value}
              className={[
                'relative flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-center font-semibold',
                'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                height,
                checked ? activeClass : 'border-border-strong bg-surface text-text',
              ].join(' ')}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                aria-label={option.ariaLabel}
                className="sr-only"
              />
              {option.icon}
              <span>{option.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Toggle-style chip button (aria-pressed). Used for amount presets and note templates. */
export function Chip({
  pressed,
  className = '',
  children,
  ...rest
}: ComponentProps<'button'> & { pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={[
        'inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-3.5 font-semibold tabular touch-manipulation',
        pressed
          ? 'border-primary bg-primary text-primary-fg'
          : 'border-border-strong bg-surface text-text',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Checkbox({
  label,
  hint,
  className = '',
  ...rest
}: Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId()
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--primary)]"
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...rest}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-sm text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  )
}
