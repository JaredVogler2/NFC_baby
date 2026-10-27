import type { Metadata } from 'next'
import Link from 'next/link'
import { HistoryList } from '@/components/history/HistoryList'
import { AppShell } from '@/components/layout/AppShell'
import { LiveRefresh } from '@/components/layout/LiveRefresh'
import { HistoryDateFilter } from '@/components/history/HistoryDateFilter'
import { EmptyState } from '@/components/ui/primitives'
import { requirePageMember } from '@/lib/auth/member'
import { pickChild } from '@/lib/db/context'
import { listEvents } from '@/lib/db/events'
import type { Intent } from '@/lib/domain/intents'
import { unitPreference } from '@/lib/prefs'
import { addDays, startOfLocalDay } from '@/lib/time/zoned'

export const metadata: Metadata = { title: 'History' }

const TYPES = {
  all: { label: 'All', intents: null as Intent[] | null },
  diapers: { label: 'Diapers', intents: ['WET', 'POOP', 'BOTH'] as Intent[] },
  feeding: { label: 'Feeding', intents: ['FEED'] as Intent[] },
}
type TypeKey = keyof typeof TYPES

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp = await searchParams
  const { ctx, supabase } = await requirePageMember('/history')
  const type: TypeKey = sp.type === 'diapers' || sp.type === 'feeding' ? sp.type : 'all'
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null
  const includeVoided = sp.voided === '1'
  const child = pickChild(ctx, sp.child)
  const tz = ctx.household.timezone
  const unit = await unitPreference(ctx.household.defaultVolumeUnit)

  const params = new URLSearchParams()
  if (type !== 'all') params.set('type', type)
  if (day) params.set('day', day)
  if (includeVoided) params.set('voided', '1')
  if (sp.child && child) params.set('child', child.id)
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    const qs = p.toString()
    return `/history${qs ? `?${qs}` : ''}`
  }
  // Query string for the JSON API (it expects from/to and includeVoided).
  const apiParams = new URLSearchParams({ type })
  if (child) apiParams.set('childId', child.id)
  if (day) {
    apiParams.set('from', day)
    apiParams.set('to', day)
  }
  if (includeVoided) apiParams.set('includeVoided', '1')

  const result = child
    ? await listEvents(supabase, {
        childId: child.id,
        intents: TYPES[type].intents,
        from: day ? startOfLocalDay(day, tz) : null,
        to: day ? startOfLocalDay(addDays(day, 1), tz) : null,
        includeVoided,
        cursor: null,
        limit: 30,
      })
    : { events: [], nextCursor: null }
  const filtered = type !== 'all' || day !== null || includeVoided

  return (
    <AppShell title="History" actions={<LiveRefresh timezone={tz} />}>
      <div className="flex flex-col gap-4">
        <nav aria-label="Filter by type" className="grid grid-cols-3 gap-2">
          {(Object.keys(TYPES) as TypeKey[]).map((key) => (
            <Link
              key={key}
              href={href({ type: key === 'all' ? null : key })}
              aria-current={type === key ? 'page' : undefined}
              className={`flex min-h-11 items-center justify-center rounded-xl border font-semibold ${type === key ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong bg-surface'}`}
            >
              {TYPES[key].label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <HistoryDateFilter day={day} baseQuery={params.toString()} />
          <Link
            href={href({ voided: includeVoided ? null : '1' })}
            className="inline-flex min-h-11 items-center rounded-xl px-2 text-[15px] font-semibold text-muted underline-offset-4 hover:underline"
          >
            {includeVoided ? 'Hide undone entries' : 'Show undone entries'}
          </Link>
          {filtered ? (
            <Link
              href="/history"
              className="inline-flex min-h-11 items-center rounded-xl px-2 text-[15px] font-semibold text-muted underline-offset-4 hover:underline"
            >
              Reset filters
            </Link>
          ) : null}
        </div>

        {result.events.length === 0 ? (
          filtered ? (
            <EmptyState title="No entries match">
              Try another day or type.{' '}
              <Link href="/history" className="font-semibold underline">
                Reset filters
              </Link>
            </EmptyState>
          ) : (
            <EmptyState title="Nothing logged yet">Scan a sticker or use Log on Home.</EmptyState>
          )
        ) : (
          <HistoryList
            initial={result.events}
            initialCursor={result.nextCursor}
            query={apiParams.toString()}
            timezone={tz}
            unit={unit}
            nowIso={new Date().toISOString()}
          />
        )}
      </div>
    </AppShell>
  )
}
