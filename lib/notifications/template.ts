import type { CareEvent } from '@/lib/domain/event'
import { bottleAmountText } from '@/lib/domain/event'
import { SUBTYPE_LABEL } from '@/lib/domain/intents'
import type { VolumeUnit } from '@/lib/domain/units'
import { formatShortDate, formatTime, localDateKey } from '@/lib/time/zoned'

/**
 * Privacy-conscious parent update text. Deliberately excludes: child name, notes, date of birth,
 * phone numbers, tokens, unauthenticated links. Uses the event's occurrence time in the family
 * zone, with the date added when it is not today.
 *
 *   "Baby update: Wet diaper at 2:14 AM (logged by Dad)."
 *   "Baby update: Bottle, 3.5 oz breastmilk at 3:20 AM (logged by Mom)."
 */
export function renderUpdateText(
  event: Pick<CareEvent, 'subtype' | 'feeding' | 'occurredAt' | 'createdByName'>,
  opts: { timezone: string; unit: VolumeUnit; now?: Date; link?: string | null },
): string {
  const at = new Date(event.occurredAt)
  const now = opts.now ?? new Date()
  const sameDay = localDateKey(at, opts.timezone) === localDateKey(now, opts.timezone)
  const when = sameDay
    ? formatTime(at, opts.timezone)
    : `${formatShortDate(at, opts.timezone)} ${formatTime(at, opts.timezone)}`

  let what: string
  if (event.subtype === 'BOTTLE' && event.feeding) {
    const milk =
      event.feeding.milkType === 'BREASTMILK'
        ? 'breastmilk'
        : event.feeding.milkType === 'FORMULA'
          ? 'formula'
          : event.feeding.milkType === 'OTHER'
            ? 'other milk'
            : ''
    what = event.feeding.amountUnknown
      ? `Bottle (amount not measured)${milk ? `, ${milk}` : ''}`
      : `Bottle, ${bottleAmountText(event.feeding, opts.unit)}${milk ? ` ${milk}` : ''}`
  } else {
    what = event.subtype === 'BOTH' ? 'Wet + poop' : SUBTYPE_LABEL[event.subtype]
  }
  const author = sanitizeName(event.createdByName)
  const text = `Baby update: ${what} at ${when} (logged by ${author}).`
  return opts.link ? `${text} View: ${opts.link}` : text
}

/**
 * Display names are user-entered and go out from the family's registered sender: keep them
 * single-line and short, and strip anything link- or phone-number-like (carriers filter those,
 * and a name must never become a way to send someone a link or a number).
 */
export function sanitizeName(name: string): string {
  const clean = name
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\b(?:https?:\/\/|www\.)\S*/gi, '')
    .replace(/\b[\w-]+(?:\.[\w-]+)*\.(?:[a-z]{2,})(?:\/\S*)?/gi, '')
    .replace(/[+()\d][\d\s().-]{4,}\d/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim()
  return clean || 'a parent'
}
