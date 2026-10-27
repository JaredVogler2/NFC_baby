'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CheckIcon, PencilIcon, UndoIcon } from '@/components/icons'
import { NotificationPanel } from '@/components/notifications/NotificationPanel'
import { Button, LinkButton } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Banner } from '@/components/ui/primitives'
import { eventSummary, type CareEvent } from '@/lib/domain/event'
import type { VolumeUnit } from '@/lib/domain/units'
import { apiFetch } from '@/lib/http/client'
import type { NotificationSummary } from '@/lib/notifications/summary'
import { formatShortDate, formatTime } from '@/lib/time/zoned'
import { KindBadge } from './kind'

export function SavedView({
  initialEvent,
  notification,
  timezone,
  unit,
  canEdit,
}: {
  initialEvent: CareEvent
  notification: NotificationSummary
  timezone: string
  unit: VolumeUnit
  canEdit: boolean
}) {
  const [event, setEvent] = useState(initialEvent)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undoInfo, setUndoInfo] = useState<{ previouslyNotified: boolean } | null>(null)

  const occurred = new Date(event.occurredAt)
  const recorded = new Date(event.createdAt)
  const lateMinutes = Math.round((recorded.getTime() - occurred.getTime()) / 60_000)
  const voided = event.state === 'VOID'
  const summary = eventSummary(event, unit)

  async function undo() {
    setBusy(true)
    setError(null)
    const res = await apiFetch<{ event: CareEvent; previouslyNotified: boolean }>(
      `/api/v1/events/${event.id}/void`,
      {
        method: 'POST',
        body: { expectedRevision: event.revision, reason: 'Undo from saved screen' },
      },
    )
    setBusy(false)
    setConfirming(false)
    if (!res.ok) {
      setError(
        res.code === 'CONFLICT'
          ? 'Someone changed this entry. Open it in History to review.'
          : res.message,
      )
      return
    }
    setEvent(res.data.event)
    setUndoInfo({ previouslyNotified: res.data.previouslyNotified })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-start gap-3" aria-live="polite">
        {voided ? (
          <p className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold">
            <UndoIcon size={18} /> Undone
          </p>
        ) : (
          <p className="inline-flex items-center gap-2 rounded-full bg-success-tint px-3 py-1 text-sm font-semibold text-success">
            <CheckIcon size={18} /> Saved
          </p>
        )}
        <div className="flex items-center gap-3">
          <KindBadge intent={event.intent} subtype={event.subtype} />
          <h1
            className={`font-display text-2xl font-bold leading-tight ${voided ? 'line-through decoration-2' : ''}`}
          >
            {summary} {voided ? '' : 'saved'} at {formatTime(occurred, timezone)}
          </h1>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-[15px]">
        <dt className="text-muted">Happened</dt>
        <dd className="tabular">
          {formatShortDate(occurred, timezone)} · {formatTime(occurred, timezone)}
        </dd>
        {lateMinutes >= 2 ? (
          <>
            <dt className="text-muted">Recorded</dt>
            <dd className="tabular">
              {formatTime(recorded, timezone)} ({lateMinutes} min later)
            </dd>
          </>
        ) : null}
        <dt className="text-muted">Logged by</dt>
        <dd>
          {event.createdByName}
          {event.sourceTagLabel ? (
            <span className="text-muted"> · sticker “{event.sourceTagLabel}”</span>
          ) : null}
        </dd>
        {event.notes ? (
          <>
            <dt className="text-muted">Note</dt>
            <dd className="whitespace-pre-wrap break-words">{event.notes}</dd>
          </>
        ) : null}
        {voided ? (
          <>
            <dt className="text-muted">Undone by</dt>
            <dd>{event.voidedByName ?? 'a family member'}</dd>
          </>
        ) : null}
      </dl>

      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
      {voided ? (
        <Banner tone="info" role="status" title="Entry undone">
          It no longer counts in Home or History totals and is kept in the change history.
          {undoInfo?.previouslyNotified || notification.previouslyNotified
            ? ' A text about it may already have been received — texts can’t be recalled.'
            : ''}
        </Banner>
      ) : canEdit ? (
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            icon={<UndoIcon size={20} />}
            onClick={() => setConfirming(true)}
          >
            Undo this entry
          </Button>
          <LinkButton href={`/history/${event.id}`} icon={<PencilIcon size={20} />}>
            Edit
          </LinkButton>
        </div>
      ) : null}

      <NotificationPanel summary={notification} voided={voided} eventId={event.id} />

      <LinkButton href="/dashboard" variant="primary" size="xl" block>
        Done
      </LinkButton>
      <p className="text-center text-sm text-muted">
        You can close this screen.{' '}
        <Link href="/history" className="underline">
          See history
        </Link>
      </p>

      <ConfirmDialog
        open={confirming}
        title="Undo this entry?"
        confirmLabel="Undo entry"
        busy={busy}
        onConfirm={undo}
        onCancel={() => setConfirming(false)}
      >
        It will be removed from Home and History totals for everyone, and kept in the change
        history.
        {notification.previouslyNotified
          ? ' A text about it may already have been received; texts can’t be recalled.'
          : ''}
      </ConfirmDialog>
    </div>
  )
}
