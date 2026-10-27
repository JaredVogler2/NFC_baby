import 'server-only'
import { after } from 'next/server'
import { dispatchOutbox } from './dispatch'

/** Send this event's queued texts right after the response (Vercel keeps the function alive). */
export function scheduleDispatch(eventId: string): void {
  after(() => dispatchOutbox({ eventId }).then(() => undefined))
}

/** Opportunistic retry pass for due rows (cheap when nothing is due). */
export function scheduleDueRetries(): void {
  after(() => dispatchOutbox({ limit: 10 }).then(() => undefined))
}
