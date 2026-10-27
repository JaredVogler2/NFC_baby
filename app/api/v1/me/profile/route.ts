import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { profileSchema } from '@/lib/domain/schemas'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'

export const PATCH = apiRoute('/api/v1/me/profile', async (request) => {
  assertSameOrigin(request)
  const { supabase } = await requireApiMember()
  const { displayName } = await readJson(request, profileSchema)
  const { error } = await supabase.rpc('update_my_profile', { p_display_name: displayName })
  if (error) throw toApiError(error, 'update_my_profile')
  return jsonOk({ ok: true })
})
