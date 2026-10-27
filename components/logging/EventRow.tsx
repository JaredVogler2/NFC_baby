import Link from 'next/link'
import { ChevronRightIcon } from '@/components/icons'
import { eventSummary, type CareEvent } from '@/lib/domain/event'
import type { VolumeUnit } from '@/lib/domain/units'
import { formatTime } from '@/lib/time/zoned'
import { KindBadge } from './kind'

/** One timeline row: icon + words (never colour alone), time, author, markers. */
export function EventRow({
  event,
  timezone,
  unit,
  showDate,
}: {
  event: CareEvent
  timezone: string
  unit: VolumeUnit
  showDate?: (iso: string) => string
}) {
  const voided = event.state === 'VOID'
  const edited = event.revision > 1 && !voided
  return (
    <Link
      href={`/history/${event.id}`}
      className={`flex min-h-16 items-center gap-3 px-4 py-3 ${voided ? 'opacity-70' : ''}`}
    >
      <KindBadge intent={event.intent} subtype={event.subtype} size="sm" />
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold ${voided ? 'line-through' : ''}`}>
          {eventSummary(event, unit)}
        </span>
        <span className="block truncate text-sm text-muted">
          {event.createdByName}
          {edited ? ' · edited' : ''}
          {voided ? ` · undone${event.voidedByName ? ` by ${event.voidedByName}` : ''}` : ''}
          {event.notes ? ` · “${event.notes}”` : ''}
        </span>
      </span>
      <span className="text-right text-sm tabular">
        {showDate ? <span className="block text-muted">{showDate(event.occurredAt)}</span> : null}
        <span className="font-semibold">{formatTime(new Date(event.occurredAt), timezone)}</span>
      </span>
      <ChevronRightIcon size={18} className="shrink-0 text-muted" />
    </Link>
  )
}
