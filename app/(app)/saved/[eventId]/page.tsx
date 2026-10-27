import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { AppShell } from '@/components/layout/AppShell'
import { SavedView } from '@/components/logging/SavedView'
import { requirePageMember } from '@/lib/auth/member'
import { getEvent } from '@/lib/db/events'
import { can } from '@/lib/domain/intents'
import { buildNotificationSummary } from '@/lib/notifications/summary'
import { unitPreference } from '@/lib/prefs'

export const metadata: Metadata = { title: 'Saved' }

export default async function SavedPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  if (!z.uuid().safeParse(eventId).success) notFound()
  const { user, ctx, supabase } = await requirePageMember(`/saved/${eventId}`)
  const event = await getEvent(supabase, eventId)
  if (!event) notFound()
  const notification = await buildNotificationSummary(supabase, ctx, event)
  const role = ctx.membership.role
  const canEdit = can.editAny(role) || (can.editOwn(role) && event.createdBy === user.id)
  return (
    <AppShell title="Entry saved" hideNav>
      <SavedView
        initialEvent={event}
        notification={notification}
        timezone={ctx.household.timezone}
        unit={await unitPreference(ctx.household.defaultVolumeUnit)}
        canEdit={canEdit}
      />
    </AppShell>
  )
}
