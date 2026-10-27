import 'server-only'

/**
 * Kick the notification dispatcher after the response is sent. Phase 08 wires the real
 * dispatcher; until then queued rows simply wait (and the UI says "queued", never "sent").
 */
export function scheduleDispatch(_eventId: string): void {}
