import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { getTag, listTags } from '@/lib/db/tags'
import { tagCreateSchema } from '@/lib/domain/schemas'
import { tagOrigin } from '@/lib/env/origin'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { generateTagToken, tagUrl } from '@/lib/nfc/token'

/** Register a sticker mapping (opaque token → child + purpose). Logs nothing. */
export const POST = apiRoute('/api/v1/tags', async (request) => {
  assertSameOrigin(request)
  const { supabase } = await requireApiMember(['owner', 'parent'])
  const input = await readJson(request, tagCreateSchema)
  const token = generateTagToken()
  const { data, error } = await supabase.rpc('create_tag', {
    p_token: token,
    p_child_id: input.childId,
    p_purpose: input.purpose,
    p_label: input.label,
  })
  if (error) throw toApiError(error, 'create_tag')
  const tag = await getTag(supabase, data as string)
  if (!tag) throw new ApiError('INTERNAL')
  const { origin, warnings } = await tagOrigin()
  return jsonOk({ tag, url: tagUrl(origin, tag.token), warnings }, 201)
})

export const GET = apiRoute('/api/v1/tags', async () => {
  const { ctx, supabase } = await requireApiMember(['owner', 'parent'])
  const { origin, warnings } = await tagOrigin()
  const tags = await listTags(supabase, ctx.membership.householdId)
  return jsonOk({ tags: tags.map((t) => ({ ...t, url: tagUrl(origin, t.token) })), warnings })
})
