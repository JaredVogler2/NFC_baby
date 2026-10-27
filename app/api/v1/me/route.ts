import { requireApiMember } from '@/lib/auth/member'
import { apiRoute, jsonOk } from '@/lib/http/server'

export const GET = apiRoute('/api/v1/me', async () => {
  const { ctx } = await requireApiMember()
  return jsonOk(ctx)
})
