import Link from 'next/link'
import { KindBadge } from '@/components/logging/kind'
import { eventSummary, type CareEvent } from '@/lib/domain/event'
import type { VolumeUnit } from '@/lib/domain/units'
import { formatWhen } from '@/lib/time/zoned'
import { Elapsed } from './Elapsed'

export function SinceCard({
  title,
  event,
  timezone,
  unit,
  empty,
}: {
  title: string
  event: CareEvent | null
  timezone: string
  unit: VolumeUnit
  empty: string
}) {
  if (!event) {
    return (
      <div className="flex min-h-32 flex-col justify-between rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</p>
        <p className="text-muted">{empty}</p>
      </div>
    )
  }
  return (
    <Link
      href={`/history/${event.id}`}
      className="flex min-h-32 flex-col justify-between gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card"
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</p>
      <p className="font-display text-2xl font-bold leading-tight tabular">
        <Elapsed iso={event.occurredAt} />
      </p>
      <p className="flex items-center gap-2 text-sm">
        <KindBadge intent={event.intent} subtype={event.subtype} size="sm" />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{eventSummary(event, unit)}</span>
          <span className="block text-muted">
            {formatWhen(new Date(event.occurredAt), timezone)}
          </span>
        </span>
      </p>
    </Link>
  )
}
