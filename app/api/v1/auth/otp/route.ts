import { ensureBootstrapUser, rememberNext, sendSignInCode } from '@/lib/auth/otp'
import { otpRequestSchema } from '@/lib/domain/schemas'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'

/**
 * Send a sign-in code. Responds identically whether or not the email belongs to a member, so the
 * endpoint cannot be used to discover who uses the app.
 */
export const POST = apiRoute('/api/v1/auth/otp', async (request) => {
  assertSameOrigin(request)
  const { email, next } = await readJson(request, otpRequestSchema)
  await ensureBootstrapUser(email)
  const result = await sendSignInCode(email)
  if (result === 'rate_limited') throw new ApiError('RATE_LIMITED')
  if (result === 'unavailable') throw new ApiError('UNAVAILABLE')
  await rememberNext(next)
  return jsonOk({ ok: true })
})
