'use client'

import { useEffect } from 'react'
import { rememberContext, type OfflineContext } from '@/lib/offline/drafts'

type Props = Omit<OfflineContext, 'cachedAt' | 'children'> & {
  childList: OfflineContext['children']
}

/**
 * Keeps this person's family basics (time zone, children, units) on this phone so the offline
 * screen can still show a logging form. Cleared on sign-out.
 */
export function RememberOfflineContext({ childList, ...rest }: Props) {
  const key = JSON.stringify({ ...rest, children: childList })
  useEffect(() => {
    rememberContext(JSON.parse(key) as Omit<OfflineContext, 'cachedAt'>).catch(() => undefined)
  }, [key])
  return null
}
