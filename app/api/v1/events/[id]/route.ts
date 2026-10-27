import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { feedingToRpc, getAudit, getEvent } from '@/lib/db/events'
import { can } from '@/lib/domain/intents'
import { updateEventSchema } from '@/lib/domain/schemas'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { buildNotificationSummary } from '@/lib/notifications/summary'

type Ctx = { params: Promise<{ id: string }> }

async function eventId(params: Ctx['params']) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) throw new ApiError('NOT_FOUND')
  return id
}

export const GET = apiRoute<Ctx>('/api/v1/events/:id', async (_request, { params }) => {
  const id = await eventId(params)
  const { ctx, supabase } = await requireApiMember()
  const event = await getEvent(supabase, id)
  if (!event) throw new ApiError('NOT_FOUND')
  const [audit, notification] = await Promise.all([
    can.readAudit(ctx.membership.role) ? getAudit(supabase, id) : Promise.resolve(null),
    buildNotificationSummary(supabase, ctx, event),
  ])
  return jsonOk({ event, audit, notification })
})

/** Correct an entry. Requires the revision the editor saw; 409 if someone changed it since. */
export const PATCH = apiRoute<Ctx>('/api/v1/events/:id', async (request, { params }) => {
  assertSameOrigin(request)
  const id = await eventId(params)
  const { ctx, supabase } = await requireApiMember(['owner', 'parent', 'caregiver'])
  const input = await readJson(request, updateEventSchema)
  const patch: Record<string, unknown> = {}
  if (input.patch.occurredAt !== undefined) patch.occurredAt = input.patch.occurredAt
  if (input.patch.notes !== undefined) patch.notes = input.patch.notes
  if (input.patch.subtype !== undefined) patch.subtype = input.patch.subtype
  if (input.patch.childId !== undefined) patch.childId = input.patch.childId
  if (input.patch.feeding !== undefined) patch.feeding = feedingToRpc(input.patch.feeding)
  const { data, error } = await supabase.rpc('update_care_event', {
    p_event_id: id,
    p_expected_revision: input.expectedRevision,
    p_patch: patch,
    p_confirm_old: input.confirmOld ?? false,
  })
  if (error) throw toApiError(error, 'update_care_event')
  const event = await getEvent(supabase, id)
  if (!event) throw new ApiError('NOT_FOUND')
  const result = data as { changed: boolean; previouslyNotified: boolean }
  const notification = await buildNotificationSummary(supabase, ctx, event)
  return jsonOk({
    event,
    changed: result.changed,
    previouslyNotified: result.previouslyNotified,
    notification,
  })
})
