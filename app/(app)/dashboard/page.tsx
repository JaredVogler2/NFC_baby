import type { Metadata } from 'next'
import Link from 'next/link'
import { NfcIcon } from '@/components/icons'
import { AppShell } from '@/components/layout/AppShell'
import { LiveRefresh } from '@/components/layout/LiveRefresh'
import { QuickLog } from '@/components/dashboard/QuickLog'
import { SinceCard } from '@/components/dashboard/SinceCard'
import { EventRow } from '@/components/logging/EventRow'
import { Card, EmptyState, SectionTitle } from '@/components/ui/primitives'
import { requirePageMember } from '@/lib/auth/member'
import { activeChildren, pickChild } from '@/lib/db/context'
import { getDashboard } from '@/lib/db/events'
import { can } from '@/lib/domain/intents'
import { formatVolume } from '@/lib/domain/units'
import { scheduleDueRetries } from '@/lib/notifications/dispatch-hook'
import { unitPreference } from '@/lib/prefs'

export const metadata: Metadata = { title: 'Home' }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { child: requested } = await searchParams
  const { ctx, supabase } = await requirePageMember('/dashboard')
  const child = pickChild(ctx, requested)
  const tz = ctx.household.timezone
  const unit = await unitPreference(ctx.household.defaultVolumeUnit)
  const children = activeChildren(ctx)

  if (!child) {
    return (
      <AppShell title="Home">
        <EmptyState title="No child profile yet">Add one in Settings → Family.</EmptyState>
      </AppShell>
    )
  }
  const d = await getDashboard(supabase, child.id)
  // Retry any due texts in the background whenever someone opens Home (Hobby cron is daily).
  if (ctx.household.notificationMode === 'AUTOMATIC') scheduleDueRetries()
  const childQuery = children.length > 1 ? `?child=${child.id}` : ''

  return (
    <AppShell title={child.nickname} actions={<LiveRefresh timezone={tz} />}>
      <div className="flex flex-col gap-6">
        {children.length > 1 ? (
          <nav aria-label="Choose child" className="flex gap-2 overflow-x-auto">
            {children.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard?child=${c.id}`}
                aria-current={c.id === child.id ? 'page' : undefined}
                className={`min-h-11 rounded-full border px-4 py-2 font-semibold ${c.id === child.id ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong'}`}
              >
                {c.nickname}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <SinceCard
            title="Last fed"
            event={d.lastFeed}
            timezone={tz}
            unit={unit}
            empty="No feeding yet"
            footer={
              d.lastFeed && can.log(ctx.membership.role) ? (
                <Link
                  href={`/log/feed?repeat=1${childQuery ? `&child=${child.id}` : ''}`}
                  prefetch={false}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-strong px-3 text-sm font-semibold"
                >
                  Repeat last feed
                </Link>
              ) : null
            }
          />
          <SinceCard
            title="Last diaper"
            event={d.lastDiaper}
            timezone={tz}
            unit={unit}
            empty="No diaper yet"
          />
        </div>

        {can.log(ctx.membership.role) ? <QuickLog childQuery={childQuery} /> : null}

        <section aria-labelledby="recent" className="flex flex-col gap-2">
          <SectionTitle id="recent">Recent</SectionTitle>
          {d.recent.length === 0 ? (
            <EmptyState icon={<NfcIcon size={36} />} title="No entries yet">
              Scan a sticker or tap Log.
            </EmptyState>
          ) : (
            <Card className="divide-y divide-border">
              {d.recent.map((e) => (
                <EventRow key={e.id} event={e} timezone={tz} unit={unit} />
              ))}
              <Link
                href="/history"
                className="flex min-h-12 items-center justify-center font-semibold text-muted"
              >
                See all history →
              </Link>
            </Card>
          )}
        </section>

        <details className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3">
          <summary className="min-h-8 cursor-pointer font-semibold">Today so far</summary>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-[15px]">
            <dt className="text-muted">Diaper changes</dt>
            <dd className="tabular">{d.today.diaperChanges}</dd>
            <dt className="text-muted">Wet (incl. wet + poop)</dt>
            <dd className="tabular">{d.today.wet}</dd>
            <dt className="text-muted">Poop (incl. wet + poop)</dt>
            <dd className="tabular">{d.today.poop}</dd>
            <dt className="text-muted">Bottles</dt>
            <dd className="tabular">
              {d.today.bottles}
              {d.today.bottles ? ` · ${formatVolume(d.today.bottleMl, unit)}` : ''}
              {d.today.bottlesUnmeasured ? ` (+${d.today.bottlesUnmeasured} not measured)` : ''}
            </dd>
            <dt className="text-muted">Nursing</dt>
            <dd className="tabular">{d.today.nursing}</dd>
          </dl>
          <p className="mt-2 text-sm text-muted">
            Counts since midnight. A record of what was logged, not health guidance.
          </p>
        </details>
      </div>
    </AppShell>
  )
}
