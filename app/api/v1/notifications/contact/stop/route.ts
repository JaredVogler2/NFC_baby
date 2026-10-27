import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { stopTexts } from '@/lib/notifications/contacts'

/** Stop automatic texts immediately (same effect as replying STOP); pending texts are canceled. */
export const POST = apiRoute('/api/v1/notifications/contact/stop', async (request) => {
  assertSameOrigin(request)
  const { ctx } = await requireApiMember(['owner', 'parent'])
  const { userId } = await readJson(request, z.object({ userId: z.uuid().optional() }))
  await stopTexts(ctx, userId ?? ctx.userId)
  return jsonOk({ ok: true })
})
