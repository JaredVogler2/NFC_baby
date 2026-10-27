import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { setContact } from '@/lib/notifications/contacts'

/** Save a number (yours, or as owner another adult's). It stays unverified until that person confirms. */
export const POST = apiRoute('/api/v1/notifications/contact', async (request) => {
  assertSameOrigin(request)
  const { ctx } = await requireApiMember(['owner', 'parent'])
  const { phone, userId } = await readJson(
    request,
    z.object({ phone: z.string().min(7).max(32), userId: z.uuid().optional() }),
  )
  return jsonOk(await setContact(ctx, userId ?? ctx.userId, phone))
})
