import 'server-only'
import { toCareEvent, type CareEvent } from '@/lib/domain/event'
import {
  eventTypeForIntent,
  type Intent,
  type SourceType,
  type Subtype,
} from '@/lib/domain/intents'
import type { CreateEventInput, FeedingInput } from '@/lib/domain/schemas'
import type { ServerSupabase } from '@/lib/supabase/server'
import { decodeCursor, encodeCursor } from './cursor'
import { toApiError } from './errors'

type ParsedCreate = Omit<CreateEventInput, 'notes'> & { notes: string | null }

export function feedingToRpc(
  feeding: FeedingInput | null | undefined,
): Record<string, unknown> | null {
  if (!feeding) return null
  if (feeding.method === 'BOTTLE') {
    return {
      milkType: feeding.milkType,
      amountUnknown: feeding.amountUnknown ?? false,
      amountValue: feeding.amountUnknown ? null : (feeding.amountValue ?? null),
      amountUnit: feeding.amountUnknown ? null : (feeding.amountUnit ?? null),
    }
  }
  return {
    side: feeding.side ?? 'UNKNOWN',
    durationSeconds: feeding.durationSeconds ?? null,
    endedAt: feeding.endedAt ?? null,
  }
}

export function subtypeFor(intent: Intent, feeding: FeedingInput | null | undefined): Subtype {
  if (eventTypeForIntent(intent) === 'DIAPER') return intent as Subtype
  return feeding?.method ?? 'BOTTLE'
}

export async function createEvent(
  supabase: ServerSupabase,
  input: ParsedCreate,
): Promise<{ id: string; replayed: boolean; queued: number }> {
  const source: SourceType = input.offlineSync
    ? 'OFFLINE_SYNC'
    : input.tagToken
      ? 'TAG'
      : 'DASHBOARD'
  const { data, error } = await supabase.rpc('log_care_event', {
    p_client_request_id: input.clientRequestId,
    p_intent: input.intent,
    p_subtype: subtypeFor(input.intent, input.feeding),
    p_source: source,
    p_tag_token: input.tagToken ?? null,
    p_child_id: input.childId ?? null,
    p_occurred_at: input.occurredAt ?? null,
    p_confirm_old: input.confirmOld ?? false,
    p_notes: input.notes,
    p_feeding: feedingToRpc(input.feeding),
  })
  if (error) throw toApiError(error, 'log_care_event')
  return data as { id: string; replayed: boolean; queued: number }
}

export async function getEvent(supabase: ServerSupabase, id: string): Promise<CareEvent | null> {
  const { data, error } = await supabase
    .from('care_event_list')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw toApiError(error, 'get_event')
  return data ? toCareEvent(data) : null
}

/** Status check for an uncertain save: did my attempt with this key commit? */
export async function findEventIdByRequest(
  supabase: ServerSupabase,
  userId: string,
  clientRequestId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('care_events')
    .select('id')
    .eq('created_by', userId)
    .eq('idempotency_key', clientRequestId)
    .maybeSingle()
  if (error) throw toApiError(error, 'find_by_request')
  return (data?.id as string | undefined) ?? null
}

export type ListParams = {
  childId: string
  intents: Intent[] | null
  from: Date | null
  to: Date | null
  includeVoided: boolean
  cursor: string | null
  limit: number
}

export async function listEvents(
  supabase: ServerSupabase,
  p: ListParams,
): Promise<{ events: CareEvent[]; nextCursor: string | null }> {
  const cursor = p.cursor ? decodeCursor(p.cursor) : null
  const { data, error } = await supabase.rpc('list_care_events', {
    p_child_id: p.childId,
    p_intents: p.intents,
    p_from: p.from?.toISOString() ?? null,
    p_to: p.to?.toISOString() ?? null,
    p_include_void: p.includeVoided,
    p_before_occurred: cursor?.occurredAt ?? null,
    p_before_created: cursor?.createdAt ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: p.limit + 1,
  })
  if (error) throw toApiError(error, 'list_care_events')
  const rows = (data as Record<string, unknown>[]).map(toCareEvent)
  const page = rows.slice(0, p.limit)
  const last = page.at(-1)
  return { events: page, nextCursor: rows.length > p.limit && last ? encodeCursor(last) : null }
}

export type DashboardData = {
  serverTime: string
  dayStart: string
  lastFeed: CareEvent | null
  lastDiaper: CareEvent | null
  recent: CareEvent[]
  today: {
    diaperChanges: number
    wet: number
    poop: number
    bottles: number
    bottleMl: number
    bottlesUnmeasured: number
    nursing: number
  }
}

export async function getDashboard(
  supabase: ServerSupabase,
  childId: string,
): Promise<DashboardData> {
  const { data, error } = await supabase.rpc('get_dashboard', { p_child_id: childId })
  if (error) throw toApiError(error, 'get_dashboard')
  const d = data as Record<string, unknown>
  const today = d.today as Record<string, unknown>
  return {
    serverTime: String(d.serverTime),
    dayStart: String(d.dayStart),
    lastFeed: d.lastFeed ? toCareEvent(d.lastFeed as Record<string, unknown>) : null,
    lastDiaper: d.lastDiaper ? toCareEvent(d.lastDiaper as Record<string, unknown>) : null,
    recent: ((d.recent as Record<string, unknown>[]) ?? []).map(toCareEvent),
    today: {
      diaperChanges: Number(today.diaperChanges),
      wet: Number(today.wet),
      poop: Number(today.poop),
      bottles: Number(today.bottles),
      bottleMl: Number(today.bottleMl),
      bottlesUnmeasured: Number(today.bottlesUnmeasured),
      nursing: Number(today.nursing),
    },
  }
}

export type AuditEntry = {
  id: number
  action: 'CREATE' | 'UPDATE' | 'VOID'
  actorId: string
  revision: number
  changes: Record<string, unknown>
  createdAt: string
}

/** Audit trail (RLS returns rows only to owner/parent). */
export async function getAudit(supabase: ServerSupabase, eventId: string): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('care_event_audit')
    .select('id, action, actor_id, revision, changes, created_at')
    .eq('event_id', eventId)
    .order('id', { ascending: true })
  if (error) throw toApiError(error, 'get_audit')
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    action: r.action as AuditEntry['action'],
    actorId: String(r.actor_id),
    revision: Number(r.revision),
    changes: (r.changes ?? {}) as Record<string, unknown>,
    createdAt: String(r.created_at),
  }))
}

/** Latest feed suggestions for the feeding form (never auto-submitted). */
export async function getFeedSuggestions(supabase: ServerSupabase, childId: string) {
  const { data, error } = await supabase
    .from('care_event_list')
    .select(
      'subtype, milk_type, amount_entered_value, amount_entered_unit, amount_unknown, occurred_at',
    )
    .eq('child_id', childId)
    .eq('state', 'ACTIVE')
    .eq('event_type', 'FEED')
    .order('occurred_at', { ascending: false })
    .limit(10)
  if (error) throw toApiError(error, 'feed_suggestions')
  const rows = data ?? []
  const lastMethod = (rows[0]?.subtype as 'BOTTLE' | 'NURSING' | undefined) ?? null
  const lastBottle = rows.find(
    (r) => r.subtype === 'BOTTLE' && !r.amount_unknown && r.amount_entered_value,
  )
  return {
    lastMethod,
    lastBottle: lastBottle
      ? {
          milkType: lastBottle.milk_type as string,
          value: Number(lastBottle.amount_entered_value),
          unit: lastBottle.amount_entered_unit as 'oz' | 'ml',
        }
      : null,
  }
}

/** "Repeat last feed": the latest active feeding as visible form values (never auto-saved). */
export async function lastFeedAsForm(supabase: ServerSupabase, childId: string) {
  const { data, error } = await supabase
    .from('care_event_list')
    .select(
      'subtype, milk_type, amount_entered_value, amount_entered_unit, amount_unknown, side, duration_seconds',
    )
    .eq('child_id', childId)
    .eq('state', 'ACTIVE')
    .eq('event_type', 'FEED')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw toApiError(error, 'last_feed')
  if (!data) return null
  const bottle = data.subtype === 'BOTTLE'
  return {
    feedMethod: data.subtype as 'BOTTLE' | 'NURSING',
    milkType: bottle ? (data.milk_type as 'BREASTMILK' | 'FORMULA' | 'OTHER' | 'UNKNOWN') : null,
    amount:
      bottle && data.amount_entered_value !== null ? String(Number(data.amount_entered_value)) : '',
    amountUnit: (data.amount_entered_unit as 'oz' | 'ml' | null) ?? 'oz',
    amountUnknown: bottle ? Boolean(data.amount_unknown) : false,
    side: bottle ? null : ((data.side as 'LEFT' | 'RIGHT' | 'BOTH' | 'UNKNOWN' | null) ?? null),
    durationMinutes:
      !bottle && data.duration_seconds
        ? String(Math.round(Number(data.duration_seconds) / 60))
        : '',
  }
}
