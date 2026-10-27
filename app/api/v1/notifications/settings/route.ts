import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { apiRoute, jsonOk } from '@/lib/http/server'
import { smsAvailability } from '@/lib/notifications/providers'

export const GET = apiRoute('/api/v1/notifications/settings', async () => {
  const { ctx, supabase } = await requireApiMember()
  const { data, error } = await supabase.rpc('get_notification_overview', {
    p_household_id: ctx.membership.householdId,
  })
  if (error) throw toApiError(error, 'get_notification_overview')
  const { available, reason } = smsAvailability()
  return jsonOk({ overview: data, sms: { available, reason } })
})
