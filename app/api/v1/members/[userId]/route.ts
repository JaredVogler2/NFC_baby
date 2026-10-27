import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { memberUpdateSchema } from '@/lib/domain/schemas'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'

/** Owner changes a member's role or deactivates/reactivates them (cannot remove the last owner). */
export const PATCH = apiRoute<{ params: Promise<{ userId: string }> }>(
  '/api/v1/members/:userId',
  async (request, { params }) => {
    assertSameOrigin(request)
    const { userId } = await params
    if (!z.uuid().safeParse(userId).success) throw new ApiError('NOT_FOUND')
    const { ctx, supabase } = await requireApiMember(['owner'])
    const input = await readJson(request, memberUpdateSchema)
    const hh = ctx.membership.householdId
    if (input.role) {
      const { error } = await supabase.rpc('set_member_role', {
        p_household_id: hh,
        p_user_id: userId,
        p_role: input.role,
      })
      if (error) throw toApiError(error, 'set_member_role')
    }
    if (input.disabled !== undefined) {
      const { error } = await supabase.rpc('set_member_disabled', {
        p_household_id: hh,
        p_user_id: userId,
        p_disabled: input.disabled,
      })
      if (error) throw toApiError(error, 'set_member_disabled')
    }
    return jsonOk({ ok: true })
  },
)
