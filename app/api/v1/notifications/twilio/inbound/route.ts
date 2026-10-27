import { phoneHmac } from '@/lib/crypto/contacts'
import { apiRoute } from '@/lib/http/server'
import { errorCode, log } from '@/lib/log'
import { STOP_WORDS } from '@/lib/notifications/consent'
import { normalizePhone } from '@/lib/notifications/phone'
import { verifiedTwilioForm } from '@/lib/notifications/webhook'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * Inbound SMS webhook (signature-verified). STOP-style replies opt the sender out of every
 * family that uses that number and cancel unsent texts. Twilio's Advanced Opt-Out also blocks
 * further sends at the carrier level and answers HELP/STOP itself. Re-subscribing requires
 * re-verifying in the app.
 */
export const POST = apiRoute('/api/v1/notifications/twilio/inbound', async (request) => {
  const form = await verifiedTwilioForm(request, '/api/v1/notifications/twilio/inbound')
  const word = (form.Body ?? '').trim().toUpperCase()
  const from = normalizePhone(form.From ?? '')
  if (from && STOP_WORDS.has(word)) {
    const { data, error } = await createSupabaseAdminClient().rpc('record_opt_out', {
      p_phone_hmac: phoneHmac(from),
    })
    if (error) log.error('twilio.opt_out_failed', { code: errorCode(error) })
    else log.info('twilio.opt_out', { count: Number(data) })
  }
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml', 'Cache-Control': 'no-store' },
  })
})
