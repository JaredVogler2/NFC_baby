'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CloseIcon } from '@/components/icons'
import { OfflinePill } from '@/components/layout/OfflineBanner'
import { Button } from '@/components/ui/Button'
import { Banner } from '@/components/ui/primitives'
import { loginUrlFor } from '@/lib/auth/redirect'
import { DIAPER_NOTE_TEMPLATES, FEED_NOTE_TEMPLATES } from '@/lib/domain/notes'
import type { Intent } from '@/lib/domain/intents'
import type { CreateEventInput, FeedingInput } from '@/lib/domain/schemas'
import { createEventSchema } from '@/lib/domain/schemas'
import { parseAmount } from '@/lib/domain/units'
import { apiFetch, isUncertainWriteFailure, type ApiResult } from '@/lib/http/client'
import {
  clearSnapshot,
  loadSnapshot,
  newRequestId,
  safeSessionStorage,
  saveSnapshot,
  timerStorageKey,
  type FormState,
} from '@/lib/logging/attempt'
import { formatTime } from '@/lib/time/zoned'
import { DraftLimitError, saveDraft } from '@/lib/offline/drafts'
import { draftSummary } from '@/lib/offline/sync'
import { KIND, KindBadge } from './kind'
import { NotesField } from './NotesField'
import { resolveWhen, TimePicker } from './TimePicker'

export type LogFormProps = {
  intent: Intent
  userId: string
  householdId: string
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
  /** `quiet` updates (e.g. a ticking timer) don't clear messages or field errors. */
  update: (patch: Partial<FormState>, quiet?: boolean) => void
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
  | { kind: 'pending_saved'; maybeSaved: boolean }
  | { kind: 'pending_failed'; message: string }
  | { kind: 'saved' }

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
    const typed = form.amount.trim()
    // Strict parse: anything that isn't a plain positive number is rejected (never coerced).
    const value = typed === '' ? null : (parseAmount(typed) ?? Number.NaN)
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
  /** The exact body of the last Save tap, and when it happened (for a pending draft). */
  const lastAttempt = useRef<{ payload: CreateEventInput; tappedAt: number } | null>(null)
  /**
   * When Save was tapped for an attempt that couldn't be confirmed (offline, lost response,
   * expired sign-in). Retries of that attempt keep this time instead of "now" at the retry.
   */
  const [pinnedAt, setPinnedAt] = useState<number | null>(null)

  // Restore an unsaved attempt for this same user (e.g. after signing in again).
  useEffect(() => {
    const snap = loadSnapshot(safeSessionStorage(), userId, formKey)
    if (snap) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage
      setForm(snap.form)
      setRequestId(snap.clientRequestId)
      setSent(snap.sent)
      setPinnedAt(snap.tappedAt ?? null)
      setRestored(true)
    }
  }, [userId, formKey])

  // Stable identity: children (e.g. the nursing timer) may call it from effects.
  const update = useCallback((patch: Partial<FormState>, quiet = false) => {
    setForm((f) => ({ ...f, ...patch }))
    if (quiet) return
    setFieldErrors({})
    setStatus((s) =>
      s.kind === 'not_saved' || s.kind === 'error' || s.kind === 'confirm_old'
        ? { kind: 'idle' }
        : s,
    )
  }, [])

  /**
   * Resolve the time and build the request at the moment of Save (not at render). "Now" is
   * decided by the server, except for a retry of an unconfirmed attempt, which keeps `pinAt`.
   */
  function buildPayload(pinAt: number | null) {
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
    const pinned = form.whenMode === 'now' && pinAt !== null ? new Date(pinAt).toISOString() : null
    return {
      whenError: when.error,
      payload: {
        clientRequestId: requestId,
        intent,
        tagToken: tagToken ?? undefined,
        // Always sent, also with a sticker: if the sticker was moved to another child since this
        // form was shown, the server refuses instead of filing the entry under the wrong child.
        childId: child.id,
        occurredAt: pinned ?? when.occurredAt ?? undefined,
        confirmOld: form.confirmOld || undefined,
        notes: form.notes,
        feeding: intent === 'FEED' ? feedingFromForm(form) : undefined,
      },
    }
  }

  const persist = useCallback(
    (wasSent: boolean, tappedAt: number | null) =>
      saveSnapshot(safeSessionStorage(), {
        userId,
        formKey,
        clientRequestId: requestId,
        sent: wasSent,
        tappedAt,
        form,
      }),
    [userId, formKey, requestId, form],
  )

  const clearLocal = useCallback(() => {
    clearSnapshot(safeSessionStorage(), userId, formKey)
    // A nursing timer belongs to this entry only; never let it fill in the next one.
    try {
      sessionStorage.removeItem(timerStorageKey(formKey))
    } catch {
      // ignore
    }
  }, [userId, formKey])

  const finish = useCallback(
    (eventId: string) => {
      clearLocal()
      // Say so here first: if the details page can't load (signal lost), this stays on screen.
      setStatus({ kind: 'saved' })
      // Replace: Back from the success screen must not return to a filled-in form.
      router.replace(`/saved/${eventId}`)
    },
    [router, clearLocal],
  )

  /** Remember the Save time of an attempt we couldn't confirm, so retries keep it. */
  const pin = useCallback(() => {
    const at = lastAttempt.current?.tappedAt ?? null
    if (at === null) return
    setPinnedAt((p) => p ?? at)
    persist(true, pinnedAt ?? at)
  }, [persist, pinnedAt])

  /** After an uncertain failure, ask the server whether this exact attempt committed. */
  const checkStatus = useCallback(async (): Promise<'saved' | 'not_saved' | 'unknown'> => {
    setStatus({ kind: 'checking' })
    for (let attempt = 0; attempt < 3; attempt++) {
      // Give a slow request that may still be committing a moment before asking.
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
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
    }
    setStatus({ kind: 'uncertain' })
    return 'unknown'
  }, [requestId, finish])

  async function save() {
    if (busyRef.current) return
    const { whenError, payload } = buildPayload(pinnedAt)
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
    lastAttempt.current = { payload, tappedAt: pinnedAt ?? Date.now() }
    setStatus({ kind: 'saving' })
    setFieldErrors({})
    persist(true, pinnedAt)
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
      pin()
      setStatus({ kind: 'offline' })
      return
    }
    // A lost response, a proxy error or any server error after the request arrived: the entry may
    // have been stored (and texts queued). Ask with the same id instead of claiming "not saved".
    if (isUncertainWriteFailure(res) || (res.kind === 'http' && res.status >= 500)) {
      pin()
      const outcome = await checkStatus()
      if (outcome === 'not_saved') {
        setStatus({
          kind: 'not_saved',
          message:
            'Not saved yet. Try again when you have signal — it can’t create a second entry.',
        })
      }
      return
    }
    switch (res.code) {
      case 'UNAUTHENTICATED':
        pin()
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

  /**
   * The parent already tapped Save; with no connection they may choose to keep that exact entry on
   * this phone. Same clientRequestId, time pinned to the moment of the tap. It is NOT an event yet.
   */
  async function keepPending() {
    const attempt = lastAttempt.current
    if (!attempt || busyRef.current) return
    // Offline means nothing was sent: keep what's on screen now (it may have been corrected), at
    // the time Save was first tapped. After an unconfirmed send the form is locked, so the body
    // must stay exactly what may already have reached the server.
    let base = attempt.payload
    if (status.kind === 'offline') {
      const current = buildPayload(attempt.tappedAt)
      const parsed = current.whenError ? null : createEventSchema.safeParse(current.payload)
      if (!parsed?.success) {
        setFieldErrors(
          current.whenError
            ? { occurredAt: current.whenError }
            : Object.fromEntries(
                (parsed?.error.issues ?? []).map((i) => [i.path.join('.'), i.message]),
              ),
        )
        return
      }
      base = current.payload
    }
    busyRef.current = true
    const payload: CreateEventInput = {
      ...base,
      occurredAt: base.occurredAt ?? new Date(attempt.tappedAt).toISOString(),
      offlineSync: true,
    }
    try {
      await saveDraft({
        v: 1,
        clientRequestId: payload.clientRequestId,
        userId,
        householdId: props.householdId,
        childId: child.id,
        childNickname: child.nickname,
        intent,
        tagLabel: props.tagLabel,
        payload,
        summary: draftSummary(intent, payload.feeding),
        createdAt: attempt.tappedAt,
        sentBefore: status.kind === 'uncertain',
        state: 'pending',
        lastError: null,
        needsConfirmOld: false,
      })
      clearLocal()
      setStatus({ kind: 'pending_saved', maybeSaved: status.kind === 'uncertain' })
    } catch (e) {
      setStatus({
        kind: 'pending_failed',
        message:
          e instanceof DraftLimitError
            ? `${e.message} Sync or discard some on Home first.`
            : 'This browser won’t let the app store it (private browsing or storage full).',
      })
    } finally {
      busyRef.current = false
    }
  }

  const saving = status.kind === 'saving' || status.kind === 'checking'
  const locked =
    saving ||
    status.kind === 'uncertain' ||
    status.kind === 'pending_saved' ||
    status.kind === 'saved' ||
    (sent && status.kind === 'auth')
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
        <div className="flex min-w-0 items-center gap-2">
          <OfflinePill />
          {props.tagLabel ? (
            <span className="truncate text-sm text-muted">Sticker: {props.tagLabel}</span>
          ) : null}
        </div>
      </header>

      <main id="main" className="flex flex-1 flex-col gap-5 px-4 pb-40">
        {/* Wraps under the badge at very narrow widths (e.g. 200% zoom) instead of clipping. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
          <KindBadge intent={intent} size="lg" />
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h1 className="font-display text-[28px] font-bold leading-tight">{kind.title}</h1>
            <p className="text-[17px] text-muted">
              for <strong className="text-text">{child.nickname}</strong>
            </p>
          </div>
        </div>

        {props.topSlot}

        {restored ? (
          <Banner tone="info" role="status" title="Your entry is back">
            Review it and tap Save.
            {sent
              ? ' If it already reached the server, Save just confirms it — it can’t be added twice.'
              : ' Nothing was recorded yet.'}
            {pinnedAt !== null && form.whenMode === 'now'
              ? ` It keeps the time you first tapped Save (${formatTime(new Date(pinnedAt), timezone)}).`
              : ''}
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
                setStatus({
                  kind: 'not_saved',
                  message: 'Not saved yet. Trying again is safe — it can’t create a second entry.',
                }),
            )
          }
          onConfirmOld={() => {
            update({ confirmOld: true })
            setStatus({ kind: 'idle' })
          }}
          onKeepPending={() => void keepPending()}
          beforeLogin={() => persist(sent, pinnedAt ?? lastAttempt.current?.tappedAt ?? null)}
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
  onKeepPending,
  beforeLogin,
}: {
  status: Status
  returnPath: string
  onRetry: () => void
  onCheck: () => void
  onConfirmOld: () => void
  onKeepPending: () => void
  beforeLogin: () => void
}) {
  const keepButton = (
    <Button size="md" variant="primary" onClick={onKeepPending}>
      Keep as pending on this phone
    </Button>
  )
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
            <div className="flex flex-wrap gap-2">
              <Button size="md" variant="secondary" onClick={onCheck}>
                Check again
              </Button>
              {keepButton}
            </div>
          }
        >
          It may or may not have been saved. Checking again is safe — it will never create a second
          entry. No signal? Keep it on this phone; it syncs with the same id, so it can’t be added
          twice.
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
            <div className="flex flex-wrap gap-2">
              {keepButton}
              <Button size="md" variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            </div>
          }
        >
          Nothing was sent. Keep it as pending on this phone and it will be added when you’re back
          online, or tap Try again when you have signal.
        </Banner>
      ) : null}
      {status.kind === 'saved' ? (
        <Banner tone="success" role="status" title="Saved ✓">
          It’s in the shared history. Opening the details…
        </Banner>
      ) : null}
      {status.kind === 'pending_saved' && status.maybeSaved ? (
        <Banner
          tone="offline"
          role="status"
          title="Kept on this phone — may already be saved"
          action={
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center rounded-xl border border-border-strong bg-surface px-4 font-semibold"
            >
              Done
            </Link>
          }
        >
          The connection dropped while saving, so it may already be in the shared history (and a
          text may have gone out). When you’re back online, NFC Baby checks with the same id and
          keeps exactly one entry.
        </Banner>
      ) : null}
      {status.kind === 'pending_saved' && !status.maybeSaved ? (
        <Banner
          tone="offline"
          role="status"
          title="Pending on this device — NOT yet in shared history; no text sent."
          action={
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center rounded-xl border border-border-strong bg-surface px-4 font-semibold"
            >
              Done
            </Link>
          }
        >
          Only this phone has it. It will be added to the shared history when you’re back online and
          open NFC Baby — you’ll see it on Home until then.
        </Banner>
      ) : null}
      {status.kind === 'pending_failed' ? (
        <Banner tone="danger" role="alert" title="Couldn’t keep it on this phone">
          {status.message} Not saved: keep this screen open and tap Save when you have signal.
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
