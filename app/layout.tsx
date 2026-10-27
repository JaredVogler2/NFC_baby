import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { BackForwardGuard } from '@/components/layout/BackForwardGuard'
import { ServiceWorkerRegistrar } from '@/components/offline/ServiceWorkerRegistrar'
import { THEME_COOKIE, parseTheme } from '@/lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'NFC Baby', template: '%s · NFC Baby' },
  description: 'A private tap-to-log baby-care record for your family.',
  applicationName: 'NFC Baby',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'same-origin',
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { capable: true, title: 'NFC Baby', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f4ef' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0e0d' },
  ],
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return (
    <html lang="en" data-theme={theme === 'system' ? undefined : theme} suppressHydrationWarning>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        {children}
        <ServiceWorkerRegistrar />
        <BackForwardGuard />
      </body>
    </html>
  )
}
