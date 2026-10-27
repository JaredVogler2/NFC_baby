'use client'

import type { CareEvent } from '@/lib/domain/event'
import type { FormState } from '@/lib/logging/attempt'
import { EditEventForm } from './EditEventForm'
import { FeedFields } from './FeedFields'
import { feedingFromForm } from './LogForm'

function feedFormFor(event: CareEvent): FormState | undefined {
  const f = event.feeding
  if (!f) return undefined
  return {
    whenMode: 'custom',
    date: '',
    time: '',
    ambiguityChoice: 0,
    notes: '',
    notesOpen: false,
    feedMethod: event.subtype === 'NURSING' ? 'NURSING' : 'BOTTLE',
    milkType: f.milkType,
    amount: f.amountEnteredValue !== null ? String(Number(f.amountEnteredValue)) : '',
    amountUnit: f.amountEnteredUnit ?? 'oz',
    amountUnknown: f.amountUnknown,
    side: f.side,
    durationMinutes: f.durationSeconds ? String(Math.round(f.durationSeconds / 60)) : '',
    confirmOld: false,
  }
}

/** Event-type-aware composition of the edit form. */
export function EditEventFormForEvent({ event, timezone }: { event: CareEvent; timezone: string }) {
  return (
    <EditEventForm
      event={event}
      timezone={timezone}
      initialFeedForm={feedFormFor(event)}
      feedingFromForm={feedingFromForm}
      renderFeeding={(slot) => <FeedFields {...slot} timezone={timezone} />}
    />
  )
}
