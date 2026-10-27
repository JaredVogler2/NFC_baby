import { destinationAfterSignIn } from '@/lib/auth/destination'
import { consumeNext } from '@/lib/auth/otp'
import { confirmSchema } from '@/lib/domain/schemas'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Finish the email-link sign-in. Called by a button on /auth/confirm (POST), so mail scanners
 * and link previews that merely GET the link cannot consume the one-time token.
 */
export const POST = apiRoute('/api/v1/auth/confirm', async (request) => {
  assertSameOrigin(request)
  const { tokenHash } = await readJson(request, confirmSchema)
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  if (error) {
    throw new ApiError('VALIDATION', 'This sign-in link has expired or was already used.')
  }
  return jsonOk({ next: await destinationAfterSignIn(supabase, await consumeNext()) })
})
