import { hashToken } from '@/lib/auth/otp'
import { getSessionUser } from '@/lib/auth/session'
import { toApiError } from '@/lib/db/errors'
import { inviteAcceptSchema } from '@/lib/domain/schemas'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const POST = apiRoute('/api/v1/invites/accept', async (request) => {
  assertSameOrigin(request)
  if (!(await getSessionUser())) throw new ApiError('UNAUTHENTICATED')
  const { token, displayName } = await readJson(request, inviteAcceptSchema)
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc('accept_invite', {
    p_token_hash: hashToken(token),
    p_display_name: displayName,
  })
  if (error) {
    if (error.message === 'INVITE_EMAIL_MISMATCH') {
      throw new ApiError('FORBIDDEN', 'You are signed in with a different email than the invite.')
    }
    if (error.code === 'NB404')
      throw new ApiError('NOT_FOUND', 'This invite link is not valid anymore.')
    throw toApiError(error, 'accept_invite')
  }
  return jsonOk({ next: '/dashboard' })
})
