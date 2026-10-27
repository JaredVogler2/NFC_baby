'use client'

import { useEffect } from 'react'

/**
 * Registers the small service worker (offline fallback + cached build assets) in production.
 * The app works fully without it; registration failures are ignored.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    const version = encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev')
    const register = () => {
      navigator.serviceWorker
        .register(`/sw.js?v=${version}`, { scope: '/', updateViaCache: 'none' })
        .catch(() => undefined)
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])
  return null
}
