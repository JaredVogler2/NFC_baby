import 'server-only'
import type { MemberContext, NotificationMode } from '@/lib/db/context'
import { toApiError } from '@/lib/db/errors'
import type { CareEvent } from '@/lib/domain/event'
import type { ServerSupabase } from '@/lib/supabase/server'
import { renderUpdateText } from './template'

export type OutboxState =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT_TO_PROVIDER'
  | 'DELIVERED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENT'
  | 'UNKNOWN'
  | 'CANCELED'
  | 'SUPPRESSED'

export type RecipientStatus = {
  userId: string
  displayName: string
  state: OutboxState
  reason: string | null
  updatedAt: string
}

export type NotificationSummary = {
  mode: NotificationMode
  /** Text offered for manual sharing. Present in COMPOSE mode, or AUTOMATIC with nobody queued. */
  draftText: string | null
  recipients: RecipientStatus[]
  /** A text for this entry may already have reached someone (cannot be recalled). */
  previouslyNotified: boolean
}

const MAYBE_DELIVERED: OutboxState[] = ['PROCESSING', 'SENT_TO_PROVIDER', 'DELIVERED', 'UNKNOWN']

export async function buildNotificationSummary(
  supabase: ServerSupabase,
  ctx: MemberContext,
  event: CareEvent,
): Promise<NotificationSummary> {
  const { data, error } = await supabase
    .from('notification_outbox')
    .select('user_id, state, reason, updated_at')
    .eq('event_id', event.id)
    .order('created_at', { ascending: true })
  if (error) throw toApiError(error, 'outbox_summary')
  const names = new Map(ctx.members.map((m) => [m.userId, m.displayName]))
  const recipients: RecipientStatus[] = (data ?? []).map((r) => ({
    userId: String(r.user_id),
    displayName: names.get(String(r.user_id)) ?? 'Family member',
    state: r.state as OutboxState,
    reason: (r.reason as string | null) ?? null,
    updatedAt: String(r.updated_at),
  }))
  const mode = ctx.household.notificationMode
  const queued = recipients.some((r) => r.state !== 'SUPPRESSED' && r.state !== 'CANCELED')
  const wantsDraft =
    event.state === 'ACTIVE' && (mode === 'COMPOSE' || (mode === 'AUTOMATIC' && !queued))
  return {
    mode,
    draftText: wantsDraft
      ? renderUpdateText(event, {
          timezone: ctx.household.timezone,
          unit: ctx.household.defaultVolumeUnit,
        })
      : null,
    recipients,
    previouslyNotified: recipients.some((r) => MAYBE_DELIVERED.includes(r.state)),
  }
}
