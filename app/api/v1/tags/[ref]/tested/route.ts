import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk } from '@/lib/http/server'

/** Scan-test confirmation: "this sticker opened the right screen". Records nothing else. */
export const POST = apiRoute<{ params: Promise<{ ref: string }> }>(
  '/api/v1/tags/:id/tested',
  async (request, { params }) => {
    assertSameOrigin(request)
    const { ref } = await params
    if (!z.uuid().safeParse(ref).success) throw new ApiError('NOT_FOUND')
    const { supabase } = await requireApiMember(['owner', 'parent'])
    const { error } = await supabase.rpc('mark_tag_tested', { p_tag_id: ref })
    if (error) throw toApiError(error, 'mark_tag_tested')
    return jsonOk({ ok: true })
  },
)
