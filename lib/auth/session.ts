import 'server-only'
import { redirect } from 'next/navigation'
import { isConfigured } from '@/lib/env/public'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { loginUrlFor } from './redirect'

export type SessionUser = { id: string; email: string | null }

/** Verified identity from the JWT (getClaims validates the signature / asks the Auth server). */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isConfigured()) return null
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  if (error || typeof sub !== 'string') return null
  const email = typeof data?.claims?.email === 'string' ? data.claims.email : null
  return { id: sub, email }
}

/** For pages: signed-out visitors are sent to sign-in and returned to `currentPath` afterwards. */
export async function requirePageUser(currentPath: string): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect(loginUrlFor(currentPath))
  return user
}
