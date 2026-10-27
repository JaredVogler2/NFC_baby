import 'server-only'
import type { Intent, Role } from '@/lib/domain/intents'
import type { VolumeUnit } from '@/lib/domain/units'
import type { ServerSupabase } from '@/lib/supabase/server'
import { toApiError } from './errors'

export type ResolvedTag = {
  status: 'ACTIVE' | 'REVOKED'
  role: Role
  tag: { id: string; token: string; purpose: Intent; label: string; testedAt: string | null }
  child: { id: string; nickname: string; archived: boolean }
  household: {
    id: string
    timezone: string
    notificationMode: 'OFF' | 'COMPOSE' | 'AUTOMATIC'
    defaultFeedMethod: 'BOTTLE' | 'NURSING' | null
    defaultVolumeUnit: VolumeUnit
  }
}

/** Read-only resolution; null for unknown tokens and for tags of other households alike. */
export async function resolveTag(
  supabase: ServerSupabase,
  token: string,
): Promise<ResolvedTag | null> {
  const { data, error } = await supabase.rpc('resolve_tag', { p_token: token })
  if (error) throw toApiError(error, 'resolve_tag')
  return (data as ResolvedTag | null) ?? null
}

export type TagRow = {
  id: string
  token: string
  purpose: Intent
  label: string
  childId: string
  createdAt: string
  testedAt: string | null
  lastUsedAt: string | null
  useCount: number
  revokedAt: string | null
}

const mapTag = (r: Record<string, unknown>): TagRow => ({
  id: String(r.id),
  token: String(r.token),
  purpose: r.purpose as Intent,
  label: String(r.label),
  childId: String(r.child_id),
  createdAt: String(r.created_at),
  testedAt: (r.tested_at as string | null) ?? null,
  lastUsedAt: (r.last_used_at as string | null) ?? null,
  useCount: Number(r.use_count ?? 0),
  revokedAt: (r.revoked_at as string | null) ?? null,
})

const TAG_COLUMNS =
  'id, token, purpose, label, child_id, created_at, tested_at, last_used_at, use_count, revoked_at'

export async function listTags(supabase: ServerSupabase, householdId: string): Promise<TagRow[]> {
  const { data, error } = await supabase
    .from('nfc_tags')
    .select(TAG_COLUMNS)
    .eq('household_id', householdId)
    .order('revoked_at', { ascending: true, nullsFirst: true })
    .order('purpose')
    .order('created_at')
  if (error) throw toApiError(error, 'list_tags')
  return (data ?? []).map(mapTag)
}

export async function getTag(supabase: ServerSupabase, id: string): Promise<TagRow | null> {
  const { data, error } = await supabase
    .from('nfc_tags')
    .select(TAG_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw toApiError(error, 'get_tag')
  return data ? mapTag(data) : null
}
