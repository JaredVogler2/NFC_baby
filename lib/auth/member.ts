import 'server-only'
import { redirect } from 'next/navigation'
import { loadMyContext, type MemberContext } from '@/lib/db/context'
import type { Role } from '@/lib/domain/intents'
import { ApiError } from '@/lib/http/errors'
import { createSupabaseServerClient, type ServerSupabase } from '@/lib/supabase/server'
import { getSessionUser, requirePageUser, type SessionUser } from './session'

export type MemberSession = { user: SessionUser; ctx: MemberContext; supabase: ServerSupabase }

/** For route handlers: 401 when signed out, 403 when not (or no longer) a family member. */
export async function requireApiMember(roles?: Role[]): Promise<MemberSession> {
  const user = await getSessionUser()
  if (!user) throw new ApiError('UNAUTHENTICATED')
  const supabase = await createSupabaseServerClient()
  const ctx = await loadMyContext(supabase)
  if (!ctx || !ctx.membership)
    throw new ApiError('FORBIDDEN', 'Your account is not part of a family yet.')
  if (roles && !roles.includes(ctx.membership.role)) throw new ApiError('FORBIDDEN')
  return { user, ctx: ctx as MemberContext, supabase }
}

/** For pages: sign-in redirect that returns to `currentPath`; non-members go to /setup. */
export async function requirePageMember(currentPath: string): Promise<MemberSession> {
  const user = await requirePageUser(currentPath)
  const supabase = await createSupabaseServerClient()
  const ctx = await loadMyContext(supabase)
  if (!ctx || !ctx.membership) redirect('/setup')
  return { user, ctx: ctx as MemberContext, supabase }
}
