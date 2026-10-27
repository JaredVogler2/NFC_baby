import 'server-only'
import { loadMyContext } from '@/lib/db/context'
import type { ServerSupabase } from '@/lib/supabase/server'

/** Where to go right after signing in: invite pages keep their flow; non-members go to /setup. */
export async function destinationAfterSignIn(
  supabase: ServerSupabase,
  next: string,
): Promise<string> {
  if (next.startsWith('/invite/')) return next
  const ctx = await loadMyContext(supabase).catch(() => null)
  return ctx?.membership ? next : '/setup'
}
