import { INTENT_LABEL, MILK_LABEL, SIDE_LABEL, type Intent } from '@/lib/domain/intents'
import type { FeedingInput } from '@/lib/domain/schemas'
import { apiFetch, isUncertainWriteFailure, type ApiResult } from '@/lib/http/client'
import { deleteDraft, listDrafts, updateDraft, type PendingDraft } from './drafts'

/**
 * Turning a pending draft into a real, shared care event.
 *
 * Every sync first asks the server whether this clientRequestId already committed (an earlier
 * attempt may have arrived after all), then POSTs the exact stored body with the same id. The
 * server's unique (author, clientRequestId) makes a second POST a harmless replay, so a draft can
 * be synced from two tabs, retried after a timeout, or re-synced, and still produce one event.
 * The draft is deleted only after the server confirms the event exists.
 */

export type SyncOutcome =
  | { kind: 'saved'; eventId: string; replayed: boolean }
  | { kind: 'offline' } // nothing reached the server; still pending
  | { kind: 'uncertain' } // may have reached the server; next sync checks first
  | { kind: 'auth' } // sign in again; draft kept
  | { kind: 'wrong_user' } // a different person is signed in; never uploaded
  | { kind: 'confirm_old'; message: string } // older than a day: needs an explicit yes
  | { kind: 'rejected'; message: string } // the server refused it; needs a decision
  | { kind: 'retry_later'; message: string } // server busy / rate limited; still pending

type Fetch = typeof apiFetch
type EventBody = { event: { id: string }; replayed?: boolean }

async function lookup(fetcher: Fetch, id: string): Promise<SyncOutcome | 'missing'> {
  const res = await fetcher<EventBody>(`/api/v1/events/by-request/${id}`, { timeoutMs: 10_000 })
  if (res.ok) return { kind: 'saved', eventId: res.data.event.id, replayed: true }
  if (res.kind === 'http' && res.status === 404) return 'missing'
  if (res.kind === 'http' && res.status === 401) return { kind: 'auth' }
  if (res.kind !== 'http') return { kind: 'offline' }
  return { kind: 'retry_later', message: res.message }
}

function classifyPost(res: ApiResult<EventBody>): SyncOutcome | 'mismatch' {
  if (res.ok) return { kind: 'saved', eventId: res.data.event.id, replayed: !!res.data.replayed }
  if (res.kind === 'offline') return { kind: 'offline' }
  if (isUncertainWriteFailure(res)) return { kind: 'uncertain' }
  switch (res.code) {
    case 'UNAUTHENTICATED':
      return { kind: 'auth' }
    case 'IDEMPOTENCY_MISMATCH':
      return 'mismatch'
    case 'VALIDATION':
      if (res.details?.confirmOld) return { kind: 'confirm_old', message: res.message }
      return { kind: 'rejected', message: res.message }
    case 'GONE':
      return {
        kind: 'rejected',
        message: 'This sticker was turned off before the entry synced. Log it again from Home.',
      }
    case 'RATE_LIMITED':
    case 'UNAVAILABLE':
    case 'INTERNAL':
    case 'NOT_CONFIGURED':
      return { kind: 'retry_later', message: res.message }
    default:
      return { kind: 'rejected', message: res.message }
  }
}

/** Sync one draft (does not touch storage). */
export async function syncDraft(
  draft: PendingDraft,
  fetcher: Fetch = apiFetch,
): Promise<SyncOutcome> {
  const before = await lookup(fetcher, draft.clientRequestId)
  if (before !== 'missing') return before

  const res = await fetcher<EventBody>('/api/v1/events', {
    method: 'POST',
    body: { ...draft.payload, offlineSync: true },
    timeoutMs: 20_000,
  })
  const outcome = classifyPost(res)
  if (outcome === 'mismatch') {
    // The same id committed with different details (e.g. the first online attempt landed late).
    // That committed event is the authoritative record of this Save.
    const after = await lookup(fetcher, draft.clientRequestId)
    return after === 'missing'
      ? { kind: 'rejected', message: 'The server could not match this entry. Log it again.' }
      : after
  }
  if (outcome.kind === 'uncertain') {
    const after = await lookup(fetcher, draft.clientRequestId)
    return after === 'missing' ? { kind: 'uncertain' } : after
  }
  return outcome
}

/** Apply an outcome to device storage. The draft is deleted only once the server confirms it. */
export async function recordOutcome(draft: PendingDraft, outcome: SyncOutcome): Promise<void> {
  switch (outcome.kind) {
    case 'saved':
      await deleteDraft(draft.clientRequestId)
      return
    case 'uncertain':
      await updateDraft(draft.clientRequestId, {
        sentBefore: true,
        lastError: 'Can’t confirm yet',
      })
      return
    case 'confirm_old':
      await updateDraft(draft.clientRequestId, {
        state: 'needs_attention',
        needsConfirmOld: true,
        lastError: outcome.message,
      })
      return
    case 'rejected':
      await updateDraft(draft.clientRequestId, {
        state: 'needs_attention',
        lastError: outcome.message,
      })
      return
    case 'retry_later':
      await updateDraft(draft.clientRequestId, { lastError: outcome.message })
      return
    default:
      return
  }
}

export type SyncAllResult = {
  saved: { clientRequestId: string; eventId: string }[]
  /** Why the batch stopped early, if it did. */
  halted: 'offline' | 'auth' | 'wrong_user' | null
}

/**
 * Sync every pending draft of `userId`, oldest first. Before uploading anything, confirm that the
 * session on the server belongs to the same person and family that created the drafts.
 * Drafts needing a decision (old time, refused) are skipped until the parent acts on them.
 */
export async function syncAll(
  userId: string,
  householdId: string,
  fetcher: Fetch = apiFetch,
): Promise<SyncAllResult> {
  const drafts = (await listDrafts(userId)).filter((d) => d.state === 'pending')
  const result: SyncAllResult = { saved: [], halted: null }
  if (drafts.length === 0) return result

  const me = await fetcher<{ userId: string; membership: { householdId: string } | null }>(
    '/api/v1/me',
    { timeoutMs: 10_000 },
  )
  if (!me.ok) {
    result.halted = me.kind === 'http' && me.status === 401 ? 'auth' : 'offline'
    return result
  }
  if (me.data.userId !== userId || me.data.membership?.householdId !== householdId) {
    result.halted = 'wrong_user'
    return result
  }

  for (const draft of drafts) {
    if (draft.householdId !== householdId) continue
    const outcome = await syncDraft(draft, fetcher)
    await recordOutcome(draft, outcome)
    if (outcome.kind === 'saved') {
      result.saved.push({ clientRequestId: draft.clientRequestId, eventId: outcome.eventId })
    } else if (outcome.kind === 'offline' || outcome.kind === 'auth') {
      result.halted = outcome.kind
      break
    }
  }
  return result
}

/** Short summary for a pending entry ("Bottle · 3 oz formula"). */
export function draftSummary(intent: Intent, feeding: FeedingInput | null | undefined): string {
  if (intent !== 'FEED' || !feeding) return INTENT_LABEL[intent]
  if (feeding.method === 'BOTTLE') {
    const milk = feeding.milkType ? MILK_LABEL[feeding.milkType].toLowerCase() : ''
    if (feeding.amountUnknown) {
      return `Bottle · ${[milk, 'amount not measured'].filter(Boolean).join(', ')}`
    }
    const amount =
      feeding.amountValue != null && feeding.amountUnit
        ? `${feeding.amountValue} ${feeding.amountUnit === 'oz' ? 'oz' : 'mL'}`
        : ''
    const detail = [amount, milk].filter(Boolean).join(' ')
    return detail ? `Bottle · ${detail}` : 'Bottle'
  }
  const minutes =
    feeding.durationSeconds != null ? `${Math.round(feeding.durationSeconds / 60)} min` : ''
  return ['Nursing', [SIDE_LABEL[feeding.side ?? 'UNKNOWN'], minutes].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ')
}
