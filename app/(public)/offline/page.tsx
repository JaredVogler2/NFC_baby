import type { Metadata } from 'next'
import { OfflineScreen } from '@/components/offline/OfflineScreen'

export const metadata: Metadata = { title: 'Offline' }

/**
 * Fallback the service worker shows when a page can't be loaded. It is fetched without cookies at
 * install time and contains no family data; anything personal it shows comes from this phone's own
 * storage (cached sticker, pending entries), read in the browser.
 */
export default function OfflinePage() {
  return <OfflineScreen />
}
