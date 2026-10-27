'use client'

import { useEffect } from 'react'

/**
 * Safari can restore a page from its back/forward cache even though pages are sent no-store.
 * After signing out (or another person signing in), Back must never show the previous person's
 * screens from memory: reload from the server whenever a page comes back from that cache.
 */
export function BackForwardGuard() {
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload()
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])
  return null
}
