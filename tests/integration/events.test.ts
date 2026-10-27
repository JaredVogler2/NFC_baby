import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  admin,
  countEvents,
  createFamily,
  createTag,
  logEvent,
  makeSmsRecipient,
  psql,
  type Family,
} from './helpers'

/**
 * Event write semantics against real Postgres: idempotency (incl. concurrency), tag intent
 * enforcement, time guards, feeding validation/units, corrections with optimistic concurrency,
 * void + audit, dashboard aggregation and notification enqueue rules.
 */
let fam: Family
let tags: Record<'WET' | 'POOP' | 'BOTH' | 'FEED', { id: string; token: string }>

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

beforeAll(async () => {
  fam = await createFamily('Events family')
  tags = {
    WET: await createTag(fam, 'WET'),
    POOP: await createTag(fam, 'POOP'),
    BOTH: await createTag(fam, 'BOTH'),
    FEED: await createTag(fam, 'FEED'),
  }
})

async function getEvent(id: string) {
  const { data, error } = await admin.from('care_event_list').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

describe('tag intent and child are fixed by the server', () => {
  it.each(['WET', 'POOP', 'BOTH'] as const)(
    '%s tag stores one diaper event of that subtype',
    async (kind) => {
      const before = await countEvents(fam.householdId)
      const { data, error } = await logEvent(fam.owner, {
        p_intent: kind,
        p_subtype: kind,
        p_tag_token: tags[kind].token,
      })
      expect(error).toBeNull()
      const ev = await getEvent((data as { id: string }).id)
      expect(ev.event_type).toBe('DIAPER')
      expect(ev.subtype).toBe(kind)
      expect(ev.source).toBe('TAG')
      expect(ev.source_tag_id).toBe(tags[kind].id)
      expect(await countEvents(fam.householdId)).toBe(before + 1)
    },
  )

  it('a forged intent through a WET tag is rejected', async () => {
    const res = await logEvent(fam.owner, {
      p_intent: 'FEED',
      p_subtype: 'BOTTLE',
      p_tag_token: tags.WET.token,
      p_feeding: { milkType: 'FORMULA', amountValue: 3, amountUnit: 'oz' },
    })
    expect(res.error?.code).toBe('NB422')
    expect(res.error?.hint).toBe('intent')
  })

  it('a mismatched subtype for the intent is rejected', async () => {
    const res = await logEvent(fam.owner, {
      p_intent: 'WET',
      p_subtype: 'POOP',
      p_tag_token: tags.WET.token,
    })
    expect(res.error?.code).toBe('NB422')
  })

  it('a forged child id through a tag is rejected', async () => {
    const other = await admin
      .from('children')
      .insert({ household_id: fam.householdId, nickname: 'Twin' })
      .select('id')
      .single()
    const res = await logEvent(fam.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_tag_token: tags.WET.token,
      p_child_id: other.data!.id,
    })
    expect(res.error?.code).toBe('NB422')
    expect(res.error?.hint).toBe('childId')
  })

  it('updates tag usage only on deliberate save', async () => {
    const t = await admin
      .from('nfc_tags')
      .select('use_count, last_used_at, tested_at')
      .eq('id', tags.WET.id)
      .single()
    expect(t.data!.use_count).toBeGreaterThanOrEqual(1)
    expect(t.data!.tested_at).not.toBeNull()
  })

  it('a revoked tag cannot be used to log', async () => {
    const tag = await createTag(fam, 'POOP')
    expect((await fam.owner.client.rpc('revoke_tag', { p_tag_id: tag.id })).error).toBeNull()
    const res = await logEvent(fam.owner, {
      p_intent: 'POOP',
      p_subtype: 'POOP',
      p_tag_token: tag.token,
    })
    expect(res.error?.code).toBe('NB410')
    const resolved = await fam.owner.client.rpc('resolve_tag', { p_token: tag.token })
    expect((resolved.data as { status: string }).status).toBe('REVOKED')
    const edit = await fam.owner.client.rpc('update_tag', {
      p_tag_id: tag.id,
      p_label: 'reuse',
      p_child_id: fam.childId,
      p_purpose: 'WET',
    })
    expect(edit.error?.code).toBe('NB410')
  })

  it('editing a tag label keeps its URL token; changing purpose resets tested status', async () => {
    const tag = await createTag(fam, 'BOTH')
    await logEvent(fam.owner, { p_intent: 'BOTH', p_subtype: 'BOTH', p_tag_token: tag.token })
    await fam.owner.client.rpc('update_tag', {
      p_tag_id: tag.id,
      p_label: 'Upstairs both',
      p_child_id: fam.childId,
      p_purpose: 'BOTH',
    })
    let row = await admin
      .from('nfc_tags')
      .select('token, label, tested_at')
      .eq('id', tag.id)
      .single()
    expect(row.data).toMatchObject({ token: tag.token, label: 'Upstairs both' })
    expect(row.data!.tested_at).not.toBeNull()
    await fam.owner.client.rpc('update_tag', {
      p_tag_id: tag.id,
      p_label: 'Upstairs wet',
      p_child_id: fam.childId,
      p_purpose: 'WET',
    })
    row = await admin.from('nfc_tags').select('token, tested_at, purpose').eq('id', tag.id).single()
    expect(row.data).toMatchObject({ token: tag.token, purpose: 'WET', tested_at: null })
  })
})

describe('idempotency', () => {
  it('replaying the same clientRequestId returns the original event', async () => {
    const key = randomUUID()
    const args = {
      p_client_request_id: key,
      p_intent: 'WET' as const,
      p_subtype: 'WET' as const,
      p_tag_token: tags.WET.token,
      p_notes: 'leak',
    }
    const before = await countEvents(fam.householdId)
    const first = await logEvent(fam.parent, args)
    const second = await logEvent(fam.parent, args)
    expect(first.error).toBeNull()
    expect(second.data).toMatchObject({ id: (first.data as { id: string }).id, replayed: true })
    expect(await countEvents(fam.householdId)).toBe(before + 1)
  })

  it('the same key with a different payload is a conflict, not a silent different event', async () => {
    const key = randomUUID()
    await logEvent(fam.parent, {
      p_client_request_id: key,
      p_intent: 'WET',
      p_subtype: 'WET',
      p_tag_token: tags.WET.token,
    })
    const res = await logEvent(fam.parent, {
      p_client_request_id: key,
      p_intent: 'WET',
      p_subtype: 'WET',
      p_tag_token: tags.WET.token,
      p_notes: 'changed',
    })
    expect(res.error?.code).toBe('NB409')
    expect(res.error?.message).toBe('IDEMPOTENCY_MISMATCH')
  })

  it('10 concurrent requests with one key → exactly 1 event and 1 outbox row per recipient', async () => {
    const f = await createFamily('Concurrency family')
    await admin
      .from('households')
      .update({ notification_mode: 'AUTOMATIC' })
      .eq('id', f.householdId)
    await makeSmsRecipient(f, f.owner)
    await makeSmsRecipient(f, f.parent)
    const key = randomUUID()
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        logEvent(f.parent, {
          p_client_request_id: key,
          p_intent: 'POOP',
          p_subtype: 'POOP',
          p_child_id: f.childId,
        }),
      ),
    )
    expect(results.every((r) => r.error === null)).toBe(true)
    const ids = new Set(results.map((r) => (r.data as { id: string }).id))
    expect(ids.size).toBe(1)
    expect(results.filter((r) => !(r.data as { replayed: boolean }).replayed)).toHaveLength(1)
    expect(await countEvents(f.householdId)).toBe(1)
    const outbox = await admin
      .from('notification_outbox')
      .select('user_id, state')
      .eq('household_id', f.householdId)
    expect(outbox.data).toHaveLength(2)
    expect(new Set(outbox.data!.map((o) => o.user_id))).toEqual(new Set([f.owner.id, f.parent.id]))
  })

  it('two deliberate saves with different keys are two events (even if identical)', async () => {
    const before = await countEvents(fam.householdId)
    const at = minutesAgo(3)
    await logEvent(fam.owner, {
      p_intent: 'POOP',
      p_subtype: 'POOP',
      p_child_id: fam.childId,
      p_occurred_at: at,
    })
    await logEvent(fam.owner, {
      p_intent: 'POOP',
      p_subtype: 'POOP',
      p_child_id: fam.childId,
      p_occurred_at: at,
    })
    expect(await countEvents(fam.householdId)).toBe(before + 2)
  })

  it('the key is scoped to the author: another parent reusing it creates their own event', async () => {
    const key = randomUUID()
    const a = await logEvent(fam.owner, {
      p_client_request_id: key,
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: fam.childId,
    })
    const b = await logEvent(fam.parent, {
      p_client_request_id: key,
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: fam.childId,
    })
    expect((a.data as { id: string }).id).not.toBe((b.data as { id: string }).id)
  })
})

describe('time rules', () => {
  it('defaults occurred_at to server now', async () => {
    const t0 = Date.now()
    const { data } = await logEvent(fam.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: fam.childId,
    })
    const ev = await getEvent((data as { id: string }).id)
    expect(Math.abs(new Date(ev.occurred_at).getTime() - t0)).toBeLessThan(10_000)
  })

  it('keeps an explicit backdated time distinct from created_at', async () => {
    const at = minutesAgo(15)
    const { data } = await logEvent(fam.owner, {
      p_intent: 'BOTH',
      p_subtype: 'BOTH',
      p_child_id: fam.childId,
      p_occurred_at: at,
      p_notes: 'changed 15 min ago',
    })
    const ev = await getEvent((data as { id: string }).id)
    expect(new Date(ev.occurred_at).toISOString()).toBe(at)
    expect(new Date(ev.created_at).getTime() - new Date(ev.occurred_at).getTime()).toBeGreaterThan(
      14 * 60_000,
    )
  })

  it('rejects future times beyond 5 minutes', async () => {
    const res = await logEvent(fam.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: fam.childId,
      p_occurred_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    expect(res.error?.code).toBe('NB422')
    expect(res.error?.hint).toBe('occurredAt')
  })

  it('requires confirmation beyond 24 hours, rejects beyond a year', async () => {
    const twoDays = minutesAgo(2 * 24 * 60)
    const noConfirm = await logEvent(fam.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: fam.childId,
      p_occurred_at: twoDays,
    })
    expect(noConfirm.error?.message).toBe('CONFIRM_OLD')
    const confirmed = await logEvent(fam.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: fam.childId,
      p_occurred_at: twoDays,
      p_confirm_old: true,
    })
    expect(confirmed.error).toBeNull()
    const ancient = await logEvent(fam.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: fam.childId,
      p_occurred_at: minutesAgo(400 * 24 * 60),
      p_confirm_old: true,
    })
    expect(ancient.error?.code).toBe('NB422')
  })
})

describe('feeding details', () => {
  const feed = (
    feeding: Record<string, unknown> | null,
    subtype: 'BOTTLE' | 'NURSING' = 'BOTTLE',
    extra = {},
  ) =>
    logEvent(fam.parent, {
      p_intent: 'FEED',
      p_subtype: subtype,
      p_tag_token: tags.FEED.token,
      p_feeding: feeding,
      ...extra,
    })

  it('3.5 oz is stored canonically in mL and exactly as entered', async () => {
    const { data, error } = await feed({
      milkType: 'BREASTMILK',
      amountValue: 3.5,
      amountUnit: 'oz',
    })
    expect(error).toBeNull()
    const ev = await getEvent((data as { id: string }).id)
    expect(Number(ev.amount_ml)).toBeCloseTo(103.5074, 4)
    expect(Number(ev.amount_entered_value)).toBe(3.5)
    expect(ev.amount_entered_unit).toBe('oz')
    expect(ev.milk_type).toBe('BREASTMILK')
    expect(ev.amount_unknown).toBe(false)
  })

  it('120 mL round-trips', async () => {
    const { data } = await feed({ milkType: 'FORMULA', amountValue: 120, amountUnit: 'ml' })
    const ev = await getEvent((data as { id: string }).id)
    expect(Number(ev.amount_ml)).toBe(120)
  })

  it('unknown amount is NULL + flag, never zero', async () => {
    const { data } = await feed({ milkType: 'UNKNOWN', amountUnknown: true })
    const ev = await getEvent((data as { id: string }).id)
    expect(ev.amount_ml).toBeNull()
    expect(ev.amount_unknown).toBe(true)
  })

  it.each([
    [{ milkType: 'FORMULA' }, 'feeding.amountValue'],
    [{ milkType: 'FORMULA', amountValue: 0, amountUnit: 'oz' }, 'feeding.amountValue'],
    [{ milkType: 'FORMULA', amountValue: -2, amountUnit: 'oz' }, 'feeding.amountValue'],
    [{ milkType: 'FORMULA', amountValue: 'NaN', amountUnit: 'oz' }, 'feeding.amountValue'],
    [{ milkType: 'FORMULA', amountValue: 123456789, amountUnit: 'ml' }, 'feeding.amountValue'],
    [{ milkType: 'FORMULA', amountValue: 20, amountUnit: 'oz' }, 'feeding.amountValue'],
    [{ milkType: 'FORMULA', amountValue: 3, amountUnit: 'cups' }, 'feeding.amountUnit'],
    [{ milkType: 'JUICE', amountValue: 3, amountUnit: 'oz' }, 'feeding.milkType'],
    [{ milkType: 'FORMULA', amountUnknown: true, amountValue: 3 }, 'feeding.amountValue'],
  ])('rejects invalid bottle %j', async (feeding, field) => {
    const res = await feed(feeding)
    expect(res.error?.code).toBe('NB422')
    expect(res.error?.hint).toBe(field)
  })

  it('nursing with side and duration, no fabricated volume', async () => {
    const { data, error } = await feed({ side: 'LEFT', durationSeconds: 720 }, 'NURSING')
    expect(error).toBeNull()
    const ev = await getEvent((data as { id: string }).id)
    expect(ev).toMatchObject({
      subtype: 'NURSING',
      side: 'LEFT',
      duration_seconds: 720,
      amount_ml: null,
      milk_type: null,
    })
  })

  it('nursing duration is derived from start and end; end before start is rejected', async () => {
    const start = minutesAgo(30)
    const end = minutesAgo(18)
    const ok = await feed({ side: 'BOTH', endedAt: end }, 'NURSING', { p_occurred_at: start })
    const ev = await getEvent((ok.data as { id: string }).id)
    expect(ev.duration_seconds).toBe(12 * 60)
    const bad = await feed({ side: 'BOTH', endedAt: minutesAgo(40) }, 'NURSING', {
      p_occurred_at: start,
    })
    expect(bad.error?.hint).toBe('feeding.endedAt')
  })

  it('nursing without any detail is allowed (side not tracked)', async () => {
    const { data, error } = await feed({}, 'NURSING')
    expect(error).toBeNull()
    expect((await getEvent((data as { id: string }).id)).side).toBe('UNKNOWN')
  })

  it('a diaper entry cannot carry feeding details', async () => {
    const res = await logEvent(fam.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: fam.childId,
      p_feeding: { milkType: 'FORMULA' },
    })
    expect(res.error?.code).toBe('NB422')
  })

  it('database CHECKs refuse a bottle row with zero amount even via the service role', async () => {
    const { data } = await feed({ milkType: 'FORMULA', amountValue: 2, amountUnit: 'oz' })
    const res = await admin
      .from('feeding_details')
      .update({ amount_ml: 0 })
      .eq('event_id', (data as { id: string }).id)
    expect(res.error?.code).toBe('23514')
  })
})

describe('corrections', () => {
  it('edits with the right revision, audits the diff, and rejects a stale revision', async () => {
    const { data } = await logEvent(fam.owner, {
      p_intent: 'FEED',
      p_subtype: 'BOTTLE',
      p_child_id: fam.childId,
      p_feeding: { milkType: 'FORMULA', amountValue: 3, amountUnit: 'oz' },
    })
    const id = (data as { id: string }).id
    const edit = await fam.parent.client.rpc('update_care_event', {
      p_event_id: id,
      p_expected_revision: 1,
      p_patch: {
        feeding: { milkType: 'FORMULA', amountValue: 3.5, amountUnit: 'oz' },
        notes: 'finished bottle',
      },
    })
    expect(edit.error).toBeNull()
    expect(edit.data).toMatchObject({ revision: 2, changed: true, previouslyNotified: false })
    const ev = await getEvent(id)
    expect(Number(ev.amount_entered_value)).toBe(3.5)
    expect(ev.updated_by).toBe(fam.parent.id)
    expect(ev.created_by).toBe(fam.owner.id)

    const audit = await admin
      .from('care_event_audit')
      .select('action, actor_id, revision, changes')
      .eq('event_id', id)
      .order('id')
    expect(audit.data!.map((a) => a.action)).toEqual(['CREATE', 'UPDATE'])
    expect(audit.data![1]!.actor_id).toBe(fam.parent.id)
    expect(audit.data![1]!.changes.amountEnteredValue).toEqual({ from: 3, to: 3.5 })
    expect(audit.data![1]!.changes.notes).toEqual({ from: null, to: 'finished bottle' })

    // The other parent still holds revision 1 → conflict, no silent overwrite.
    const stale = await fam.owner.client.rpc('update_care_event', {
      p_event_id: id,
      p_expected_revision: 1,
      p_patch: { notes: 'overwrite attempt' },
    })
    expect(stale.error?.code).toBe('NB409')
    expect(stale.error?.message).toBe('REVISION_CONFLICT')
    expect(stale.error?.details).toBe('2')
    expect((await getEvent(id)).notes).toBe('finished bottle')
  })

  it('a no-op edit does not bump the revision or write audit', async () => {
    const { data } = await logEvent(fam.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: fam.childId,
      p_notes: 'same',
    })
    const id = (data as { id: string }).id
    const res = await fam.owner.client.rpc('update_care_event', {
      p_event_id: id,
      p_expected_revision: 1,
      p_patch: { notes: 'same' },
    })
    expect(res.data).toMatchObject({ changed: false, revision: 1 })
    const audit = await admin.from('care_event_audit').select('id').eq('event_id', id)
    expect(audit.data).toHaveLength(1)
  })

  it('switching bottle → nursing requires new details; diaper → feed is refused', async () => {
    const { data } = await logEvent(fam.owner, {
      p_intent: 'FEED',
      p_subtype: 'BOTTLE',
      p_child_id: fam.childId,
      p_feeding: { milkType: 'FORMULA', amountUnknown: true },
    })
    const id = (data as { id: string }).id
    const missing = await fam.owner.client.rpc('update_care_event', {
      p_event_id: id,
      p_expected_revision: 1,
      p_patch: { subtype: 'NURSING' },
    })
    expect(missing.error?.code).toBe('NB422')
    const ok = await fam.owner.client.rpc('update_care_event', {
      p_event_id: id,
      p_expected_revision: 1,
      p_patch: { subtype: 'NURSING', feeding: { side: 'RIGHT' } },
    })
    expect(ok.error).toBeNull()
    expect(await getEvent(id)).toMatchObject({
      subtype: 'NURSING',
      side: 'RIGHT',
      milk_type: null,
      amount_unknown: false,
    })

    const diaper = await logEvent(fam.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: fam.childId,
    })
    const bad = await fam.owner.client.rpc('update_care_event', {
      p_event_id: (diaper.data as { id: string }).id,
      p_expected_revision: 1,
      p_patch: { subtype: 'BOTTLE' },
    })
    expect(bad.error?.code).toBe('NB422')
  })
})

describe('void (undo)', () => {
  it('marks the event VOID, audits it, keeps the row, and cancels unsent notifications', async () => {
    const f = await createFamily('Void family')
    await admin
      .from('households')
      .update({ notification_mode: 'AUTOMATIC' })
      .eq('id', f.householdId)
    await makeSmsRecipient(f, f.owner)
    const { data } = await logEvent(f.parent, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    const id = (data as { id: string }).id
    const res = await f.parent.client.rpc('void_care_event', {
      p_event_id: id,
      p_expected_revision: 1,
      p_reason: 'Wrong sticker',
    })
    expect(res.data).toMatchObject({
      revision: 2,
      alreadyVoid: false,
      canceledNotifications: 1,
      previouslyNotified: false,
    })
    const ev = await getEvent(id)
    expect(ev).toMatchObject({
      state: 'VOID',
      voided_by: f.parent.id,
      void_reason: 'Wrong sticker',
    })
    const outbox = await admin
      .from('notification_outbox')
      .select('state, reason')
      .eq('event_id', id)
    expect(outbox.data).toEqual([{ state: 'CANCELED', reason: 'EVENT_VOIDED' }])
    const again = await f.parent.client.rpc('void_care_event', {
      p_event_id: id,
      p_expected_revision: 1,
    })
    expect(again.data).toMatchObject({ alreadyVoid: true })
    const edit = await f.parent.client.rpc('update_care_event', {
      p_event_id: id,
      p_expected_revision: 2,
      p_patch: { notes: 'x' },
    })
    expect(edit.error?.message).toBe('EVENT_VOID')
  })

  it('reports when a text may already have been delivered', async () => {
    const f = await createFamily('Sent family')
    await admin
      .from('households')
      .update({ notification_mode: 'AUTOMATIC' })
      .eq('id', f.householdId)
    await makeSmsRecipient(f, f.owner)
    const { data } = await logEvent(f.parent, {
      p_intent: 'POOP',
      p_subtype: 'POOP',
      p_child_id: f.childId,
    })
    const id = (data as { id: string }).id
    await admin.from('notification_outbox').update({ state: 'SENT_TO_PROVIDER' }).eq('event_id', id)
    const edit = await f.owner.client.rpc('update_care_event', {
      p_event_id: id,
      p_expected_revision: 1,
      p_patch: { notes: 'fix' },
    })
    expect(edit.data).toMatchObject({ previouslyNotified: true })
    const voided = await f.owner.client.rpc('void_care_event', {
      p_event_id: id,
      p_expected_revision: 2,
    })
    expect(voided.data).toMatchObject({ previouslyNotified: true, canceledNotifications: 0 })
    // No surprise correction text: still exactly one outbox row.
    expect(
      (await admin.from('notification_outbox').select('id').eq('event_id', id)).data,
    ).toHaveLength(1)
  })

  it('events and audit rows cannot be deleted, even by the service role', async () => {
    const { data } = await logEvent(fam.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: fam.childId,
    })
    const id = (data as { id: string }).id
    const del = await admin.from('care_events').delete().eq('id', id)
    expect(del.error?.code).toBe('42501')
    const delAudit = await admin.from('care_event_audit').delete().eq('event_id', id)
    expect(delAudit.error?.code).toBe('42501')
    const updAudit = await admin.from('care_event_audit').update({ changes: {} }).eq('event_id', id)
    expect(updAudit.error?.code).toBe('42501')
  })
})

describe('dashboard', () => {
  it('uses latest occurrence (not latest entry), excludes voids, BOTH counts as wet and poop', async () => {
    const f = await createFamily('Dashboard family')
    const log = (args: Parameters<typeof logEvent>[1]) =>
      logEvent(f.owner, { p_child_id: f.childId, ...args })
    await log({
      p_intent: 'FEED',
      p_subtype: 'BOTTLE',
      p_occurred_at: minutesAgo(10),
      p_feeding: { milkType: 'FORMULA', amountValue: 4, amountUnit: 'oz' },
    })
    // Entered later but happened earlier: must not become "last fed".
    await log({
      p_intent: 'FEED',
      p_subtype: 'BOTTLE',
      p_occurred_at: minutesAgo(90),
      p_feeding: { milkType: 'FORMULA', amountValue: 2, amountUnit: 'oz' },
    })
    await log({ p_intent: 'BOTH', p_subtype: 'BOTH', p_occurred_at: minutesAgo(5) })
    await log({ p_intent: 'WET', p_subtype: 'WET', p_occurred_at: minutesAgo(4) })
    const voided = await log({ p_intent: 'POOP', p_subtype: 'POOP', p_occurred_at: minutesAgo(1) })
    await f.owner.client.rpc('void_care_event', {
      p_event_id: (voided.data as { id: string }).id,
      p_expected_revision: 1,
    })

    // Freeze "today" assertions to events that are certainly today in New York.
    const { data, error } = await f.parent.client.rpc('get_dashboard', { p_child_id: f.childId })
    expect(error).toBeNull()
    const d = data as {
      lastFeed: { amount_entered_value: number }
      lastDiaper: { subtype: string }
      recent: { state: string }[]
      today: Record<string, number>
    }
    expect(Number(d.lastFeed.amount_entered_value)).toBe(4)
    expect(d.lastDiaper.subtype).toBe('WET')
    expect(d.recent.every((r) => r.state === 'ACTIVE')).toBe(true)
    expect(d.recent).toHaveLength(4)
    const nyHour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(new Date()),
    )
    if (nyHour >= 2) {
      expect(d.today).toMatchObject({ diaperChanges: 2, wet: 2, poop: 1, bottles: 2 })
      expect(Number(d.today.bottleMl)).toBeCloseTo(6 * 29.5735295625, 2)
    }
  })
})

describe('notification enqueue rules', () => {
  it('OFF/COMPOSE modes create no outbox rows', async () => {
    const f = await createFamily('Off family')
    await makeSmsRecipient(f, f.owner)
    for (const mode of ['OFF', 'COMPOSE']) {
      await admin.from('households').update({ notification_mode: mode }).eq('id', f.householdId)
      const { data } = await logEvent(f.parent, {
        p_intent: 'WET',
        p_subtype: 'WET',
        p_child_id: f.childId,
      })
      expect((data as { queued: number }).queued).toBe(0)
    }
    expect(
      (await admin.from('notification_outbox').select('id').eq('household_id', f.householdId)).data,
    ).toEqual([])
  })

  it('opted-out, unverified, unconsented or category-disabled adults get no row; others get exactly one', async () => {
    const f = await createFamily('Rules family')
    await admin
      .from('households')
      .update({ notification_mode: 'AUTOMATIC' })
      .eq('id', f.householdId)
    await makeSmsRecipient(f, f.owner)
    await makeSmsRecipient(f, f.parent, { optedOut: true })
    const { data } = await logEvent(f.caregiver, {
      p_intent: 'FEED',
      p_subtype: 'NURSING',
      p_child_id: f.childId,
      p_feeding: {},
    })
    const rows = await admin
      .from('notification_outbox')
      .select('user_id, state')
      .eq('event_id', (data as { id: string }).id)
    expect(rows.data).toEqual([{ user_id: f.owner.id, state: 'PENDING' }])

    await admin
      .from('notification_preferences')
      .update({ categories: ['FEED'] })
      .eq('user_id', f.owner.id)
    const diaper = await logEvent(f.caregiver, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    expect((diaper.data as { queued: number }).queued).toBe(0)

    await admin
      .from('notification_contacts')
      .update({ verified_at: null })
      .eq('user_id', f.owner.id)
    const unverified = await logEvent(f.caregiver, {
      p_intent: 'FEED',
      p_subtype: 'NURSING',
      p_child_id: f.childId,
      p_feeding: {},
    })
    expect((unverified.data as { queued: number }).queued).toBe(0)
  })

  it('caregivers and viewers are never SMS recipients', async () => {
    const f = await createFamily('Caregiver family')
    await admin
      .from('households')
      .update({ notification_mode: 'AUTOMATIC' })
      .eq('id', f.householdId)
    await makeSmsRecipient(f, f.caregiver)
    const { data } = await logEvent(f.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    expect((data as { queued: number }).queued).toBe(0)
  })

  it('quiet hours record SUPPRESSED with a reason (no send)', async () => {
    const f = await createFamily('Quiet family')
    await admin
      .from('households')
      .update({ notification_mode: 'AUTOMATIC', timezone: 'UTC' })
      .eq('id', f.householdId)
    await makeSmsRecipient(f, f.owner)
    const now = new Date()
    const hh = (h: number) => `${String((h + 24) % 24).padStart(2, '0')}:00`
    await admin
      .from('notification_preferences')
      .update({
        quiet_hours_enabled: true,
        quiet_start: hh(now.getUTCHours() - 1),
        quiet_end: hh(now.getUTCHours() + 2),
      })
      .eq('user_id', f.owner.id)
    const { data } = await logEvent(f.parent, {
      p_intent: 'POOP',
      p_subtype: 'POOP',
      p_child_id: f.childId,
    })
    const rows = await admin
      .from('notification_outbox')
      .select('state, reason')
      .eq('event_id', (data as { id: string }).id)
    expect(rows.data).toEqual([{ state: 'SUPPRESSED', reason: 'QUIET_HOURS' }])
  })

  it('the logger can opt out of texts about their own entries', async () => {
    const f = await createFamily('Own family')
    await admin
      .from('households')
      .update({ notification_mode: 'AUTOMATIC' })
      .eq('id', f.householdId)
    await makeSmsRecipient(f, f.owner)
    await makeSmsRecipient(f, f.parent)
    await admin
      .from('notification_preferences')
      .update({ include_own_entries: false })
      .eq('user_id', f.parent.id)
    const { data } = await logEvent(f.parent, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    const rows = await admin
      .from('notification_outbox')
      .select('user_id')
      .eq('event_id', (data as { id: string }).id)
    expect(rows.data).toEqual([{ user_id: f.owner.id }])
  })
})

describe('rate limit', () => {
  it('stops a runaway client after 60 events in 10 minutes', async () => {
    const f = await createFamily('Burst family')
    // Insert 60 recent events for the parent directly (service role) to reach the ceiling fast.
    psql(`
      insert into public.care_events (household_id, child_id, event_type, subtype, occurred_at, created_by, source, idempotency_key, request_hash)
      select '${f.householdId}', '${f.childId}', 'DIAPER', 'WET', now(), '${f.parent.id}', 'DASHBOARD', gen_random_uuid(), 'seeded-hash'
      from generate_series(1, 60);
    `)
    const res = await logEvent(f.parent, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    expect(res.error?.code).toBe('NB429')
  })
})
