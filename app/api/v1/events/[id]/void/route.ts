import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { toApiError } from '@/lib/db/errors'
import { getEvent } from '@/lib/db/events'
import { voidEventSchema } from '@/lib/domain/schemas'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'

/** "Undo this entry": an attributed, audited void. Never a delete; never recalls a sent text. */
export const POST = apiRoute<{ params: Promise<{ id: string }> }>(
  '/api/v1/events/:id/void',
  async (request, { params }) => {
    assertSameOrigin(request)
    const { id } = await params
    if (!z.uuid().safeParse(id).success) throw new ApiError('NOT_FOUND')
    const { supabase } = await requireApiMember(['owner', 'parent', 'caregiver'])
    const input = await readJson(request, voidEventSchema)
    const { data, error } = await supabase.rpc('void_care_event', {
      p_event_id: id,
      p_expected_revision: input.expectedRevision,
      p_reason: input.reason ?? null,
    })
    if (error) throw toApiError(error, 'void_care_event')
    const event = await getEvent(supabase, id)
    return jsonOk({ event, ...(data as Record<string, unknown>) })
  },
)
