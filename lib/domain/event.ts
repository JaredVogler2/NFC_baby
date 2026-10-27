import {
  MILK_LABEL,
  SIDE_LABEL,
  SUBTYPE_LABEL,
  intentForSubtype,
  type EventState,
  type EventType,
  type Intent,
  type MilkType,
  type NursingSide,
  type SourceType,
  type Subtype,
} from './intents'
import { displayAmount, type VolumeUnit } from './units'
import { formatDuration } from '@/lib/time/zoned'

export type FeedingDetails = {
  milkType: MilkType | null
  amountMl: number | null
  amountUnknown: boolean
  amountEnteredValue: number | null
  amountEnteredUnit: VolumeUnit | null
  side: NursingSide | null
  durationSeconds: number | null
  endedAt: string | null
}

export type CareEvent = {
  id: string
  childId: string
  eventType: EventType
  subtype: Subtype
  intent: Intent
  occurredAt: string
  createdAt: string
  updatedAt: string
  createdBy: string
  createdByName: string
  updatedBy: string | null
  updatedByName: string | null
  source: SourceType
  sourceTagId: string | null
  sourceTagLabel: string | null
  notes: string | null
  state: EventState
  voidedAt: string | null
  voidedBy: string | null
  voidedByName: string | null
  voidReason: string | null
  revision: number
  feeding: FeedingDetails | null
}

/** Row of the `care_event_list` view (snake_case, numerics may arrive as strings). */
export type CareEventRow = Record<string, unknown>

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))

export function toCareEvent(row: CareEventRow): CareEvent {
  const subtype = row.subtype as Subtype
  const isFeed = row.event_type === 'FEED'
  return {
    id: String(row.id),
    childId: String(row.child_id),
    eventType: row.event_type as EventType,
    subtype,
    intent: intentForSubtype(subtype),
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    createdBy: String(row.created_by),
    createdByName: str(row.created_by_name) ?? 'Someone',
    updatedBy: str(row.updated_by),
    updatedByName: str(row.updated_by_name),
    source: row.source as SourceType,
    sourceTagId: str(row.source_tag_id),
    sourceTagLabel: str(row.source_tag_label),
    notes: str(row.notes),
    state: row.state as EventState,
    voidedAt: str(row.voided_at),
    voidedBy: str(row.voided_by),
    voidedByName: str(row.voided_by_name),
    voidReason: str(row.void_reason),
    revision: Number(row.revision),
    feeding: isFeed
      ? {
          milkType: (row.milk_type as MilkType | null) ?? null,
          amountMl: num(row.amount_ml),
          amountUnknown: Boolean(row.amount_unknown),
          amountEnteredValue: num(row.amount_entered_value),
          amountEnteredUnit: (row.amount_entered_unit as VolumeUnit | null) ?? null,
          side: (row.side as NursingSide | null) ?? null,
          durationSeconds: num(row.duration_seconds),
          endedAt: str(row.ended_at),
        }
      : null,
  }
}

export function bottleAmountText(f: FeedingDetails, unit: VolumeUnit): string {
  return displayAmount(
    {
      ml: f.amountMl,
      enteredValue: f.amountEnteredValue,
      enteredUnit: f.amountEnteredUnit,
      unknown: f.amountUnknown,
    },
    unit,
  )
}

/** Short human summary: "Wet diaper", "Bottle · Breastmilk · 3.5 oz", "Nursing · Left · 12 min". */
export function eventSummary(e: Pick<CareEvent, 'subtype' | 'feeding'>, unit: VolumeUnit): string {
  if (e.subtype === 'BOTTLE' && e.feeding) {
    const parts = ['Bottle']
    if (e.feeding.milkType && e.feeding.milkType !== 'UNKNOWN')
      parts.push(MILK_LABEL[e.feeding.milkType])
    parts.push(bottleAmountText(e.feeding, unit))
    return parts.join(' · ')
  }
  if (e.subtype === 'NURSING' && e.feeding) {
    const parts = ['Nursing']
    if (e.feeding.side && e.feeding.side !== 'UNKNOWN') parts.push(SIDE_LABEL[e.feeding.side])
    if (e.feeding.durationSeconds) parts.push(formatDuration(e.feeding.durationSeconds))
    return parts.join(' · ')
  }
  return SUBTYPE_LABEL[e.subtype]
}
