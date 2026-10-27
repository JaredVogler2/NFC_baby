import 'server-only'
import type { Role } from '@/lib/domain/intents'
import type { ServerSupabase } from '@/lib/supabase/server'
import { toApiError } from './errors'

export type OpenInvite = {
  id: string
  email: string
  role: Role
  expiresAt: string
  status: 'pending' | 'expired'
}

/** Not-yet-accepted, not-revoked invites (RLS: owner only). */
export async function listOpenInvites(
  supabase: ServerSupabase,
  householdId: string,
): Promise<OpenInvite[]> {
  const { data, error } = await supabase
    .from('household_invites')
    .select('id, email, role, expires_at')
    .eq('household_id', householdId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw toApiError(error, 'list_invites')
  const now = Date.now()
  return (data ?? []).map((i) => ({
    id: String(i.id),
    email: String(i.email),
    role: i.role as Role,
    expiresAt: String(i.expires_at),
    status: Date.parse(String(i.expires_at)) < now ? 'expired' : 'pending',
  }))
}
