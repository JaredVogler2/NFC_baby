'use client'

import { useSyncExternalStore } from 'react'
import { OfflineIcon } from '@/components/icons'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Browser's view of connectivity. "Online" can still mean a dead network; saves handle that. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  )
}

/** Full-width notice under the page header while the phone reports no connection. */
export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div
      role="status"
      className="mx-auto flex w-full max-w-[480px] items-center gap-2 px-4 pt-3 text-[15px]"
    >
      <span className="flex w-full items-center gap-2 rounded-xl border border-border-strong bg-surface-2 px-3 py-2">
        <OfflineIcon size={18} />
        <span>
          <strong>Offline.</strong> You’re seeing the last loaded data. New entries can wait on this
          phone until you’re back online.
        </span>
      </span>
    </div>
  )
}

/** Compact indicator for focused logging screens. */
export function OfflinePill() {
  const online = useOnline()
  if (online) return null
  return (
    <span
      role="status"
      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border-strong bg-surface-2 px-3 text-sm font-semibold"
    >
      <OfflineIcon size={16} />
      Offline
    </span>
  )
}
