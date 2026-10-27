import { requireApiMember } from '@/lib/auth/member'
import { pickChild } from '@/lib/db/context'
import { createEvent, getEvent, listEvents } from '@/lib/db/events'
import { createEventSchema, listEventsQuerySchema } from '@/lib/domain/schemas'
import type { Intent } from '@/lib/domain/intents'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, parseQuery, readJson } from '@/lib/http/server'
import { scheduleDispatch } from '@/lib/notifications/dispatch-hook'
import { buildNotificationSummary } from '@/lib/notifications/summary'
import { addDays, startOfLocalDay } from '@/lib/time/zoned'

/**
 * POST: deliberately save one care event. Idempotent per (author, clientRequestId):
 * 201 = created now, 200 = this attempt had already been saved (replay).
 */
export const POST = apiRoute('/api/v1/events', async (request) => {
  assertSameOrigin(request)
  const { ctx, supabase } = await requireApiMember(['owner', 'parent', 'caregiver'])
  const input = await readJson(request, createEventSchema)
  const result = await createEvent(supabase, input)
  const event = await getEvent(supabase, result.id)
  if (!event) throw new ApiError('INTERNAL')
  if (result.queued > 0) scheduleDispatch(result.id)
  const notification = await buildNotificationSummary(supabase, ctx, event)
  return jsonOk({ event, replayed: result.replayed, notification }, result.replayed ? 200 : 201)
})

const TYPE_INTENTS: Record<string, Intent[] | null> = {
  all: null,
  diapers: ['WET', 'POOP', 'BOTH'],
  feeding: ['FEED'],
}

/** GET: timeline, newest occurrence first, keyset-paginated. */
export const GET = apiRoute('/api/v1/events', async (request) => {
  const { ctx, supabase } = await requireApiMember()
  const q = parseQuery(new URL(request.url), listEventsQuerySchema)
  const child = pickChild(ctx, q.childId)
  if (!child) return jsonOk({ events: [], nextCursor: null })
  const tz = ctx.household.timezone
  const result = await listEvents(supabase, {
    childId: child.id,
    intents: TYPE_INTENTS[q.type] ?? null,
    from: q.from ? startOfLocalDay(q.from, tz) : null,
    to: q.to ? startOfLocalDay(addDays(q.to, 1), tz) : null,
    includeVoided: q.includeVoided === '1',
    cursor: q.cursor ?? null,
    limit: q.limit,
  })
  return jsonOk(result)
})
