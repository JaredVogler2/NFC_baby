import { apiRoute, assertSameOrigin, jsonOk } from '@/lib/http/server'
import { isConfigured } from '@/lib/env/public'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const POST = apiRoute('/api/v1/auth/signout', async (request) => {
  assertSameOrigin(request)
  if (isConfigured()) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signOut({ scope: 'local' })
  }
  return jsonOk({ ok: true })
})
