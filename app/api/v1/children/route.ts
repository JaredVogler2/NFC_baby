import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { childSchema } from '@/lib/domain/schemas'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'

export const POST = apiRoute('/api/v1/children', async (request) => {
  assertSameOrigin(request)
  const { ctx, supabase } = await requireApiMember(['owner'])
  const input = await readJson(request, childSchema)
  const { data, error } = await supabase.rpc('upsert_child', {
    p_household_id: ctx.membership.householdId,
    p_child_id: null,
    p_nickname: input.nickname,
    p_archived: false,
  })
  if (error) throw toApiError(error, 'upsert_child')
  return jsonOk({ id: data as string }, 201)
})
