import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { removeContact } from '@/lib/notifications/contacts'

export const POST = apiRoute('/api/v1/notifications/contact/remove', async (request) => {
  assertSameOrigin(request)
  const { ctx } = await requireApiMember(['owner', 'parent'])
  const { userId } = await readJson(request, z.object({ userId: z.uuid().optional() }))
  await removeContact(ctx, userId ?? ctx.userId)
  return jsonOk({ ok: true })
})
