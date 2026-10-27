'use client'

import { useEffect, useState } from 'react'
import { listDrafts } from '@/lib/offline/drafts'
import { syncAll } from '@/lib/offline/sync'

/**
 * On logging screens: earlier entries kept on this phone are synced as soon as there is a
 * connection (they were deliberately saved before; scanning this sticker adds nothing by itself).
 * Stickers open in Safari, so this is where Safari-side pending entries get a chance to sync.
 */
export function PendingNotice({ userId, householdId }: { userId: string; householdId: string }) {
  const [left, setLeft] = useState(0)
  const [synced, setSynced] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const drafts = await listDrafts(userId)
        if (cancelled || drafts.length === 0) return
        // Only entries that existed when this screen opened: one kept on this very screen is
        // synced from Home, so this screen never contradicts its own "pending" message.
        if (navigator.onLine) {
          const result = await syncAll(userId, householdId)
          if (cancelled) return
          setSynced((n) => n + result.saved.length)
        }
        const remaining = await listDrafts(userId)
        if (!cancelled) setLeft(remaining.length)
      } catch {
        // storage unavailable: nothing to show
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, householdId])

  if (left === 0 && synced === 0) return null
  return (
    <p
      role="status"
      className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-3 py-2 text-[15px]"
    >
      {synced > 0
        ? `${synced === 1 ? '1 earlier entry' : `${synced} earlier entries`} from this phone ${
            synced === 1 ? 'is' : 'are'
          } now in the shared history. `
        : ''}
      {left > 0
        ? `${left === 1 ? '1 earlier entry is' : `${left} earlier entries are`} still pending on this phone, not in shared history — open Home to review.`
        : ''}
    </p>
  )
}
