import 'server-only'
import { serverEnv } from '@/lib/env/server'
import { createSupabaseAdminClient, hasAdminClient } from '@/lib/supabase/admin'
import type { SessionUser } from './session'

/** True when this signed-in user may create the very first family on this deployment. */
export async function canBootstrap(user: SessionUser): Promise<boolean> {
  const configured = serverEnv().BOOTSTRAP_OWNER_EMAIL?.toLowerCase()
  if (!configured || !user.email || user.email.toLowerCase() !== configured || !hasAdminClient()) {
    return false
  }
  const { data, error } = await createSupabaseAdminClient().rpc('households_exist')
  return !error && data === false
}
