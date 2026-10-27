import 'server-only'
import { serverEnv } from '@/lib/env/server'
import { ApiError } from '@/lib/http/errors'
import { isValidTwilioSignature } from './twilio-signature'

/**
 * Parse and authenticate a Twilio webhook (form-encoded). The signed URL is the public APP_URL
 * origin + path (what Twilio called), not the internal request URL behind Vercel's proxy.
 */
export async function verifiedTwilioForm(
  request: Request,
  path: string,
): Promise<Record<string, string>> {
  const env = serverEnv()
  if (!env.TWILIO_AUTH_TOKEN) throw new ApiError('NOT_FOUND')
  if (
    !(request.headers.get('content-type') ?? '').startsWith('application/x-www-form-urlencoded')
  ) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE')
  }
  const text = await request.text()
  if (text.length > 16_384) throw new ApiError('PAYLOAD_TOO_LARGE')
  const params = Object.fromEntries(new URLSearchParams(text))
  const origin = env.APP_URL ? new URL(env.APP_URL).origin : new URL(request.url).origin
  const query = new URL(request.url).search
  if (
    !isValidTwilioSignature(
      env.TWILIO_AUTH_TOKEN,
      `${origin}${path}${query}`,
      params,
      request.headers.get('x-twilio-signature'),
    )
  ) {
    throw new ApiError('FORBIDDEN')
  }
  return params
}
