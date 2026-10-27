import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { notificationPrefsSchema } from '@/lib/domain/schemas'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'

/** Your own text preferences (categories, quiet hours, include own entries, on/off). */
export const PATCH = apiRoute('/api/v1/notifications/preferences', async (request) => {
  assertSameOrigin(request)
  const { ctx, supabase } = await requireApiMember(['owner', 'parent'])
  const p = await readJson(request, notificationPrefsSchema)
  const { error } = await supabase.rpc('update_my_notification_prefs', {
    p_household_id: ctx.membership.householdId,
    p_auto_sms_enabled: p.autoSmsEnabled,
    p_categories: p.categories,
    p_include_own_entries: p.includeOwnEntries,
    p_quiet_hours_enabled: p.quietHoursEnabled,
    p_quiet_start: p.quietStart,
    p_quiet_end: p.quietEnd,
  })
  if (error) throw toApiError(error, 'update_my_notification_prefs')
  return jsonOk({ ok: true })
})
