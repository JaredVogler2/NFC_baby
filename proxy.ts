import type { NextRequest } from 'next/server'
import { refreshSession } from '@/lib/supabase/proxy'

/**
 * Runs before page renders (Next 16 "proxy", formerly middleware):
 *  1. generates a per-request CSP nonce (all pages are dynamically rendered), and
 *  2. refreshes the Supabase auth cookie.
 * It never makes authorization decisions; pages, API handlers and RLS do that.
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const connectSrc = ["'self'", supabaseUrl ? new URL(supabaseUrl).origin : ''].filter(Boolean)
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Inline style attributes are used for a few dynamic values; scripts remain nonce-locked.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = await refreshSession(request, requestHeaders)
  response.headers.set('Content-Security-Policy', csp)
  // Pages show private family data: never cache them in shared caches.
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}

export const config = {
  matcher: [
    {
      source:
        '/((?!api/|_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
