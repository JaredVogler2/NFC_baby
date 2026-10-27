import { canBootstrap } from '@/lib/auth/bootstrap'
import { getSessionUser } from '@/lib/auth/session'
import { toApiError } from '@/lib/db/errors'
import { setupSchema } from '@/lib/domain/schemas'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/** One-time creation of the family by the configured first owner (BOOTSTRAP_OWNER_EMAIL). */
export const POST = apiRoute('/api/v1/setup', async (request) => {
  assertSameOrigin(request)
  const user = await getSessionUser()
  if (!user) throw new ApiError('UNAUTHENTICATED')
  const input = await readJson(request, setupSchema)
  if (!(await canBootstrap(user))) throw new ApiError('FORBIDDEN')
  const { error } = await createSupabaseAdminClient().rpc('bootstrap_household', {
    p_user_id: user.id,
    p_household_name: input.householdName,
    p_timezone: input.timezone,
    p_child_nickname: input.childNickname,
    p_display_name: input.displayName,
  })
  if (error) throw toApiError(error, 'bootstrap_household')
  return jsonOk({ next: '/dashboard' }, 201)
})
