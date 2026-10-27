'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button, type ButtonVariant } from './Button'

/** Accessible confirmation using the native <dialog> (focus trap + Esc handled by the browser). */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  confirmVariant = 'danger',
  cancelLabel = 'Cancel',
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  confirmVariant?: ButtonVariant
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      className="m-auto w-[min(92vw,420px)] rounded-[var(--radius-card)] border border-border bg-surface p-0 text-text shadow-card backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 id={`${id}-title`} className="font-display text-xl font-bold">
          {title}
        </h2>
        {children ? <div className="text-muted">{children}</div> : null}
        <div className="mt-2 flex flex-col gap-2">
          <Button variant={confirmVariant} block onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
          <Button variant="secondary" block onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
