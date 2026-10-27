/**
 * Save-attempt persistence. One deliberate Save = one clientRequestId. The id and the form
 * snapshot are kept in sessionStorage until the server confirms, so that
 *   - network retries and "did it save?" checks reuse the same id (no duplicates), and
 *   - an expired session can be renewed without losing what the parent typed.
 * Snapshots are scoped to the signed-in user id: another person signing in on the same phone never
 * sees or submits someone else's unsaved entry.
 */

export const ATTEMPT_TTL_MS = 2 * 60 * 60 * 1000

export type FormState = {
  whenMode: 'now' | 'custom'
  date: string
  time: string
  ambiguityChoice: number
  notes: string
  notesOpen: boolean
  feedMethod: 'BOTTLE' | 'NURSING' | null
  milkType: 'BREASTMILK' | 'FORMULA' | 'OTHER' | 'UNKNOWN' | null
  amount: string
  amountUnit: 'oz' | 'ml'
  amountUnknown: boolean
  side: 'LEFT' | 'RIGHT' | 'BOTH' | 'UNKNOWN' | null
  durationMinutes: string
  confirmOld: boolean
}

export type AttemptSnapshot = {
  v: 1
  userId: string
  formKey: string
  clientRequestId: string
  /** True once a POST with this id may have reached the server. */
  sent: boolean
  /** When Save was tapped for an attempt that couldn't be confirmed: retries keep this time. */
  tappedAt?: number | null
  form: FormState
  savedAt: number
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function storageKey(userId: string, formKey: string) {
  return `nfcb:attempt:${userId}:${formKey}`
}

export function newRequestId(): string {
  return globalThis.crypto.randomUUID()
}

export function loadSnapshot(
  storage: StorageLike | null,
  userId: string,
  formKey: string,
  now = Date.now(),
): AttemptSnapshot | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(storageKey(userId, formKey))
    if (!raw) return null
    const snap = JSON.parse(raw) as AttemptSnapshot
    if (
      snap.v !== 1 ||
      snap.userId !== userId ||
      snap.formKey !== formKey ||
      now - snap.savedAt > ATTEMPT_TTL_MS
    ) {
      storage.removeItem(storageKey(userId, formKey))
      return null
    }
    return snap
  } catch {
    return null
  }
}

export function saveSnapshot(
  storage: StorageLike | null,
  snap: Omit<AttemptSnapshot, 'v' | 'savedAt'>,
  now = Date.now(),
) {
  if (!storage) return
  try {
    storage.setItem(
      storageKey(snap.userId, snap.formKey),
      JSON.stringify({ ...snap, v: 1, savedAt: now }),
    )
  } catch {
    // Storage full / disabled (private mode): retries still work within this page.
  }
}

export function clearSnapshot(storage: StorageLike | null, userId: string, formKey: string) {
  if (!storage) return
  try {
    storage.removeItem(storageKey(userId, formKey))
  } catch {
    // ignore
  }
}

/** sessionStorage key of a form's running nursing timer (cleared once the entry is saved). */
export function timerStorageKey(formKey: string) {
  return `nfcb:timer:${formKey}`
}

export function safeSessionStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}
