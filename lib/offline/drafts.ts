import type { Intent } from '@/lib/domain/intents'
import type { CreateEventInput } from '@/lib/domain/schemas'
import { clearStores, get, getAll, put, remove } from './db'

/**
 * Pending entries kept on this phone after a Save that could not reach the server.
 *
 * A draft is NOT a care event: it is not in the shared history, nobody else can see it and no
 * text is sent for it. It becomes an event only when a sync POSTs the same clientRequestId and
 * the server confirms — so retries and a second phone/tab can never create a duplicate.
 *
 * Privacy: drafts and cached sticker/family basics are scoped to the user id that created them,
 * capped in number and age, and wiped on sign-out. Another person signing in on this phone never
 * sees or uploads them.
 */

export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_DRAFTS_PER_USER = 20
export const KNOWN_TAG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type DraftState = 'pending' | 'needs_attention'

export type PendingDraft = {
  v: 1
  clientRequestId: string
  userId: string
  householdId: string
  childId: string
  childNickname: string
  intent: Intent
  tagLabel: string | null
  /** Exact request body a sync will POST (time pinned to the moment Save was tapped). */
  payload: CreateEventInput
  /** Short human summary, e.g. "Wet diaper" or "Bottle · 3 oz formula". */
  summary: string
  createdAt: number
  /** An earlier POST with this id may have reached the server: always check before re-sending. */
  sentBefore: boolean
  state: DraftState
  lastError: string | null
  /** Server asked to confirm a time more than a day ago. */
  needsConfirmOld: boolean
}

export type KnownTag = {
  token: string
  userId: string
  householdId: string
  intent: Intent
  childId: string
  childNickname: string
  tagLabel: string | null
  timezone: string
  volumeUnit: 'oz' | 'ml'
  defaultFeedMethod: 'BOTTLE' | 'NURSING' | null
  cachedAt: number
}

export type OfflineContext = {
  userId: string
  householdId: string
  canLog: boolean
  timezone: string
  volumeUnit: 'oz' | 'ml'
  defaultFeedMethod: 'BOTTLE' | 'NURSING' | null
  children: { id: string; nickname: string }[]
  cachedAt: number
}

export class DraftLimitError extends Error {
  constructor() {
    super(`At most ${MAX_DRAFTS_PER_USER} entries can wait on this phone.`)
  }
}

export async function saveDraft(draft: PendingDraft): Promise<void> {
  const existing = await listDrafts(draft.userId)
  if (
    existing.length >= MAX_DRAFTS_PER_USER &&
    !existing.some((d) => d.clientRequestId === draft.clientRequestId)
  ) {
    throw new DraftLimitError()
  }
  await put('drafts', draft)
}

/** This person's drafts, oldest first. */
export async function listDrafts(userId: string): Promise<PendingDraft[]> {
  const all = await getAll<PendingDraft>('drafts')
  return all
    .filter((d) => d.v === 1 && d.userId === userId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

/** Drafts that belong to someone else who used this phone (never shown or uploaded). */
export async function countOtherUsersDrafts(userId: string): Promise<number> {
  const all = await getAll<PendingDraft>('drafts')
  return all.filter((d) => d.userId !== userId).length
}

export async function removeOtherUsersDrafts(userId: string): Promise<void> {
  const all = await getAll<PendingDraft>('drafts')
  for (const d of all) if (d.userId !== userId) await remove('drafts', d.clientRequestId)
}

export async function updateDraft(
  clientRequestId: string,
  patch: Partial<
    Pick<PendingDraft, 'state' | 'lastError' | 'needsConfirmOld' | 'payload' | 'sentBefore'>
  >,
): Promise<void> {
  const d = await get<PendingDraft>('drafts', clientRequestId)
  if (d) await put('drafts', { ...d, ...patch })
}

export async function deleteDraft(clientRequestId: string): Promise<void> {
  await remove('drafts', clientRequestId)
}

/** Remove drafts past the retention window. Returns how many were removed. */
export async function pruneExpiredDrafts(now = Date.now()): Promise<number> {
  const all = await getAll<PendingDraft>('drafts')
  let removed = 0
  for (const d of all) {
    if (d.v !== 1 || now - d.createdAt > DRAFT_MAX_AGE_MS) {
      await remove('drafts', d.clientRequestId)
      removed++
    }
  }
  return removed
}

export async function rememberTag(tag: Omit<KnownTag, 'cachedAt'>, now = Date.now()) {
  await put<KnownTag>('tags', { ...tag, cachedAt: now })
}

export async function knownTag(token: string, now = Date.now()): Promise<KnownTag | null> {
  const t = await get<KnownTag>('tags', token)
  if (!t || now - t.cachedAt > KNOWN_TAG_MAX_AGE_MS) return null
  return t
}

export async function forgetTag(token: string) {
  await remove('tags', token)
}

export async function rememberContext(ctx: Omit<OfflineContext, 'cachedAt'>, now = Date.now()) {
  await put<OfflineContext>('context', { ...ctx, cachedAt: now })
}

/** The most recently cached family basics (offline screens have no session to ask). */
export async function latestContext(): Promise<OfflineContext | null> {
  const all = await getAll<OfflineContext>('context')
  return all.sort((a, b) => b.cachedAt - a.cachedAt)[0] ?? null
}

/**
 * Wipe everything this app stored on the device: drafts, cached stickers and family basics.
 * Called on sign-out so the next person on this phone starts clean.
 */
export async function clearAllDrafts(): Promise<void> {
  await clearStores()
}
