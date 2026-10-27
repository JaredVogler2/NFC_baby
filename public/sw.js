/*
 * NFC Baby service worker — deliberately small.
 *
 * What it caches: hashed build assets (/_next/static/*), app icons, the manifest, and one
 * offline fallback page fetched WITHOUT cookies (so it can never contain family data).
 * What it never caches: API responses, signed-in pages, or anything with family data.
 * Navigations always go to the network first; the offline page is used only when that fails.
 * Caches are versioned by build (the ?v= on the registration URL); old ones are deleted.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const STATIC_CACHE = `nfcb-static-${VERSION}`
const OFFLINE_CACHE = `nfcb-offline-${VERSION}`
const OFFLINE_URL = '/offline'
const CORE_ASSETS = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon.svg',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
]

/** Build-asset URLs referenced by the offline page (script/link tags and the RSC payload). */
function assetUrls(html) {
  const urls = new Set()
  const re = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s<>]+/g
  for (const match of html.matchAll(re)) {
    const path = match[0].startsWith('/_next/') ? match[0] : `/_next/${match[0]}`
    urls.add(path)
  }
  return urls
}

async function precache() {
  const response = await fetch(OFFLINE_URL, { cache: 'reload', credentials: 'omit' })
  if (!response.ok) throw new Error(`offline page: HTTP ${response.status}`)
  const html = await response.clone().text()
  const offline = await caches.open(OFFLINE_CACHE)
  await offline.put(OFFLINE_URL, response)
  const statics = await caches.open(STATIC_CACHE)
  const urls = [...CORE_ASSETS, ...assetUrls(html)]
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { credentials: 'omit' })
        if (res.ok) await statics.put(url, res)
      } catch {
        // A missing optional asset must not block installation.
      }
    }),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, OFFLINE_CACHE])
      for (const key of await caches.keys()) {
        if (key.startsWith('nfcb-') && !keep.has(key)) await caches.delete(key)
      }
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable()
      }
      await self.clients.claim()
    })(),
  )
})

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone())
  return response
}

async function networkThenOffline(event) {
  try {
    const preloaded = await event.preloadResponse
    if (preloaded) return preloaded
    return await fetch(event.request)
  } catch {
    const fallback = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE, ignoreVary: true })
    return (
      fallback ||
      new Response('You are offline. Nothing was recorded.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    )
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return // never cached, never intercepted
  if (request.mode === 'navigate') {
    event.respondWith(networkThenOffline(event))
    return
  }
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(cacheFirst(request))
  }
  // Everything else (RSC data, images, etc.) goes straight to the network.
})
