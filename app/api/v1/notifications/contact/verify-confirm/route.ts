import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { confirmVerification } from '@/lib/notifications/contacts'

export const POST = apiRoute('/api/v1/notifications/contact/verify-confirm', async (request) => {
  assertSameOrigin(request)
  const { ctx } = await requireApiMember(['owner', 'parent'])
  const { code } = await readJson(
    request,
    z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.') }),
  )
  await confirmVerification(ctx, code)
  return jsonOk({ ok: true })
})
