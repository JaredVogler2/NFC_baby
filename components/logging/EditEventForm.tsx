'use client'

import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { KIND } from '@/components/logging/kind'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/form'
import { Banner } from '@/components/ui/primitives'
import type { CareEvent } from '@/lib/domain/event'
import type { DiaperSubtype } from '@/lib/domain/intents'
import { DIAPER_NOTE_TEMPLATES, FEED_NOTE_TEMPLATES } from '@/lib/domain/notes'
import type { FeedingInput } from '@/lib/domain/schemas'
import { apiFetch } from '@/lib/http/client'
import type { FormState } from '@/lib/logging/attempt'
import { localDateKey, localTimeValue } from '@/lib/time/zoned'
import { NotesField } from './NotesField'
import { resolveWhen, TimePicker } from './TimePicker'

const DIAPER_OPTIONS = (['WET', 'POOP', 'BOTH'] as const).map((s) => ({
  value: s,
  label: s === 'BOTH' ? 'Wet + poop' : KIND[s].label.split(' ')[0]!,
}))

export type FeedEditSlot = {
  form: FormState
  update: (patch: Partial<FormState>) => void
  fieldErrors: Record<string, string>
}

/** Correct an entry. Sends the revision this person saw, so a partner's change is never overwritten. */
export function EditEventForm({
  event,
  timezone,
  initialFeedForm,
  renderFeeding,
  feedingFromForm,
  onDone,
}: {
  event: CareEvent
  timezone: string
  initialFeedForm?: FormState
  renderFeeding?: (slot: FeedEditSlot) => ReactNode
  feedingFromForm?: (form: FormState) => FeedingInput | null
  onDone?: () => void
}) {
  const router = useRouter()
  const occurred = new Date(event.occurredAt)
  const [subtype, setSubtype] = useState(event.subtype)
  const [when, setWhen] = useState({
    mode: 'custom' as const,
    date: localDateKey(occurred, timezone),
    time: localTimeValue(occurred, timezone),
    ambiguityChoice: 0,
  })
  const [notes, setNotes] = useState(event.notes ?? '')
  const [notesOpen, setNotesOpen] = useState(Boolean(event.notes))
  const [feedForm, setFeedForm] = useState<FormState | undefined>(initialFeedForm)
  const [confirmOld, setConfirmOld] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{
    tone: 'success' | 'warning' | 'danger'
    title: string
    text: string
    reload?: boolean
    confirmOld?: boolean
  } | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const resolved = resolveWhen({ ...when, mode: 'custom' }, timezone, Date.now())
    if (resolved.error || !resolved.occurredAt) {
      setFieldErrors({ occurredAt: resolved.error ?? 'Choose a time.' })
      return
    }
    // Keep the exact stored instant when the minute shown is unchanged (avoid second drift).
    const sameMinute =
      localDateKey(occurred, timezone) === when.date &&
      localTimeValue(occurred, timezone) === when.time
    const patch: Record<string, unknown> = {
      occurredAt: sameMinute ? event.occurredAt : resolved.occurredAt,
      notes: notes,
    }
    if (event.eventType === 'DIAPER') patch.subtype = subtype
    if (event.eventType === 'FEED' && feedForm && feedingFromForm) {
      const feeding = feedingFromForm(feedForm)
      if (feeding) {
        patch.subtype = feeding.method
        patch.feeding = feeding
      }
    }
    setBusy(true)
    setFieldErrors({})
    setResult(null)
    const res = await apiFetch<{ changed: boolean; previouslyNotified: boolean }>(
      `/api/v1/events/${event.id}`,
      {
        method: 'PATCH',
        body: { expectedRevision: event.revision, confirmOld: confirmOld || undefined, patch },
      },
    )
    setBusy(false)
    if (!res.ok) {
      if (res.code === 'CONFLICT' && res.details?.reason === 'REVISION_CONFLICT') {
        setResult({
          tone: 'warning',
          title: 'Someone else changed this entry',
          text: 'Your changes were not saved, so nothing was overwritten. Reload to see the latest version, then make your change again.',
          reload: true,
        })
        return
      }
      if (res.details?.confirmOld) {
        setResult({
          tone: 'warning',
          title: 'That’s more than a day ago',
          text: res.message,
          confirmOld: true,
        })
        return
      }
      setFieldErrors(res.fields ?? {})
      setResult({ tone: 'danger', title: 'Not saved', text: res.message })
      return
    }
    if (!res.data.changed) {
      setResult({
        tone: 'success',
        title: 'No changes',
        text: 'Nothing was different, so nothing was saved.',
      })
      return
    }
    setResult({
      tone: res.data.previouslyNotified ? 'warning' : 'success',
      title: 'Changes saved',
      text: res.data.previouslyNotified
        ? 'The original text may already have been received — texts can’t be corrected or recalled. History now shows the correct details for everyone.'
        : 'Everyone in the family now sees the corrected entry. The change is recorded in the history of changes.',
    })
    onDone?.()
    router.refresh()
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      {event.eventType === 'DIAPER' ? (
        <Segmented
          legend="Type"
          name="edit-subtype"
          value={subtype as DiaperSubtype}
          options={DIAPER_OPTIONS}
          onChange={(v) => setSubtype(v)}
          size="md"
        />
      ) : null}
      {event.eventType === 'FEED' && feedForm && renderFeeding
        ? renderFeeding({
            form: feedForm,
            update: (p) => setFeedForm((f) => (f ? { ...f, ...p } : f)),
            fieldErrors,
          })
        : null}
      <TimePicker
        value={when}
        onChange={(v) => {
          setWhen({ ...v, mode: 'custom' })
          setConfirmOld(false)
        }}
        timezone={timezone}
        error={fieldErrors.occurredAt}
      />
      <NotesField
        value={notes}
        onChange={setNotes}
        open={notesOpen}
        onOpenChange={setNotesOpen}
        templates={event.eventType === 'FEED' ? FEED_NOTE_TEMPLATES : DIAPER_NOTE_TEMPLATES}
        error={fieldErrors.notes}
      />
      {result ? (
        <Banner
          tone={result.tone}
          role={result.tone === 'success' ? 'status' : 'alert'}
          title={result.title}
          action={
            result.reload ? (
              <Button size="md" onClick={() => router.refresh()}>
                Reload latest
              </Button>
            ) : result.confirmOld ? (
              <Button
                size="md"
                onClick={() => {
                  setConfirmOld(true)
                  setResult(null)
                }}
              >
                Yes, that time is right
              </Button>
            ) : undefined
          }
        >
          {result.text}
        </Banner>
      ) : null}
      <Button type="submit" block disabled={busy}>
        {busy ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  )
}
