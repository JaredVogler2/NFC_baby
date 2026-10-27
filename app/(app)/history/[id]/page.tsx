import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { AppShell } from '@/components/layout/AppShell'
import { EventActions } from '@/components/logging/EventActions'
import { KindBadge } from '@/components/logging/kind'
import { recipientStatusText } from '@/components/notifications/statusText'
import { Banner, Card, SectionTitle } from '@/components/ui/primitives'
import { requirePageMember } from '@/lib/auth/member'
import { getAudit, getEvent } from '@/lib/db/events'
import { describeChanges } from '@/lib/domain/audit'
import { eventSummary } from '@/lib/domain/event'
import { can } from '@/lib/domain/intents'
import { buildNotificationSummary } from '@/lib/notifications/summary'
import { unitPreference } from '@/lib/prefs'
import { formatShortDate, formatTime } from '@/lib/time/zoned'

export const metadata: Metadata = { title: 'Entry' }

const SOURCE_TEXT = {
  TAG: 'sticker',
  DASHBOARD: 'Home',
  SHORTCUT: 'Shortcut',
  OFFLINE_SYNC: 'offline draft',
} as const

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const { user, ctx, supabase } = await requirePageMember(`/history/${id}`)
  const event = await getEvent(supabase, id)
  if (!event) notFound()
  const role = ctx.membership.role
  const [audit, notification] = await Promise.all([
    can.readAudit(role) ? getAudit(supabase, id) : Promise.resolve(null),
    buildNotificationSummary(supabase, ctx, event),
  ])
  const tz = ctx.household.timezone
  const unit = await unitPreference(ctx.household.defaultVolumeUnit)
  const names = new Map(ctx.members.map((m) => [m.userId, m.displayName]))
  const childNames = new Map(ctx.children.map((c) => [c.id, c.nickname]))
  const occurred = new Date(event.occurredAt)
  const recorded = new Date(event.createdAt)
  const voided = event.state === 'VOID'
  const canEdit =
    !voided && (can.editAny(role) || (can.editOwn(role) && event.createdBy === user.id))
  const fmt = (d: Date) => `${formatShortDate(d, tz)} · ${formatTime(d, tz)}`

  return (
    <AppShell title="Entry" back={{ href: '/history', label: 'Back to history' }}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <KindBadge intent={event.intent} subtype={event.subtype} />
          <h2
            className={`font-display text-2xl font-bold leading-tight ${voided ? 'line-through' : ''}`}
          >
            {eventSummary(event, unit)}
          </h2>
        </div>

        {voided ? (
          <Banner tone="warning" title="Undone">
            Undone by {event.voidedByName ?? 'a family member'}
            {event.voidedAt ? ` on ${fmt(new Date(event.voidedAt))}` : ''}. It doesn’t count in Home
            or totals and stays here for the record.
          </Banner>
        ) : null}

        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-4 text-[15px]">
            <dt className="text-muted">Happened</dt>
            <dd className="tabular">{fmt(occurred)}</dd>
            <dt className="text-muted">Recorded</dt>
            <dd className="tabular">
              {fmt(recorded)}
              {recorded.getTime() - occurred.getTime() >= 120_000
                ? ` (${Math.round((recorded.getTime() - occurred.getTime()) / 60_000)} min later)`
                : ''}
            </dd>
            <dt className="text-muted">Logged by</dt>
            <dd>
              {event.createdByName} via {SOURCE_TEXT[event.source]}
              {event.sourceTagLabel ? ` “${event.sourceTagLabel}”` : ''}
            </dd>
            {ctx.children.length > 1 ? (
              <>
                <dt className="text-muted">Child</dt>
                <dd>{childNames.get(event.childId)}</dd>
              </>
            ) : null}
            {event.revision > 1 && !voided ? (
              <>
                <dt className="text-muted">Edited</dt>
                <dd>
                  by {event.updatedByName ?? 'a family member'} · {fmt(new Date(event.updatedAt))}
                </dd>
              </>
            ) : null}
            <dt className="text-muted">Note</dt>
            <dd className="whitespace-pre-wrap break-words">
              {event.notes ?? <span className="text-muted">—</span>}
            </dd>
          </dl>
        </Card>

        {canEdit ? (
          <EventActions
            event={event}
            timezone={tz}
            previouslyNotified={notification.previouslyNotified}
          />
        ) : null}

        {notification.recipients.length ? (
          <section aria-labelledby="texts" className="flex flex-col gap-2">
            <SectionTitle id="texts">Automatic texts</SectionTitle>
            <Card className="p-4">
              <ul className="flex flex-col gap-1 text-[15px]">
                {notification.recipients.map((r) => (
                  <li key={r.userId}>
                    <strong>{r.displayName}</strong> — {recipientStatusText(r.state, r.reason)}
                  </li>
                ))}
              </ul>
              {notification.previouslyNotified ? (
                <p className="mt-2 text-sm text-muted">
                  Original text may already have been received.
                </p>
              ) : null}
            </Card>
          </section>
        ) : null}

        {audit ? (
          <section aria-labelledby="changes" className="flex flex-col gap-2">
            <SectionTitle id="changes">History of changes</SectionTitle>
            <Card>
              <ol className="divide-y divide-border">
                {audit.map((a) => (
                  <li key={a.id} className="px-4 py-3 text-[15px]">
                    <p className="font-semibold">
                      {a.action === 'CREATE'
                        ? 'Created'
                        : a.action === 'VOID'
                          ? 'Undone'
                          : 'Changed'}{' '}
                      by {names.get(a.actorId) ?? 'a former member'}
                      <span className="font-normal text-muted">
                        {' '}
                        · {fmt(new Date(a.createdAt))}
                      </span>
                    </p>
                    {a.action === 'UPDATE' ? (
                      <ul className="mt-1 list-disc pl-5 text-muted">
                        {describeChanges(a.changes, {
                          timezone: tz,
                          childNames,
                          current: event.feeding
                            ? {
                                amountUnknown: event.feeding.amountUnknown,
                                amountEnteredValue: event.feeding.amountEnteredValue,
                                amountEnteredUnit: event.feeding.amountEnteredUnit,
                              }
                            : undefined,
                        }).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {a.action === 'VOID' && typeof a.changes.reason === 'string' ? (
                      <p className="mt-1 text-muted">Reason: {a.changes.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </Card>
          </section>
        ) : null}
      </div>
    </AppShell>
  )
}
