'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CloseIcon } from '@/components/icons'
import { Button } from '@/components/ui/Button'
import { Banner } from '@/components/ui/primitives'
import { loginUrlFor } from '@/lib/auth/redirect'
import { DIAPER_NOTE_TEMPLATES, FEED_NOTE_TEMPLATES } from '@/lib/domain/notes'
import type { Intent } from '@/lib/domain/intents'
import type { FeedingInput } from '@/lib/domain/schemas'
import { createEventSchema } from '@/lib/domain/schemas'
import { apiFetch, isUncertainWriteFailure, type ApiResult } from '@/lib/http/client'
import {
  clearSnapshot,
  loadSnapshot,
  newRequestId,
  safeSessionStorage,
  saveSnapshot,
  type FormState,
} from '@/lib/logging/attempt'
import { KIND, KindBadge } from './kind'
import { NotesField } from './NotesField'
import { resolveWhen, TimePicker } from './TimePicker'

export type LogFormProps = {
  intent: Intent
  userId: string
  child: { id: string; nickname: string }
  tagToken: string | null
  tagLabel: string | null
  timezone: string
  volumeUnit: 'oz' | 'ml'
  /** Path of this screen, used to come back after re-authentication. */
  returnPath: string
  /** Feeding section (phase 06) renders here and reports its payload. */
  renderFeeding?: (props: FeedingSlotProps) => ReactNode
  /** Initial feeding form values (suggestions are visible, never silently submitted). */
  initialFeeding?: Partial<FormState>
  /** Optional panel shown above the form (e.g. sticker scan-test for admins). */
  topSlot?: ReactNode
}

export type FeedingSlotProps = {
  form: FormState
  update: (patch: Partial<FormState>) => void
  fieldErrors: Record<string, string>
  disabled: boolean
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'checking' }
  | { kind: 'uncertain' }
  | { kind: 'not_saved'; message: string }
  | { kind: 'offline' }
  | { kind: 'auth' }
  | { kind: 'confirm_old'; message: string }
  | { kind: 'gone' }
  | { kind: 'error'; message: string }

const EMPTY_FORM: FormState = {
  whenMode: 'now',
  date: '',
  time: '',
  ambiguityChoice: 0,
  notes: '',
  notesOpen: false,
  feedMethod: null,
  milkType: null,
  amount: '',
  amountUnit: 'oz',
  amountUnknown: false,
  side: null,
  durationMinutes: '',
  confirmOld: false,
}

/** Build the feeding payload from form state (null when the intent is not FEED or incomplete). */
export function feedingFromForm(form: FormState): FeedingInput | null {
  if (form.feedMethod === 'BOTTLE') {
    const value = form.amount.trim() === '' ? null : Number(form.amount.replace(',', '.'))
    return {
      method: 'BOTTLE',
      milkType: form.milkType ?? ('' as never),
      amountUnknown: form.amountUnknown,
      amountValue: form.amountUnknown ? null : value,
      amountUnit: form.amountUnknown ? null : form.amountUnit,
    }
  }
  if (form.feedMethod === 'NURSING') {
    const minutes = form.durationMinutes.trim() === '' ? null : Number(form.durationMinutes)
    return {
      method: 'NURSING',
      side: form.side ?? 'UNKNOWN',
      durationSeconds: minutes === null || Number.isNaN(minutes) ? null : Math.round(minutes * 60),
    }
  }
  return null
}

export function LogForm(props: LogFormProps) {
  const { intent, userId, child, tagToken, timezone, returnPath } = props
  const router = useRouter()
  const kind = KIND[intent]
  const formKey = tagToken ? `tag:${tagToken}` : `log:${intent}:${child.id}`

  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY_FORM,
    amountUnit: props.volumeUnit,
    ...props.initialFeeding,
  }))
  const [requestId, setRequestId] = useState<string>(() => newRequestId())
  const [sent, setSent] = useState(false)
  const [restored, setRestored] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const busyRef = useRef(false)

  // Restore an unsaved attempt for this same user (e.g. after signing in again).
  useEffect(() => {
    const snap = loadSnapshot(safeSessionStorage(), userId, formKey)
    if (snap) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage
      setForm(snap.form)
      setRequestId(snap.clientRequestId)
      setSent(snap.sent)
      setRestored(true)
    }
  }, [userId, formKey])

  const update = useCallback(
    (patch: Partial<FormState>) => {
      setForm((f) => ({ ...f, ...patch }))
      setFieldErrors({})
      if (status.kind === 'not_saved' || status.kind === 'error' || status.kind === 'confirm_old') {
        setStatus({ kind: 'idle' })
      }
    },
    [status.kind],
  )

  /** Resolve the time and build the request at the moment of Save (not at render). */
  function buildPayload() {
    const when = resolveWhen(
      {
        mode: form.whenMode,
        date: form.date,
        time: form.time,
        ambiguityChoice: form.ambiguityChoice,
      },
      timezone,
      Date.now(),
    )
    return {
      whenError: when.error,
      payload: {
        clientRequestId: requestId,
        intent,
        tagToken: tagToken ?? undefined,
        childId: tagToken ? undefined : child.id,
        occurredAt: when.occurredAt ?? undefined,
        confirmOld: form.confirmOld || undefined,
        notes: form.notes,
        feeding: intent === 'FEED' ? feedingFromForm(form) : undefined,
      },
    }
  }

  const persist = useCallback(
    (wasSent: boolean) =>
      saveSnapshot(safeSessionStorage(), {
        userId,
        formKey,
        clientRequestId: requestId,
        sent: wasSent,
        form,
      }),
    [userId, formKey, requestId, form],
  )

  const finish = useCallback(
    (eventId: string) => {
      clearSnapshot(safeSessionStorage(), userId, formKey)
      // Replace: Back from the success screen must not return to a filled-in form.
      router.replace(`/saved/${eventId}`)
    },
    [router, userId, formKey],
  )

  /** After an uncertain failure, ask the server whether this exact attempt committed. */
  const checkStatus = useCallback(async (): Promise<'saved' | 'not_saved' | 'unknown'> => {
    setStatus({ kind: 'checking' })
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await apiFetch<{ event: { id: string } }>(
        `/api/v1/events/by-request/${requestId}`,
        {
          timeoutMs: 8_000,
        },
      )
      if (res.ok) {
        finish(res.data.event.id)
        return 'saved'
      }
      if (res.kind === 'http' && res.status === 404) return 'not_saved'
      if (res.kind === 'http' && res.status === 401) {
        setStatus({ kind: 'auth' })
        return 'unknown'
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    }
    setStatus({ kind: 'uncertain' })
    return 'unknown'
  }, [requestId, finish])

  async function save() {
    if (busyRef.current) return
    const { whenError, payload } = buildPayload()
    if (whenError) {
      setFieldErrors({ occurredAt: whenError })
      return
    }
    const parsed = createEventSchema.safeParse(payload)
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.')
        if (!errs[key]) errs[key] = issue.message
      }
      setFieldErrors(errs)
      return
    }
    busyRef.current = true
    setStatus({ kind: 'saving' })
    setFieldErrors({})
    persist(true)
    setSent(true)
    const res: ApiResult<{ event: { id: string } }> = await apiFetch('/api/v1/events', {
      method: 'POST',
      body: payload,
    })
    busyRef.current = false
    if (res.ok) {
      finish(res.data.event.id)
      return
    }
    if (res.kind === 'offline') {
      setStatus({ kind: 'offline' })
      return
    }
    if (isUncertainWriteFailure(res)) {
      const outcome = await checkStatus()
      if (outcome === 'not_saved') {
        setStatus({
          kind: 'not_saved',
          message: 'Not saved — check your connection and try again.',
        })
      }
      return
    }
    switch (res.code) {
      case 'UNAUTHENTICATED':
        setStatus({ kind: 'auth' })
        return
      case 'GONE':
        setStatus({ kind: 'gone' })
        return
      case 'IDEMPOTENCY_MISMATCH': {
        // An earlier attempt with this id may have saved different values: find out.
        const outcome = await checkStatus()
        if (outcome === 'not_saved') {
          setRequestId(newRequestId())
          setStatus({ kind: 'not_saved', message: 'Not saved yet. Tap Save again.' })
        }
        return
      }
      case 'VALIDATION':
        if (res.details?.confirmOld) {
          setStatus({ kind: 'confirm_old', message: res.message })
          return
        }
        setFieldErrors(res.fields ?? {})
        setStatus({ kind: 'error', message: res.message })
        return
      default:
        setStatus({ kind: 'not_saved', message: `Not saved. ${res.message}` })
    }
  }

  const saving = status.kind === 'saving' || status.kind === 'checking'
  const locked = saving || status.kind === 'uncertain' || (sent && status.kind === 'auth')
  const saveLabel = saveButtonLabel(intent, form)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <header className="pt-safe flex items-center justify-between px-4 pb-1">
        <Link
          href="/dashboard"
          className="-ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:text-text"
        >
          <CloseIcon />
          <span className="sr-only">Cancel and go home</span>
        </Link>
        {props.tagLabel ? (
          <span className="truncate text-sm text-muted">Sticker: {props.tagLabel}</span>
        ) : null}
      </header>

      <main id="main" className="flex flex-1 flex-col gap-5 px-4 pb-40">
        <div className="flex items-center gap-4 pt-2">
          <KindBadge intent={intent} size="lg" />
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-bold leading-tight">{kind.title}</h1>
            <p className="text-[17px] text-muted">
              for <strong className="text-text">{child.nickname}</strong>
            </p>
          </div>
        </div>

        {props.topSlot}

        {restored ? (
          <Banner tone="info" role="status" title="Your unsaved entry is back">
            Review it and tap Save. Nothing was recorded yet
            {sent ? ' unless we confirm it below' : ''}.
          </Banner>
        ) : null}

        <TimePicker
          value={{
            mode: form.whenMode,
            date: form.date,
            time: form.time,
            ambiguityChoice: form.ambiguityChoice,
          }}
          onChange={(v) =>
            update({
              whenMode: v.mode,
              date: v.date,
              time: v.time,
              ambiguityChoice: v.ambiguityChoice,
              confirmOld: false,
            })
          }
          timezone={timezone}
          error={fieldErrors.occurredAt}
        />

        {intent === 'FEED' && props.renderFeeding
          ? props.renderFeeding({ form, update, fieldErrors, disabled: locked })
          : null}

        <NotesField
          value={form.notes}
          onChange={(notes) => update({ notes })}
          open={form.notesOpen}
          onOpenChange={(notesOpen) => update({ notesOpen })}
          templates={intent === 'FEED' ? FEED_NOTE_TEMPLATES : DIAPER_NOTE_TEMPLATES}
          error={fieldErrors.notes}
        />

        <StatusPanel
          status={status}
          returnPath={returnPath}
          onRetry={() => void save()}
          onCheck={() =>
            void checkStatus().then(
              (o) =>
                o === 'not_saved' &&
                setStatus({ kind: 'not_saved', message: 'Not saved — try again.' }),
            )
          }
          onConfirmOld={() => {
            update({ confirmOld: true })
            setStatus({ kind: 'idle' })
          }}
          beforeLogin={() => persist(sent)}
        />
      </main>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 pt-3 backdrop-blur supports-[backdrop-filter]:bg-bg/85">
        <div className="mx-auto max-w-[480px] px-4">
          <Button
            variant={kind.variant}
            size="xl"
            block
            onClick={() => void save()}
            disabled={locked || status.kind === 'gone'}
            aria-describedby="save-status"
          >
            {status.kind === 'saving'
              ? 'Saving…'
              : status.kind === 'checking'
                ? 'Checking…'
                : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function saveButtonLabel(intent: Intent, form: FormState): string {
  switch (intent) {
    case 'WET':
      return 'Save wet diaper'
    case 'POOP':
      return 'Save poop diaper'
    case 'BOTH':
      return 'Save wet + poop'
    case 'FEED':
      if (form.feedMethod === 'NURSING') return 'Save nursing'
      if (form.feedMethod === 'BOTTLE') {
        if (form.amountUnknown) return 'Save bottle · amount not measured'
        if (form.amount.trim())
          return `Save bottle · ${form.amount.trim()} ${form.amountUnit === 'oz' ? 'oz' : 'mL'}`
        return 'Save bottle'
      }
      return 'Save feeding'
  }
}

function StatusPanel({
  status,
  returnPath,
  onRetry,
  onCheck,
  onConfirmOld,
  beforeLogin,
}: {
  status: Status
  returnPath: string
  onRetry: () => void
  onCheck: () => void
  onConfirmOld: () => void
  beforeLogin: () => void
}) {
  return (
    <div id="save-status" aria-live="polite" className="empty:hidden">
      {status.kind === 'checking' ? (
        <Banner tone="info" title="Can’t confirm the save yet — checking…">
          The connection dropped while saving. We’re asking the server whether it arrived.
        </Banner>
      ) : null}
      {status.kind === 'uncertain' ? (
        <Banner
          tone="warning"
          role="alert"
          title="Can’t confirm the save yet"
          action={
            <Button size="md" onClick={onCheck}>
              Check again
            </Button>
          }
        >
          It may or may not have been saved. Checking again is safe — it will never create a second
          entry.
        </Banner>
      ) : null}
      {status.kind === 'not_saved' ? (
        <Banner
          tone="danger"
          role="alert"
          title="Not saved"
          action={
            <Button size="md" onClick={onRetry}>
              Try again
            </Button>
          }
        >
          {status.message}
        </Banner>
      ) : null}
      {status.kind === 'offline' ? (
        <Banner
          tone="offline"
          role="alert"
          title="You’re offline — not saved"
          action={
            <Button size="md" onClick={onRetry}>
              Try again
            </Button>
          }
        >
          Nothing was sent. Your entry stays on this screen; tap Try again when you have signal.
        </Banner>
      ) : null}
      {status.kind === 'auth' ? (
        <Banner
          tone="warning"
          role="alert"
          title="Sign in again to save"
          action={
            <Link
              href={loginUrlFor(returnPath)}
              onClick={beforeLogin}
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-semibold text-primary-fg"
            >
              Sign in
            </Link>
          }
        >
          Your sign-in expired. Your entry is kept on this phone and will be here when you come
          back.
        </Banner>
      ) : null}
      {status.kind === 'confirm_old' ? (
        <Banner
          tone="warning"
          role="alert"
          title="That’s more than a day ago"
          action={
            <Button size="md" onClick={onConfirmOld}>
              Yes, that time is right
            </Button>
          }
        >
          {status.message} Then tap Save.
        </Banner>
      ) : null}
      {status.kind === 'gone' ? (
        <Banner tone="danger" role="alert" title="Sticker retired">
          This sticker was turned off, so nothing was saved. Log from{' '}
          <Link className="font-semibold underline" href="/dashboard">
            Home
          </Link>{' '}
          instead.
        </Banner>
      ) : null}
      {status.kind === 'error' ? (
        <Banner tone="danger" role="alert" title="Not saved">
          {status.message}
        </Banner>
      ) : null}
    </div>
  )
}
