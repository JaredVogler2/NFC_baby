import type { ComponentProps, ReactNode } from 'react'
import { AlertIcon, CheckIcon, InfoIcon, OfflineIcon } from '@/components/icons'

export function Card({ className = '', ...rest }: ComponentProps<'div'>) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-border bg-surface shadow-card ${className}`}
      {...rest}
    />
  )
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">
      {children}
    </h2>
  )
}

type BannerTone = 'info' | 'success' | 'warning' | 'danger' | 'offline'

const BANNER_TONE: Record<BannerTone, string> = {
  info: 'bg-primary-tint text-text border-border',
  success: 'bg-success-tint text-text border-border',
  warning: 'bg-warning-tint text-text border-border',
  danger: 'bg-danger-tint text-text border-border',
  offline: 'bg-surface-2 text-text border-border-strong',
}

const BANNER_ICON: Record<BannerTone, ReactNode> = {
  info: <InfoIcon size={20} />,
  success: <CheckIcon size={20} />,
  warning: <AlertIcon size={20} />,
  danger: <AlertIcon size={20} />,
  offline: <OfflineIcon size={20} />,
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
  role,
  className = '',
}: {
  tone?: BannerTone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  role?: 'status' | 'alert'
  className?: string
}) {
  return (
    <div
      role={role}
      className={`flex gap-3 rounded-2xl border px-4 py-3 text-[15px] ${BANNER_TONE[tone]} ${className}`}
    >
      <span className="mt-0.5 shrink-0 text-muted">{BANNER_ICON[tone]}</span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-muted [&_strong]:text-text">{children}</div> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-border-strong px-6 py-10 text-center">
      {icon ? <div className="text-muted">{icon}</div> : null}
      <p className="font-display text-lg font-semibold">{title}</p>
      {children ? <div className="max-w-xs text-muted">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>
}
