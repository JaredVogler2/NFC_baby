import 'server-only'
import type { CareEvent } from '@/lib/domain/event'
import { MILK_LABEL, SIDE_LABEL, SUBTYPE_LABEL } from '@/lib/domain/intents'
import { localDateKey, localTimeValue, tzAbbreviation } from '@/lib/time/zoned'
import { toCsv } from './csv'

export const EXPORT_COLUMNS_DOC = [
  ['event_id', 'Stable id of the entry'],
  ['occurred_local', 'When it happened, family time zone (YYYY-MM-DD HH:MM + zone)'],
  ['occurred_utc', 'When it happened, UTC (ISO 8601)'],
  ['recorded_utc', 'When it was recorded, UTC'],
  ['child', 'Child nickname'],
  ['type', 'Wet diaper / Poop diaper / Wet + poop / Bottle / Nursing'],
  ['milk', 'Bottle milk type'],
  ['amount_ml', 'Bottle amount in mL (empty when not measured)'],
  ['amount_entered', 'Amount as entered, with unit'],
  ['amount_not_measured', 'true when the bottle amount was explicitly not measured'],
  ['side', 'Nursing side'],
  ['duration_min', 'Nursing duration in minutes'],
  ['notes', 'Free-text note'],
  ['logged_by', 'Who logged it'],
  ['source', 'TAG / DASHBOARD / OFFLINE_SYNC'],
  ['state', 'ACTIVE or VOID (undone)'],
  ['voided_utc', 'When it was undone'],
  ['voided_by', 'Who undid it'],
  ['revision', 'Number of saved versions'],
] as const

export function eventsToCsv(
  events: CareEvent[],
  tz: string,
  childNames: Map<string, string>,
): string {
  return toCsv(events, [
    { header: 'event_id', value: (e) => e.id },
    {
      header: 'occurred_local',
      value: (e) => {
        const d = new Date(e.occurredAt)
        return `${localDateKey(d, tz)} ${localTimeValue(d, tz)} ${tzAbbreviation(d, tz)}`
      },
    },
    { header: 'occurred_utc', value: (e) => new Date(e.occurredAt).toISOString() },
    { header: 'recorded_utc', value: (e) => new Date(e.createdAt).toISOString() },
    { header: 'child', value: (e) => childNames.get(e.childId) ?? '' },
    { header: 'type', value: (e) => SUBTYPE_LABEL[e.subtype] },
    { header: 'milk', value: (e) => (e.feeding?.milkType ? MILK_LABEL[e.feeding.milkType] : '') },
    { header: 'amount_ml', value: (e) => e.feeding?.amountMl ?? '' },
    {
      header: 'amount_entered',
      value: (e) =>
        e.feeding?.amountEnteredValue != null
          ? `${e.feeding.amountEnteredValue} ${e.feeding.amountEnteredUnit}`
          : '',
    },
    {
      header: 'amount_not_measured',
      value: (e) => (e.subtype === 'BOTTLE' ? Boolean(e.feeding?.amountUnknown) : ''),
    },
    { header: 'side', value: (e) => (e.feeding?.side ? SIDE_LABEL[e.feeding.side] : '') },
    {
      header: 'duration_min',
      value: (e) => (e.feeding?.durationSeconds ? Math.round(e.feeding.durationSeconds / 60) : ''),
    },
    { header: 'notes', value: (e) => e.notes ?? '' },
    { header: 'logged_by', value: (e) => e.createdByName },
    { header: 'source', value: (e) => e.source },
    { header: 'state', value: (e) => e.state },
    { header: 'voided_utc', value: (e) => (e.voidedAt ? new Date(e.voidedAt).toISOString() : '') },
    { header: 'voided_by', value: (e) => e.voidedByName ?? '' },
    { header: 'revision', value: (e) => e.revision },
  ])
}
