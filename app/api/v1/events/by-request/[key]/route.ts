import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { findEventIdByRequest, getEvent } from '@/lib/db/events'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, jsonOk } from '@/lib/http/server'
import { buildNotificationSummary } from '@/lib/notifications/summary'

/**
 * "Did my save go through?" — used after a timeout/network error. 404 means the attempt did not
 * commit and can be retried safely with the same key.
 */
export const GET = apiRoute<{ params: Promise<{ key: string }> }>(
  '/api/v1/events/by-request/:key',
  async (_request, { params }) => {
    const { key } = await params
    if (!z.uuid().safeParse(key).success) throw new ApiError('NOT_FOUND')
    const { user, ctx, supabase } = await requireApiMember()
    const id = await findEventIdByRequest(supabase, user.id, key)
    if (!id) throw new ApiError('NOT_FOUND')
    const event = await getEvent(supabase, id)
    if (!event) throw new ApiError('NOT_FOUND')
    const notification = await buildNotificationSummary(supabase, ctx, event)
    return jsonOk({ event, replayed: true, notification })
  },
)
