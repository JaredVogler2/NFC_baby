'use client'

import { useRouter } from 'next/navigation'

/** Single-day filter (native date picker; family-local days). */
export function HistoryDateFilter({ day, baseQuery }: { day: string | null; baseQuery: string }) {
  const router = useRouter()
  return (
    <label className="flex items-center gap-2 text-[15px] font-semibold">
      <span>Day</span>
      <input
        type="date"
        value={day ?? ''}
        onChange={(e) => {
          const p = new URLSearchParams(baseQuery)
          if (e.target.value) p.set('day', e.target.value)
          else p.delete('day')
          const qs = p.toString()
          router.push(`/history${qs ? `?${qs}` : ''}`)
        }}
        className="min-h-11 rounded-xl border border-border-strong bg-surface px-3 text-base"
      />
    </label>
  )
}
