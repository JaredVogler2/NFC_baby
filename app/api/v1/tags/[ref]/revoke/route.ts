import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { getTag } from '@/lib/db/tags'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk } from '@/lib/http/server'

/** Permanently retire a sticker URL (lost/stolen/replaced). Create a new tag to replace it. */
export const POST = apiRoute<{ params: Promise<{ ref: string }> }>(
  '/api/v1/tags/:id/revoke',
  async (request, { params }) => {
    assertSameOrigin(request)
    const { ref } = await params
    if (!z.uuid().safeParse(ref).success) throw new ApiError('NOT_FOUND')
    const { supabase } = await requireApiMember(['owner', 'parent'])
    const { error } = await supabase.rpc('revoke_tag', { p_tag_id: ref })
    if (error) throw toApiError(error, 'revoke_tag')
    return jsonOk({ tag: await getTag(supabase, ref) })
  },
)
