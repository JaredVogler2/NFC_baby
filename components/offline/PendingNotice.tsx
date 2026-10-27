'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { listDrafts } from '@/lib/offline/drafts'

/** One-line reminder on logging screens that earlier entries are still only on this phone. */
export function PendingNotice({ userId }: { userId: string }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    listDrafts(userId).then(
      (d) => !cancelled && setCount(d.length),
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [userId])
  if (count === 0) return null
  return (
    <p
      role="status"
      className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-3 py-2 text-[15px]"
    >
      {count === 1 ? '1 earlier entry is' : `${count} earlier entries are`} still pending on this
      phone, not in shared history.{' '}
      <Link href="/dashboard" className="font-semibold underline underline-offset-4">
        Open Home to sync
      </Link>
    </p>
  )
}
