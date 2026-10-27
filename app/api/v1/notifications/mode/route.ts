import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { notificationModeSchema } from '@/lib/domain/schemas'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { smsAvailability } from '@/lib/notifications/providers'

/** Owner chooses OFF / COMPOSE / AUTOMATIC. AUTOMATIC requires a configured provider. Nothing is sent by switching. */
export const POST = apiRoute('/api/v1/notifications/mode', async (request) => {
  assertSameOrigin(request)
  const { ctx, supabase } = await requireApiMember(['owner'])
  const { mode } = await readJson(request, notificationModeSchema)
  if (mode === 'AUTOMATIC') {
    const { available, reason } = smsAvailability()
    if (!available) throw new ApiError('NOT_CONFIGURED', reason ?? undefined)
  }
  const { error } = await supabase.rpc('set_notification_mode', {
    p_household_id: ctx.membership.householdId,
    p_mode: mode,
  })
  if (error) throw toApiError(error, 'set_notification_mode')
  return jsonOk({ ok: true })
})
