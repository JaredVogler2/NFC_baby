import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { pickChild } from '@/lib/db/context'
import { getDashboard } from '@/lib/db/events'
import { apiRoute, jsonOk, parseQuery } from '@/lib/http/server'

export const GET = apiRoute('/api/v1/dashboard', async (request) => {
  const { ctx, supabase } = await requireApiMember()
  const { childId } = parseQuery(new URL(request.url), z.object({ childId: z.uuid().optional() }))
  const child = pickChild(ctx, childId)
  if (!child) return jsonOk({ child: null, dashboard: null })
  return jsonOk({ child, dashboard: await getDashboard(supabase, child.id) })
})
