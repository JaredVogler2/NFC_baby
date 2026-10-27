import { safeNextPath } from '@/lib/auth/redirect'
import { destinationAfterSignIn } from '@/lib/auth/destination'
import { otpVerifySchema } from '@/lib/domain/schemas'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/** Verify the emailed code and start a cookie session (works inside the home-screen app). */
export const POST = apiRoute('/api/v1/auth/verify', async (request) => {
  assertSameOrigin(request)
  const { email, code, next } = await readJson(request, otpVerifySchema)
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
  if (error) {
    throw new ApiError('VALIDATION', 'That code is not valid or has expired.', {
      fields: { code: 'That code is not valid or has expired.' },
    })
  }
  return jsonOk({ next: await destinationAfterSignIn(supabase, safeNextPath(next)) })
})
