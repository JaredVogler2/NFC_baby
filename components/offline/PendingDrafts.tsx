'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { OfflineIcon } from '@/components/icons'
import { useOnline } from '@/components/layout/OfflineBanner'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Banner, SectionTitle } from '@/components/ui/primitives'
import { loginUrlFor } from '@/lib/auth/redirect'
import {
  countOtherUsersDrafts,
  deleteDraft,
  listDrafts,
  pruneExpiredDrafts,
  removeOtherUsersDrafts,
  updateDraft,
  type PendingDraft,
} from '@/lib/offline/drafts'
import { syncAll, type SyncAllResult } from '@/lib/offline/sync'
import { formatWhen } from '@/lib/time/zoned'

type Notice =
  | { kind: 'synced'; count: number }
  | { kind: 'halted'; reason: NonNullable<SyncAllResult['halted']> }
  | null

/**
 * Entries waiting on this phone. They are visibly separate from the shared history: a pending
 * entry is never shown as saved, counted in "Last fed", or texted to anyone until the server has
 * confirmed it. Sync starts automatically when online (the parent already tapped Save) and reuses
 * each entry's original request id, so it can never create a duplicate.
 */
export function PendingDrafts({
  userId,
  householdId,
  timezone,
  canSync = true,
}: {
  userId: string
  householdId: string
  timezone: string
  /** False on the offline fallback screen: list only. */
  canSync?: boolean
}) {
  const router = useRouter()
  const online = useOnline()
  const [drafts, setDrafts] = useState<PendingDraft[]>([])
  const [others, setOthers] = useState(0)
  const [expired, setExpired] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [discard, setDiscard] = useState<PendingDraft | null>(null)
  const [storageError, setStorageError] = useState(false)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    try {
      setDrafts(await listDrafts(userId))
      setOthers(await countOtherUsersDrafts(userId))
    } catch {
      setStorageError(true)
    }
  }, [userId])

  const sync = useCallback(async () => {
    if (busy.current || !canSync) return
    busy.current = true
    setSyncing(true)
    try {
      const result = await syncAll(userId, householdId)
      if (result.saved.length > 0) {
        setNotice({ kind: 'synced', count: result.saved.length })
        router.refresh()
      } else if (result.halted) {
        setNotice({ kind: 'halted', reason: result.halted })
      }
    } catch {
      setStorageError(true)
    } finally {
      busy.current = false
      setSyncing(false)
      await reload()
    }
  }, [canSync, householdId, reload, router, userId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const removed = await pruneExpiredDrafts()
        if (!cancelled && removed > 0) setExpired(removed)
      } catch {
        // storage unavailable: reload() reports it
      }
      await reload()
      if (!cancelled && canSync && navigator.onLine) await sync()
    })()
    const onOnline = () => void sync()
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
    }
  }, [reload, sync, canSync])

  async function confirmOldAndSync(d: PendingDraft) {
    await updateDraft(d.clientRequestId, {
      state: 'pending',
      needsConfirmOld: false,
      lastError: null,
      payload: { ...d.payload, confirmOld: true },
    })
    await sync()
  }

  const nothing = drafts.length === 0 && others === 0 && expired === 0 && !notice && !storageError
  if (nothing) return null

  return (
    <section
      aria-labelledby={drafts.length > 0 ? 'pending-title' : undefined}
      aria-label={drafts.length > 0 ? undefined : 'Pending entries'}
      className="flex flex-col gap-2"
    >
      {drafts.length > 0 ? (
        <>
          <SectionTitle id="pending-title">Pending on this phone</SectionTitle>
          <p className="text-[15px] text-muted">
            NOT yet in shared history; no text sent. Only this phone has{' '}
            {drafts.length === 1 ? 'it' : 'them'}.
          </p>
          <ul className="flex flex-col gap-2">
            {drafts.map((d) => (
              <li
                key={d.clientRequestId}
                data-testid="pending-draft"
                className="rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface-2 px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-muted">
                    <OfflineIcon size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {d.summary}{' '}
                      <span className="font-normal text-muted">· {d.childNickname}</span>
                    </p>
                    <p className="text-[15px] text-muted">
                      {d.payload.occurredAt
                        ? formatWhen(new Date(d.payload.occurredAt), timezone)
                        : ''}{' '}
                      ·{' '}
                      {d.sentBefore
                        ? 'May already be saved — checked with the same id when online'
                        : 'Pending on this device'}
                    </p>
                    {d.lastError ? (
                      <p className="mt-1 text-[15px]" role="status">
                        {d.lastError}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {d.needsConfirmOld && canSync ? (
                        <Button
                          size="md"
                          variant="primary"
                          disabled={syncing || !online}
                          onClick={() => void confirmOldAndSync(d)}
                        >
                          Yes, save with that time
                        </Button>
                      ) : null}
                      <Button
                        size="md"
                        variant="ghost"
                        disabled={syncing}
                        onClick={() => setDiscard(d)}
                      >
                        Discard
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {canSync ? (
            <Button
              variant="secondary"
              block
              disabled={syncing || !online}
              onClick={() => void sync()}
            >
              {syncing ? 'Syncing…' : online ? 'Sync now' : 'Waiting for connection'}
            </Button>
          ) : null}
        </>
      ) : null}

      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {notice?.kind === 'synced' ? (
          <Banner tone="success" title="Synced">
            {notice.count === 1 ? '1 pending entry is' : `${notice.count} pending entries are`} now
            in the shared history.
          </Banner>
        ) : null}
        {notice?.kind === 'halted' && notice.reason === 'auth' ? (
          <Banner
            tone="warning"
            title="Sign in again to sync"
            action={
              <Link
                href={loginUrlFor('/dashboard')}
                className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-semibold text-primary-fg"
              >
                Sign in
              </Link>
            }
          >
            Your pending entries stay on this phone until you do.
          </Banner>
        ) : null}
        {notice?.kind === 'halted' && notice.reason === 'wrong_user' ? (
          <Banner tone="warning" title="Not synced">
            A different account is signed in on this phone, so nothing was uploaded.
          </Banner>
        ) : null}
        {notice?.kind === 'halted' && notice.reason === 'offline' && drafts.length > 0 ? (
          <Banner tone="offline" title="Still offline">
            Nothing was uploaded. We’ll try again when the connection is back.
          </Banner>
        ) : null}
        {expired > 0 ? (
          <Banner tone="warning" title="Old pending entries removed">
            {expired === 1 ? '1 entry' : `${expired} entries`} waited on this phone for more than 7
            days and {expired === 1 ? 'was' : 'were'} removed from it. Anything that had already
            reached the server is in History; the rest was not saved.
          </Banner>
        ) : null}
        {others > 0 ? (
          <Banner
            tone="info"
            title="Entries from another sign-in"
            action={
              <Button
                size="md"
                variant="secondary"
                onClick={() => void removeOtherUsersDrafts(userId).then(reload)}
              >
                Remove them from this phone
              </Button>
            }
          >
            {others === 1 ? '1 pending entry' : `${others} pending entries`} saved by someone else
            on this phone. They only sync when that person signs in here.
          </Banner>
        ) : null}
        {storageError ? (
          <Banner tone="warning" title="Can’t read this phone’s pending entries">
            This browser is blocking app storage (private browsing or storage full).
          </Banner>
        ) : null}
      </div>

      <ConfirmDialog
        open={discard !== null}
        title="Discard this pending entry?"
        confirmLabel="Discard"
        onCancel={() => setDiscard(null)}
        onConfirm={() => {
          const d = discard
          setDiscard(null)
          if (d) void deleteDraft(d.clientRequestId).then(reload)
        }}
      >
        {discard?.sentBefore
          ? 'An earlier attempt may have reached the server — check History. Discarding only removes it from this phone.'
          : 'It was never added to the shared history, so it will be gone for good. Nothing else changes.'}
      </ConfirmDialog>
    </section>
  )
}
