import { requireApiMember } from '@/lib/auth/member'
import { generateInviteToken, hashToken } from '@/lib/auth/otp'
import { toApiError } from '@/lib/db/errors'
import { inviteCreateSchema } from '@/lib/domain/schemas'
import { appOrigin } from '@/lib/env/server'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'

const INVITE_TTL_HOURS = 72

/** Owner creates a single-use invite link. Only the SHA-256 of the token is stored. */
export const POST = apiRoute('/api/v1/invites', async (request) => {
  assertSameOrigin(request)
  const { ctx, supabase } = await requireApiMember(['owner'])
  const input = await readJson(request, inviteCreateSchema)
  const token = generateInviteToken()
  const { data, error } = await supabase.rpc('create_invite', {
    p_household_id: ctx.membership.householdId,
    p_email: input.email,
    p_role: input.role,
    p_display_name: input.displayName ?? null,
    p_token_hash: hashToken(token),
    p_ttl_hours: INVITE_TTL_HOURS,
  })
  if (error) throw toApiError(error, 'create_invite')
  return jsonOk(
    {
      id: data as string,
      url: `${appOrigin(request.url)}/invite/${token}`,
      expiresInHours: INVITE_TTL_HOURS,
    },
    201,
  )
})
