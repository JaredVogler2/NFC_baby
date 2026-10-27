import { errorCode, log } from '@/lib/log'
import { apiRoute } from '@/lib/http/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { verifiedTwilioForm } from '@/lib/notifications/webhook'

/** Twilio delivery status callback (signature-verified). Moves states forward only. */
export const POST = apiRoute('/api/v1/notifications/twilio/status', async (request) => {
  const form = await verifiedTwilioForm(request, '/api/v1/notifications/twilio/status')
  const sid = form.MessageSid ?? form.SmsSid
  if (sid && form.MessageStatus) {
    const { data, error } = await createSupabaseAdminClient().rpc('apply_provider_status', {
      p_message_id: sid,
      p_status: form.MessageStatus,
      p_error_code: form.ErrorCode ?? null,
    })
    if (error) log.error('twilio.status_failed', { code: errorCode(error) })
    else log.info('twilio.status', { state: String(data) })
  }
  return new Response(null, { status: 204 })
})
