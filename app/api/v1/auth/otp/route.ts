import { ensureBootstrapUser, rememberNext, sendSignInCode, takeAuthCodeSlot } from '@/lib/auth/otp'
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
  // Same cooldown for every address, checked before Supabase is asked, so a member's address
  // can't be told apart from a stranger's by its rate-limit response.
  if (!(await takeAuthCodeSlot(email))) throw new ApiError('RATE_LIMITED')
  await ensureBootstrapUser(email)
  const result = await sendSignInCode(email)
  // Auth's own per-user limit only applies to members: answer exactly as for anyone else (the
  // code from the previous email is still valid).
  if (result === 'unavailable') throw new ApiError('UNAVAILABLE')
  await rememberNext(next)
  return jsonOk({ ok: true })
})
