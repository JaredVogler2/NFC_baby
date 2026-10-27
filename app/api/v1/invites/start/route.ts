import { lookupInvite } from '@/lib/auth/invites'
import { ensureInvitedUser, rememberNext, sendSignInCode } from '@/lib/auth/otp'
import { inviteStartSchema } from '@/lib/domain/schemas'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'

/**
 * Invitee proves they hold the invite link AND the invited email: only then is their account
 * created (if needed) and a sign-in code emailed.
 */
export const POST = apiRoute('/api/v1/invites/start', async (request) => {
  assertSameOrigin(request)
  const { token, email } = await readJson(request, inviteStartSchema)
  const invite = await lookupInvite(token)
  if (invite.status !== 'valid')
    throw new ApiError('NOT_FOUND', 'This invite link is not valid anymore.')
  if (invite.email !== email) {
    throw new ApiError('VALIDATION', 'Use the email address the invite was sent to.', {
      fields: { email: `Use the invited address (${invite.emailHint}).` },
    })
  }
  await ensureInvitedUser(email)
  const result = await sendSignInCode(email)
  if (result === 'rate_limited') throw new ApiError('RATE_LIMITED')
  if (result !== 'sent') throw new ApiError('UNAVAILABLE')
  await rememberNext(`/invite/${token}`)
  return jsonOk({ ok: true })
})
