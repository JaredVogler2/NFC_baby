import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { getPublicEnv } from '@/lib/env/public'
import { serverEnv } from '@/lib/env/server'
import { ApiError } from '@/lib/http/errors'

/**
 * Service-role client. Bypasses RLS, so callers MUST authorize the actor themselves first.
 * Used only for: first-owner bootstrap, invite user creation, notification dispatch and contact
 * storage, and provider webhooks.
 */
export function createSupabaseAdminClient() {
  const env = getPublicEnv()
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!env || !key) throw new ApiError('NOT_CONFIGURED')
  return createClient(env.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export function hasAdminClient(): boolean {
  return Boolean(getPublicEnv() && serverEnv().SUPABASE_SERVICE_ROLE_KEY)
}

export type AdminSupabase = ReturnType<typeof createSupabaseAdminClient>
