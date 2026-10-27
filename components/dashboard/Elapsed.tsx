'use client'

import { useNow } from '@/lib/hooks/useNow'
import { formatElapsed } from '@/lib/time/zoned'

/** "1 h 12 min ago" — informational only, never a schedule or recommendation. */
export function Elapsed({ iso }: { iso: string }) {
  const now = useNow()
  if (!now) return <span aria-hidden="true">&nbsp;</span>
  return (
    <span suppressHydrationWarning>
      {formatElapsed(Date.parse(iso), Math.max(now, Date.parse(iso)))}
    </span>
  )
}
