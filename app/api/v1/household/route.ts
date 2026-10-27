import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { householdSchema } from '@/lib/domain/schemas'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'

export const PATCH = apiRoute('/api/v1/household', async (request) => {
  assertSameOrigin(request)
  const { ctx, supabase } = await requireApiMember(['owner'])
  const input = await readJson(request, householdSchema)
  const { error } = await supabase.rpc('update_household', {
    p_household_id: ctx.membership.householdId,
    p_display_name: input.displayName,
    p_timezone: input.timezone,
    p_default_feed_method: input.defaultFeedMethod,
    p_default_volume_unit: input.defaultVolumeUnit,
  })
  if (error) throw toApiError(error, 'update_household')
  return jsonOk({ ok: true })
})
