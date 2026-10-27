import 'server-only'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { hashToken } from './otp'

export type InvitePreview = {
  status: 'valid' | 'invalid'
  role?: string
  emailHint?: string
  email?: string
  displayName?: string | null
}

/** "m•••@example.com": enough for the invitee to recognise the address, useless to a stranger. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '•••'
  return `${local[0]}•••@${domain}`
}

/** Server-side lookup of an invite by its raw token (service role; token never stored). */
export async function lookupInvite(token: string): Promise<InvitePreview> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('household_invites')
    .select('email, role, display_name, expires_at, accepted_at, revoked_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle()
  if (!data || data.revoked_at || data.accepted_at || new Date(data.expires_at) < new Date()) {
    return { status: 'invalid' }
  }
  return {
    status: 'valid',
    role: data.role,
    email: data.email,
    emailHint: maskEmail(data.email),
    displayName: data.display_name,
  }
}
