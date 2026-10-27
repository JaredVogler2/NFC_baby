'use client'

import type { CareEvent } from '@/lib/domain/event'
import { EditEventForm } from './EditEventForm'

/** Event-type-aware composition of the edit form (feeding fields are added in phase 06). */
export function EditEventFormForEvent({ event, timezone }: { event: CareEvent; timezone: string }) {
  return <EditEventForm event={event} timezone={timezone} />
}
