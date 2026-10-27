'use client'

import { useMemo, useState } from 'react'
import { EventRow } from '@/components/logging/EventRow'
import { Button } from '@/components/ui/Button'
import { Banner, Card } from '@/components/ui/primitives'
import type { CareEvent } from '@/lib/domain/event'
import type { VolumeUnit } from '@/lib/domain/units'
import { apiFetch } from '@/lib/http/client'
import { dayHeading, localDateKey } from '@/lib/time/zoned'

/** Date-grouped timeline with "Load older" keyset paging. Newest occurrence first. */
export function HistoryList({
  initial,
  initialCursor,
  query,
  timezone,
  unit,
  nowIso,
}: {
  initial: CareEvent[]
  initialCursor: string | null
  query: string
  timezone: string
  unit: VolumeUnit
  nowIso: string
}) {
  const [older, setOlder] = useState<CareEvent[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nextCursor = loadedOnce ? cursor : initialCursor

  const groups = useMemo(() => {
    const seen = new Set<string>()
    const all = [...initial, ...older].filter((e) =>
      seen.has(e.id) ? false : (seen.add(e.id), true),
    )
    all.sort((a, b) =>
      a.occurredAt === b.occurredAt
        ? b.createdAt.localeCompare(a.createdAt)
        : Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
    )
    const out: { key: string; events: CareEvent[] }[] = []
    for (const e of all) {
      const key = localDateKey(new Date(e.occurredAt), timezone)
      const last = out.at(-1)
      if (last && last.key === key) last.events.push(e)
      else out.push({ key, events: [e] })
    }
    return out
  }, [initial, older, timezone])

  async function loadOlder() {
    if (!nextCursor || busy) return
    setBusy(true)
    setError(null)
    const res = await apiFetch<{ events: CareEvent[]; nextCursor: string | null }>(
      `/api/v1/events?${query}${query ? '&' : ''}cursor=${encodeURIComponent(nextCursor)}`,
    )
    setBusy(false)
    if (!res.ok) {
      setError('Could not load older entries. Check your connection and try again.')
      return
    }
    setOlder((o) => [...o, ...res.data.events])
    setCursor(res.data.nextCursor)
    setLoadedOnce(true)
  }

  const now = new Date(nowIso)
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`day-${g.key}`} className="flex flex-col gap-2">
          <h2
            id={`day-${g.key}`}
            className="sticky top-14 z-10 -mx-1 bg-bg/95 px-1 py-1 font-display text-lg font-bold"
          >
            {dayHeading(g.key, timezone, now)}
          </h2>
          <Card className="divide-y divide-border">
            {g.events.map((e) => (
              <EventRow key={e.id} event={e} timezone={timezone} unit={unit} />
            ))}
          </Card>
        </section>
      ))}
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
      {nextCursor ? (
        <Button variant="secondary" block onClick={loadOlder} disabled={busy}>
          {busy ? 'Loading…' : 'Load older entries'}
        </Button>
      ) : groups.length ? (
        <p className="text-center text-sm text-muted">That’s everything.</p>
      ) : null}
    </div>
  )
}
