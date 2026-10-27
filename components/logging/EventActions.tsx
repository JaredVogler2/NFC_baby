'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { PencilIcon, UndoIcon } from '@/components/icons'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Banner } from '@/components/ui/primitives'
import type { CareEvent } from '@/lib/domain/event'
import { apiFetch } from '@/lib/http/client'
import { EditEventFormForEvent } from './EditEventFormForEvent'

/** Edit / Undo controls on the entry details page. */
export function EventActions({
  event,
  timezone,
  previouslyNotified,
}: {
  event: CareEvent
  timezone: string
  previouslyNotified: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{
    tone: 'warning' | 'danger' | 'info'
    text: string
  } | null>(null)

  async function undo() {
    setBusy(true)
    const res = await apiFetch<{ previouslyNotified: boolean }>(`/api/v1/events/${event.id}/void`, {
      method: 'POST',
      body: { expectedRevision: event.revision, reason: 'Undone from history' },
    })
    setBusy(false)
    setConfirming(false)
    if (!res.ok) {
      setMessage({
        tone: res.code === 'CONFLICT' ? 'warning' : 'danger',
        text:
          res.code === 'CONFLICT'
            ? 'Someone else changed this entry. Reload to see the latest version before undoing.'
            : res.message,
      })
      return
    }
    setMessage({
      tone: 'info',
      text: res.data.previouslyNotified
        ? 'Entry undone. A text about it may already have been received — texts can’t be recalled.'
        : 'Entry undone. It no longer counts in Home or History totals.',
    })
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      {message ? (
        <Banner tone={message.tone} role="status">
          {message.text}
        </Banner>
      ) : null}
      {editing ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          {previouslyNotified ? (
            <Banner
              tone="warning"
              title="A text may already have been sent for this entry"
              className="mb-4"
            >
              Editing corrects History for everyone, but the original text may already have been
              received. No correction text is sent.
            </Banner>
          ) : null}
          <EditEventFormForEvent event={event} timezone={timezone} />
          <Button variant="ghost" block className="mt-2" onClick={() => setEditing(false)}>
            Close editor
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            icon={<PencilIcon size={20} />}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
          <Button
            variant="secondary"
            icon={<UndoIcon size={20} />}
            onClick={() => setConfirming(true)}
          >
            Undo this entry
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title="Undo this entry?"
        confirmLabel="Undo entry"
        busy={busy}
        onConfirm={undo}
        onCancel={() => setConfirming(false)}
      >
        It will be removed from Home and History totals for everyone and kept in the history of
        changes.
        {previouslyNotified
          ? ' A text about it may already have been received; texts can’t be recalled.'
          : ''}
      </ConfirmDialog>
    </div>
  )
}
