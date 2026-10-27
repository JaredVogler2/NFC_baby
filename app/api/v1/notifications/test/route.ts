import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { sendTestText } from '@/lib/notifications/contacts'

/** Owner-only test text: requires { userId, confirm: true }; one message; logged; max 3/hour. */
export const POST = apiRoute('/api/v1/notifications/test', async (request) => {
  assertSameOrigin(request)
  const { ctx } = await requireApiMember(['owner'])
  const { userId } = await readJson(
    request,
    z.object({ userId: z.uuid(), confirm: z.literal(true) }),
  )
  return jsonOk(await sendTestText(ctx, userId))
})
