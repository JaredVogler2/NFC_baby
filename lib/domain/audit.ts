import {
  MILK_LABEL,
  SIDE_LABEL,
  SUBTYPE_LABEL,
  type MilkType,
  type NursingSide,
  type Subtype,
} from './intents'
import type { VolumeUnit } from './units'
import { formatDuration, formatShortDate, formatTime } from '@/lib/time/zoned'

type Change = { from: unknown; to: unknown }

/** Human-readable lines for one audit UPDATE diff ("Time: 2:10 AM → 2:05 AM"). */
export function describeChanges(
  changes: Record<string, unknown>,
  opts: {
    timezone: string
    childNames: Map<string, string>
    /** Current values, for context when only part of an amount changed. */
    current?: {
      amountUnknown: boolean
      amountEnteredValue: number | null
      amountEnteredUnit: VolumeUnit | null
    }
  },
): string[] {
  const c = changes as Record<string, Change | undefined>
  const lines: string[] = []
  const when = (iso: unknown) =>
    typeof iso === 'string'
      ? `${formatShortDate(new Date(iso), opts.timezone)} ${formatTime(new Date(iso), opts.timezone)}`
      : '—'

  if (c.subtype)
    lines.push(
      `Type: ${SUBTYPE_LABEL[c.subtype.from as Subtype]} → ${SUBTYPE_LABEL[c.subtype.to as Subtype]}`,
    )
  if (c.occurredAt) lines.push(`Time: ${when(c.occurredAt.from)} → ${when(c.occurredAt.to)}`)
  if (c.childId) {
    lines.push(
      `Child: ${opts.childNames.get(String(c.childId.from)) ?? 'another child'} → ${opts.childNames.get(String(c.childId.to)) ?? 'another child'}`,
    )
  }
  if (c.notes) {
    const from = c.notes.from as string | null
    const to = c.notes.to as string | null
    lines.push(!from ? `Note added: “${to}”` : !to ? 'Note removed' : `Note: “${from}” → “${to}”`)
  }
  if (c.milkType && (c.milkType.from || c.milkType.to)) {
    const label = (v: unknown) => (v ? MILK_LABEL[v as MilkType] : '—')
    lines.push(`Milk: ${label(c.milkType.from)} → ${label(c.milkType.to)}`)
  }
  if (c.amountEnteredValue || c.amountEnteredUnit || c.amountUnknown) {
    const amount = (k: 'from' | 'to') => {
      const unknown = c.amountUnknown ? Boolean(c.amountUnknown[k]) : opts.current?.amountUnknown
      if (unknown) return 'not measured'
      const value = c.amountEnteredValue
        ? c.amountEnteredValue[k]
        : opts.current?.amountEnteredValue
      const unit = c.amountEnteredUnit ? c.amountEnteredUnit[k] : opts.current?.amountEnteredUnit
      if (typeof value !== 'number') return '—'
      return `${value} ${unit === 'ml' ? 'mL' : 'oz'}`
    }
    lines.push(`Amount: ${amount('from')} → ${amount('to')}`)
  }
  if (c.side && (c.side.from || c.side.to)) {
    const label = (v: unknown) => (v ? SIDE_LABEL[v as NursingSide] : '—')
    lines.push(`Side: ${label(c.side.from)} → ${label(c.side.to)}`)
  }
  if (c.durationSeconds) {
    const d = (v: unknown) => (typeof v === 'number' ? formatDuration(v) : '—')
    lines.push(`Duration: ${d(c.durationSeconds.from)} → ${d(c.durationSeconds.to)}`)
  }
  if (c.endedAt) lines.push(`Ended: ${when(c.endedAt.from)} → ${when(c.endedAt.to)}`)
  return lines.length ? lines : ['Details changed']
}
