import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbConnectionForTests } from '@/lib/offline/db'
import {
  DRAFT_MAX_AGE_MS,
  DraftLimitError,
  KNOWN_TAG_MAX_AGE_MS,
  MAX_DRAFTS_PER_USER,
  clearAllDrafts,
  countOtherUsersDrafts,
  knownTag,
  latestContext,
  listDrafts,
  pruneExpiredDrafts,
  rememberContext,
  rememberTag,
  removeOtherUsersDrafts,
  saveDraft,
  type PendingDraft,
} from '@/lib/offline/drafts'
import { draftSummary, recordOutcome, syncAll, syncDraft } from '@/lib/offline/sync'

const HOUSEHOLD = '33333333-3333-4333-8333-333333333333'
const CHILD = '11111111-1111-4111-8111-111111111111'
const EVENT_ID = '22222222-2222-4222-8222-222222222222'
let seq = 0

function draft(overrides: Partial<PendingDraft> = {}): PendingDraft {
  seq++
  const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(seq).padStart(12, '0')}`
  return {
    v: 1,
    clientRequestId: id,
    userId: 'user-1',
    householdId: HOUSEHOLD,
    childId: CHILD,
    childNickname: 'Bean',
    intent: 'WET',
    tagLabel: null,
    payload: {
      clientRequestId: id,
      intent: 'WET',
      childId: CHILD,
      occurredAt: '2026-10-27T06:00:00.000Z',
      notes: '',
      offlineSync: true,
    },
    summary: 'Wet diaper',
    createdAt: Date.now(),
    sentBefore: false,
    state: 'pending',
    lastError: null,
    needsConfirmOld: false,
    ...overrides,
  }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const notFound = () => json(404, { error: { code: 'NOT_FOUND', message: 'x' } })
const me = (userId = 'user-1', householdId = HOUSEHOLD) =>
  json(200, { userId, membership: { householdId, role: 'parent' } })

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>

function stubFetch(route: Route) {
  const calls: { method: string; url: string; body: Record<string, unknown> | null }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? 'GET',
        url,
        body: init?.body ? JSON.parse(init.body as string) : null,
      })
      return route(url, init)
    }),
  )
  return calls
}

beforeEach(async () => {
  await clearAllDrafts()
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetDbConnectionForTests()
})

describe('device-local drafts', () => {
  it('are scoped to the person who created them', async () => {
    await saveDraft(draft())
    await saveDraft(draft({ userId: 'user-2' }))
    expect(await listDrafts('user-1')).toHaveLength(1)
    expect(await listDrafts('user-2')).toHaveLength(1)
    expect(await countOtherUsersDrafts('user-1')).toBe(1)
    await removeOtherUsersDrafts('user-1')
    expect(await listDrafts('user-2')).toHaveLength(0)
    expect(await listDrafts('user-1')).toHaveLength(1)
  })

  it('are capped per person', async () => {
    for (let i = 0; i < MAX_DRAFTS_PER_USER; i++) await saveDraft(draft())
    await expect(saveDraft(draft())).rejects.toBeInstanceOf(DraftLimitError)
    // Re-saving an existing draft (same id) is still allowed.
    const [first] = await listDrafts('user-1')
    await expect(saveDraft({ ...first!, lastError: 'x' })).resolves.toBeUndefined()
  })

  it('expire after the retention window', async () => {
    const now = Date.now()
    await saveDraft(draft({ createdAt: now - DRAFT_MAX_AGE_MS - 1 }))
    await saveDraft(draft({ createdAt: now - 1000 }))
    expect(await pruneExpiredDrafts(now)).toBe(1)
    expect(await listDrafts('user-1')).toHaveLength(1)
  })

  it('sign-out wipes drafts, cached stickers and family basics', async () => {
    await saveDraft(draft())
    await rememberTag({
      token: '0123456789abcdefghjkmnpqrs',
      userId: 'user-1',
      householdId: HOUSEHOLD,
      intent: 'WET',
      childId: CHILD,
      childNickname: 'Bean',
      tagLabel: null,
      timezone: 'America/New_York',
      volumeUnit: 'oz',
      defaultFeedMethod: null,
    })
    await rememberContext({
      userId: 'user-1',
      householdId: HOUSEHOLD,
      canLog: true,
      timezone: 'America/New_York',
      volumeUnit: 'oz',
      defaultFeedMethod: null,
      children: [{ id: CHILD, nickname: 'Bean' }],
    })
    expect(await knownTag('0123456789abcdefghjkmnpqrs')).not.toBeNull()
    expect(await latestContext()).not.toBeNull()
    await clearAllDrafts()
    expect(await listDrafts('user-1')).toHaveLength(0)
    expect(await knownTag('0123456789abcdefghjkmnpqrs')).toBeNull()
    expect(await latestContext()).toBeNull()
  })

  it('cached stickers expire', async () => {
    const t0 = Date.now()
    await rememberTag(
      {
        token: '0123456789abcdefghjkmnpqrs',
        userId: 'user-1',
        householdId: HOUSEHOLD,
        intent: 'FEED',
        childId: CHILD,
        childNickname: 'Bean',
        tagLabel: 'Kitchen',
        timezone: 'America/New_York',
        volumeUnit: 'ml',
        defaultFeedMethod: 'BOTTLE',
      },
      t0,
    )
    expect(await knownTag('0123456789abcdefghjkmnpqrs', t0 + 1000)).not.toBeNull()
    expect(await knownTag('0123456789abcdefghjkmnpqrs', t0 + KNOWN_TAG_MAX_AGE_MS + 1)).toBeNull()
  })
})

describe('syncing a draft', () => {
  it('an attempt that already committed is recognised without re-sending', async () => {
    const d = draft()
    const calls = stubFetch(() => json(200, { event: { id: EVENT_ID } }))
    expect(await syncDraft(d)).toEqual({ kind: 'saved', eventId: EVENT_ID, replayed: true })
    expect(calls.map((c) => c.method)).toEqual(['GET'])
  })

  it('POSTs the stored body with the original id and the offline-sync source', async () => {
    const d = draft()
    const calls = stubFetch((_url, init) =>
      init?.method === 'POST' ? json(201, { event: { id: EVENT_ID } }) : notFound(),
    )
    expect(await syncDraft(d)).toMatchObject({ kind: 'saved', eventId: EVENT_ID })
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.body).toMatchObject({
      clientRequestId: d.clientRequestId,
      occurredAt: d.payload.occurredAt,
      offlineSync: true,
    })
  })

  it('a lost response is resolved by asking with the same id, never by a new id', async () => {
    const d = draft()
    let lookups = 0
    const calls = stubFetch((_url, init) => {
      if (init?.method === 'POST') throw new TypeError('Failed to fetch')
      lookups++
      return lookups === 1 ? notFound() : json(200, { event: { id: EVENT_ID } })
    })
    expect(await syncDraft(d)).toMatchObject({ kind: 'saved', eventId: EVENT_ID })
    expect(new Set(calls.map((c) => c.url.split('/').pop()))).toContain(d.clientRequestId)
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })

  it('stays pending (uncertain) when the outcome still cannot be confirmed', async () => {
    const d = draft()
    stubFetch((_url, init) => {
      if (init?.method === 'POST') throw new TypeError('Failed to fetch')
      return notFound()
    })
    expect(await syncDraft(d)).toEqual({ kind: 'uncertain' })
    await saveDraft(d)
    await recordOutcome(d, { kind: 'uncertain' })
    const [kept] = await listDrafts('user-1')
    expect(kept).toMatchObject({ sentBefore: true, state: 'pending' })
  })

  it('an id that committed with different details resolves to that committed event', async () => {
    const d = draft()
    let lookups = 0
    stubFetch((_url, init) => {
      if (init?.method === 'POST') {
        return json(409, { error: { code: 'IDEMPOTENCY_MISMATCH', message: 'x' } })
      }
      lookups++
      return lookups === 1 ? notFound() : json(200, { event: { id: EVENT_ID } })
    })
    expect(await syncDraft(d)).toMatchObject({ kind: 'saved', eventId: EVENT_ID })
  })

  it('an old time needs an explicit confirmation; a retired sticker needs a decision', async () => {
    stubFetch((_url, init) =>
      init?.method === 'POST'
        ? json(422, {
            error: { code: 'VALIDATION', message: 'Confirm', details: { confirmOld: true } },
          })
        : notFound(),
    )
    expect(await syncDraft(draft())).toMatchObject({ kind: 'confirm_old' })
    vi.unstubAllGlobals()
    stubFetch((_url, init) =>
      init?.method === 'POST' ? json(410, { error: { code: 'GONE', message: 'x' } }) : notFound(),
    )
    expect(await syncDraft(draft())).toMatchObject({ kind: 'rejected' })
  })
})

describe('syncAll', () => {
  it('uploads every pending draft once, then has nothing left to send', async () => {
    await saveDraft(draft())
    await saveDraft(draft())
    let created = 0
    const calls = stubFetch((url, init) => {
      if (url === '/api/v1/me') return me()
      if (init?.method === 'POST') {
        created++
        return json(201, { event: { id: EVENT_ID } })
      }
      return notFound()
    })
    const result = await syncAll('user-1', HOUSEHOLD)
    expect(result.saved).toHaveLength(2)
    expect(result.halted).toBeNull()
    expect(created).toBe(2)
    expect(await listDrafts('user-1')).toHaveLength(0)
    const before = calls.length
    await syncAll('user-1', HOUSEHOLD)
    expect(calls.length).toBe(before) // no drafts → no requests at all
  })

  it('never uploads when a different person is signed in', async () => {
    await saveDraft(draft())
    const calls = stubFetch((url) => (url === '/api/v1/me' ? me('user-2') : notFound()))
    const result = await syncAll('user-1', HOUSEHOLD)
    expect(result.halted).toBe('wrong_user')
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
    expect(await listDrafts('user-1')).toHaveLength(1)
  })

  it('never uploads into a different family', async () => {
    await saveDraft(draft())
    const calls = stubFetch((url) =>
      url === '/api/v1/me' ? me('user-1', '44444444-4444-4444-8444-444444444444') : notFound(),
    )
    expect((await syncAll('user-1', HOUSEHOLD)).halted).toBe('wrong_user')
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('an expired session keeps every draft and asks for sign-in', async () => {
    await saveDraft(draft())
    stubFetch(() => json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }))
    expect((await syncAll('user-1', HOUSEHOLD)).halted).toBe('auth')
    expect(await listDrafts('user-1')).toHaveLength(1)
  })

  it('skips drafts that are waiting for a decision', async () => {
    await saveDraft(draft({ state: 'needs_attention', lastError: 'x' }))
    const calls = stubFetch(() => me())
    const result = await syncAll('user-1', HOUSEHOLD)
    expect(result.saved).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })
})

describe('draftSummary', () => {
  it('describes diapers and feeds', () => {
    expect(draftSummary('POOP', undefined)).toBe('Poop diaper')
    expect(
      draftSummary('FEED', {
        method: 'BOTTLE',
        milkType: 'FORMULA',
        amountUnknown: false,
        amountValue: 3,
        amountUnit: 'oz',
      }),
    ).toBe('Bottle · 3 oz formula')
    expect(
      draftSummary('FEED', {
        method: 'BOTTLE',
        milkType: 'BREASTMILK',
        amountUnknown: true,
        amountValue: null,
        amountUnit: null,
      }),
    ).toBe('Bottle · breastmilk, amount not measured')
    expect(draftSummary('FEED', { method: 'NURSING', side: 'LEFT', durationSeconds: 720 })).toBe(
      'Nursing · Left, 12 min',
    )
  })
})

describe('IndexedDB opening', () => {
  it('repairs a database that exists without the app’s stores', async () => {
    resetDbConnectionForTests()
    await new Promise<void>((resolve) => {
      const del = indexedDB.deleteDatabase('nfc-baby')
      del.onsuccess = () => resolve()
      del.onerror = () => resolve()
    })
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('nfc-baby') // creates an empty v1 database
      req.onsuccess = () => {
        req.result.close()
        resolve()
      }
    })
    await saveDraft(draft())
    expect(await listDrafts('user-1')).toHaveLength(1)
  })
})
