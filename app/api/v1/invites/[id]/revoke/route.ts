import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk } from '@/lib/http/server'

export const POST = apiRoute<{ params: Promise<{ id: string }> }>(
  '/api/v1/invites/:id/revoke',
  async (request, { params }) => {
    assertSameOrigin(request)
    const { id } = await params
    if (!z.uuid().safeParse(id).success) throw new ApiError('NOT_FOUND')
    const { supabase } = await requireApiMember(['owner'])
    const { error } = await supabase.rpc('revoke_invite', { p_invite_id: id })
    if (error) throw toApiError(error, 'revoke_invite')
    return jsonOk({ ok: true })
  },
)
