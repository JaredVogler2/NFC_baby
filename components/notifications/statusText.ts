import type { OutboxState } from '@/lib/notifications/summary'

/** Honest per-recipient wording. "Sent to provider" is not "delivered". */
export function recipientStatusText(state: OutboxState, reason: string | null): string {
  switch (state) {
    case 'PENDING':
      return 'queued'
    case 'PROCESSING':
      return 'sending…'
    case 'SENT_TO_PROVIDER':
      return 'sent to the text provider (delivery not yet confirmed)'
    case 'DELIVERED':
      return 'delivered (reported by the carrier)'
    case 'FAILED_RETRYABLE':
      return 'not sent yet — tried again when someone opens Home (or within a day)'
    case 'FAILED_PERMANENT':
      return reason === 'OPTED_OUT' ? 'not sent — this number replied STOP' : 'not sent — failed'
    case 'UNKNOWN':
      return 'unknown — the provider did not confirm; it will not be re-sent automatically'
    case 'CANCELED':
      switch (reason) {
        case 'EVENT_VOIDED':
          return 'not sent — entry was undone first'
        case 'STALE':
          return 'not sent — too late to be useful'
        case 'OPTED_OUT':
          return 'not sent — texts were stopped for this number'
        case 'PREFS_OFF':
        case 'CATEGORY_OFF':
        case 'OWN_ENTRY':
          return 'not sent — turned off in their text settings'
        case 'MODE_OFF':
          return 'not sent — automatic texts were turned off'
        case 'MEMBER_DISABLED':
          return 'not sent — no longer receives texts'
        default:
          return 'not sent — canceled'
      }
    case 'SUPPRESSED':
      return reason === 'QUIET_HOURS'
        ? 'not texted — quiet hours'
        : reason === 'RATE_LIMIT'
          ? 'not texted — too many texts this hour'
          : 'not texted'
  }
}
