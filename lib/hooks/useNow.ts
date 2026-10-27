'use client'

import { useSyncExternalStore } from 'react'

/**
 * Shared ticking clock for "Now · 2:14 AM" and "14 min ago" labels. Returns 0 during server
 * render and hydration (so markup always matches), then the real time, refreshed every 15 s and
 * whenever the page becomes visible again (iOS resumes suspended tabs).
 */
let current = 0
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function tick() {
  current = Date.now()
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    timer = setInterval(tick, 15_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('pageshow', tick)
  }
  queueMicrotask(tick)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      if (timer) clearInterval(timer)
      timer = null
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('pageshow', tick)
    }
  }
}

export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => 0,
  )
}
