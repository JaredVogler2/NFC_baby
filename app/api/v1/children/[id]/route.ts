import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { childSchema } from '@/lib/domain/schemas'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'

export const PATCH = apiRoute<{ params: Promise<{ id: string }> }>(
  '/api/v1/children/:id',
  async (request, { params }) => {
    assertSameOrigin(request)
    const { id } = await params
    if (!z.uuid().safeParse(id).success) throw new ApiError('NOT_FOUND')
    const { ctx, supabase } = await requireApiMember(['owner'])
    const input = await readJson(request, childSchema)
    const { error } = await supabase.rpc('upsert_child', {
      p_household_id: ctx.membership.householdId,
      p_child_id: id,
      p_nickname: input.nickname,
      p_archived: input.archived,
    })
    if (error) throw toApiError(error, 'upsert_child')
    return jsonOk({ ok: true })
  },
)
