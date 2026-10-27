import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Twilio request validation (https://www.twilio.com/docs/usage/security#validating-requests):
 * HMAC-SHA1 over the full URL followed by each POST parameter name+value, sorted by name,
 * keyed with the account auth token, base64-encoded, compared with X-Twilio-Signature.
 */
export function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64')
}

export function isValidTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): boolean {
  if (!signature) return false
  const expected = Buffer.from(twilioSignature(authToken, url, params))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
