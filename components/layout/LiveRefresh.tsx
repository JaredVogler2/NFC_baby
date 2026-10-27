'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { RefreshIcon } from '@/components/icons'
import { formatTime } from '@/lib/time/zoned'

const POLL_MS = 20_000

/**
 * Keeps a shared screen current without websockets: re-fetches the server data when the page
 * becomes visible again (iOS resumes suspended tabs), on bfcache restore, and every 20 s while
 * visible. Shows when it last updated so nobody mistakes polling for live sync.
 */
export function LiveRefresh({ timezone }: { timezone: string }) {
  const router = useRouter()
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const last = useRef(0)

  const refresh = useCallback(
    (force = false) => {
      const now = Date.now()
      // Offline, a refresh would replace the last loaded data with the offline page: keep it.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      // focus + visibilitychange often fire together: collapse bursts within a second.
      if (!force && now - last.current < 1_000) return
      last.current = now
      startTransition(() => {
        router.refresh()
        setUpdatedAt(Date.now())
      })
    },
    [router],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial stamp after hydration
    setUpdatedAt(Date.now())
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) refresh(true)
    }
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('pageshow', onShow)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('pageshow', onShow)
    }
  }, [refresh])

  return (
    <button
      type="button"
      onClick={() => refresh(true)}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-text"
      aria-label={
        updatedAt ? `Refresh. Updated ${formatTime(new Date(updatedAt), timezone)}` : 'Refresh'
      }
    >
      <span className="tabular" aria-hidden="true">
        {updatedAt ? `Updated ${formatTime(new Date(updatedAt), timezone)}` : ''}
      </span>
      <RefreshIcon size={18} className={pending ? 'animate-spin' : ''} />
    </button>
  )
}
