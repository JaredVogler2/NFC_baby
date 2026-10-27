'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/http/client'
import type { NotificationSummary } from '@/lib/notifications/summary'
import { Banner } from '@/components/ui/primitives'
import { ShareActions } from './ShareActions'
import { recipientStatusText } from './statusText'

/** Parent-notification state, always shown separately from "Saved". */
const IN_FLIGHT = new Set(['PENDING', 'PROCESSING'])

export function NotificationPanel({
  summary: initial,
  voided,
  eventId,
}: {
  summary: NotificationSummary
  voided?: boolean
  eventId?: string
}) {
  const [summary, setSummary] = useState(initial)
  // While texts are queued/sending, poll briefly so the screen shows what the provider said.
  useEffect(() => {
    if (!eventId || !summary.recipients.some((r) => IN_FLIGHT.has(r.state))) return
    let tries = 0
    const timer = setInterval(async () => {
      tries++
      const res = await apiFetch<{ notification: NotificationSummary }>(`/api/v1/events/${eventId}`)
      if (res.ok) setSummary(res.data.notification)
      if (tries >= 20) clearInterval(timer)
    }, 2000)
    return () => clearInterval(timer)
  }, [eventId, summary.recipients])
  const automatic = summary.recipients.filter(
    (r) => r.state !== 'SUPPRESSED' && r.state !== 'CANCELED',
  )
  return (
    <section
      aria-labelledby="notify-title"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4"
    >
      <h2 id="notify-title" className="text-sm font-semibold uppercase tracking-wide text-muted">
        Parent notification
      </h2>
      {voided && summary.previouslyNotified ? (
        <Banner tone="warning" title="A text may already have been received">
          Texts can’t be recalled. The entry is corrected in History for everyone.
        </Banner>
      ) : null}
      {summary.mode === 'OFF' ? (
        <p className="text-[15px]">
          Texts are off. Everyone in the family sees this entry in History.
        </p>
      ) : null}
      {summary.mode === 'AUTOMATIC' && summary.recipients.length ? (
        <div className="flex flex-col gap-1">
          <p className="font-semibold">
            {automatic.length ? 'Saved. Automatic texts:' : 'Saved. No automatic text was queued:'}
          </p>
          <ul className="flex flex-col gap-1 text-[15px]" aria-live="polite">
            {summary.recipients.map((r) => (
              <li key={r.userId}>
                <strong>{r.displayName}</strong> — {recipientStatusText(r.state, r.reason)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {summary.mode === 'AUTOMATIC' && !summary.recipients.length ? (
        <p className="text-[15px]">
          Saved. No automatic text was queued (no parent has verified texts turned on for this kind
          of entry).
        </p>
      ) : null}
      {summary.draftText && !voided ? (
        <>
          <p className="font-semibold">Saved. Text not sent — tap to share.</p>
          <ShareActions text={summary.draftText} />
        </>
      ) : null}
    </section>
  )
}
