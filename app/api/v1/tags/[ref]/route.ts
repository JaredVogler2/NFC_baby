import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { getTag, resolveTag } from '@/lib/db/tags'
import { tagUpdateSchema } from '@/lib/domain/schemas'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { isTagToken } from '@/lib/nfc/token'

type Ctx = { params: Promise<{ ref: string }> }

/** GET /api/v1/tags/:token — authenticated, read-only resolution (404 for unknown or not yours). */
export const GET = apiRoute<Ctx>('/api/v1/tags/:token', async (_request, { params }) => {
  const { ref } = await params
  if (!isTagToken(ref)) throw new ApiError('NOT_FOUND')
  const { supabase } = await requireApiMember()
  const resolved = await resolveTag(supabase, ref)
  if (!resolved) throw new ApiError('NOT_FOUND')
  return jsonOk(resolved)
})

/** PATCH /api/v1/tags/:id — relabel / reassign without rewriting the physical sticker. */
export const PATCH = apiRoute<Ctx>('/api/v1/tags/:id', async (request, { params }) => {
  assertSameOrigin(request)
  const { ref } = await params
  if (!z.uuid().safeParse(ref).success) throw new ApiError('NOT_FOUND')
  const { supabase } = await requireApiMember(['owner', 'parent'])
  const input = await readJson(request, tagUpdateSchema)
  const { error } = await supabase.rpc('update_tag', {
    p_tag_id: ref,
    p_label: input.label,
    p_child_id: input.childId,
    p_purpose: input.purpose,
  })
  if (error) throw toApiError(error, 'update_tag')
  return jsonOk({ tag: await getTag(supabase, ref) })
})
