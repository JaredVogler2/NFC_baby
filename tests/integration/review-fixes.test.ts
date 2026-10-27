import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { encryptPhone, hashVerificationCode, phoneHmac } from '@/lib/crypto/contacts'
import { listAllEvents } from '@/lib/db/events'
import { dispatchOutbox } from '@/lib/notifications/dispatch'
import type { ServerSupabase } from '@/lib/supabase/server'
import {
  admin,
  createFamily,
  createTag,
  logEvent,
  psql as rawPsql,
  type Family,
  type TestUser,
} from './helpers'

const psql = (sql: string) => rawPsql(sql).trim()

/** Regression tests for the phase-12 adversarial review (REVIEW_REPORT.md). */

const LOG = path.join(process.cwd(), 'test-results', 'review-mock-sms.jsonl')

beforeAll(() => {
  process.env.SMS_PROVIDER = 'mock'
  process.env.MOCK_SMS_LOG_FILE = LOG
  rmSync(LOG, { force: true })
})

async function addVerifiedNumber(f: Family, user: TestUser, e164: string) {
  const { error } = await admin.rpc('set_contact', {
    p_household_id: f.householdId,
    p_user_id: user.id,
    p_ciphertext: encryptPhone(e164),
    p_hmac: phoneHmac(e164),
    p_last4: e164.slice(-4),
    p_set_by: user.id,
  })
  if (error) throw error
  psql(
    `update public.notification_contacts set verified_at = now(), consent_at = now(), consent_text_version = 'test' where user_id = '${user.id}'`,
  )
  await admin
    .from('notification_preferences')
    .upsert({ household_id: f.householdId, user_id: user.id, auto_sms_enabled: true })
}

describe('P0: a sticker save is bound to the child the form showed', () => {
  it('a sticker moved to another child refuses the save instead of re-filing it', async () => {
    const f = await createFamily('Remap family')
    const tag = await createTag(f, 'WET')
    const second = await f.owner.client.rpc('upsert_child', {
      p_household_id: f.householdId,
      p_child_id: null,
      p_nickname: 'Second',
      p_archived: false,
    })
    expect(second.error).toBeNull()
    const secondId = second.data as string
    // The form was shown for the first child; meanwhile the sticker is moved to the second one.
    const moved = await f.owner.client.rpc('update_tag', {
      p_tag_id: tag.id,
      p_child_id: secondId,
      p_purpose: 'WET',
      p_label: 'moved',
    })
    expect(moved.error).toBeNull()
    const res = await logEvent(f.parent, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_tag_token: tag.token,
      p_child_id: f.childId,
    })
    expect(res.error?.code).toBe('NB422')
    expect(res.error?.hint).toBe('childId')
    expect(
      psql(`select count(*) from public.care_events where household_id = '${f.householdId}'`),
    ).toBe('0')
  })
})

describe('P1: archived children', () => {
  it('a sticker of an archived child is retired', async () => {
    const f = await createFamily('Archive family')
    const tag = await createTag(f, 'POOP')
    const extra = await f.owner.client.rpc('upsert_child', {
      p_household_id: f.householdId,
      p_child_id: null,
      p_nickname: 'Keep active',
      p_archived: false,
    })
    expect(extra.error).toBeNull()
    const archived = await f.owner.client.rpc('upsert_child', {
      p_household_id: f.householdId,
      p_child_id: f.childId,
      p_nickname: 'Archived',
      p_archived: true,
    })
    expect(archived.error).toBeNull()
    const res = await logEvent(f.parent, {
      p_intent: 'POOP',
      p_subtype: 'POOP',
      p_tag_token: tag.token,
    })
    expect(res.error?.code).toBe('NB410')
    expect(
      psql(`select count(*) from public.care_events where household_id = '${f.householdId}'`),
    ).toBe('0')
  })
})

describe('P1: export includes every entry', () => {
  it('more than 200 entries of one child are all returned, each once', async () => {
    const f = await createFamily('Export family')
    psql(`insert into public.care_events (household_id, child_id, event_type, subtype, occurred_at, created_by, source, idempotency_key, request_hash)
          select '${f.householdId}', '${f.childId}', 'DIAPER', 'WET', now() - (g || ' minutes')::interval, '${f.parent.id}', 'DASHBOARD', gen_random_uuid(), md5(g::text)
          from generate_series(1, 450) g`)
    const events = await listAllEvents(f.parent.client as unknown as ServerSupabase, f.childId)
    expect(events).toHaveLength(450)
    expect(new Set(events.map((e) => e.id)).size).toBe(450)
  })
})

describe('P2: edits must name the revision they change', () => {
  it('a missing expected revision is a conflict, never a silent overwrite', async () => {
    const f = await createFamily('Revision family')
    const { data } = await logEvent(f.parent, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    const id = (data as { id: string }).id
    const edit = await f.owner.client.rpc('update_care_event', {
      p_event_id: id,
      p_expected_revision: null,
      p_patch: { notes: 'overwrite' },
    })
    expect(edit.error?.code).toBe('NB409')
    const voided = await f.owner.client.rpc('void_care_event', {
      p_event_id: id,
      p_expected_revision: null,
      p_reason: null,
    })
    expect(voided.error?.code).toBe('NB409')
  })
})

describe('P1: verification texts cannot be pumped', () => {
  const begin = (f: Family, user: TestUser, mac: string) =>
    admin.rpc('begin_contact_verification', {
      p_household_id: f.householdId,
      p_user_id: user.id,
      p_code_hash: hashVerificationCode('424242', mac),
      p_ttl_seconds: 600,
    })
  const age = (userId: string) =>
    psql(
      `update public.notification_verification_sends set sent_at = sent_at - interval '2 minutes' where user_id = '${userId}'`,
    )

  it('limits survive removing and re-adding the number', async () => {
    const f = await createFamily('Pump family')
    const number = '+12015550131'
    const mac = phoneHmac(number)
    // The per-number limit is global and persists between runs: start from a clean log.
    psql(`delete from public.notification_verification_sends where phone_hmac = '${mac}'`)
    psql(`delete from public.notification_phone_opt_outs where phone_hmac = '${mac}'`)
    const setNumber = () =>
      admin.rpc('set_contact', {
        p_household_id: f.householdId,
        p_user_id: f.parent.id,
        p_ciphertext: encryptPhone(number),
        p_hmac: mac,
        p_last4: '0131',
        p_set_by: f.parent.id,
      })
    for (let i = 0; i < 5; i++) {
      await setNumber()
      expect((await begin(f, f.parent, mac)).data).toBe('ok')
      // The attack: remove the contact row and add it again before the next request.
      psql(`delete from public.notification_contacts where user_id = '${f.parent.id}'`)
      age(f.parent.id)
    }
    await setNumber()
    expect((await begin(f, f.parent, mac)).data).toBe('daily_limit')
  })

  it('one number gets at most five codes a day, whoever asks', async () => {
    const f = await createFamily('Shared number family')
    const number = '+12015550132'
    const mac = phoneHmac(number)
    // The per-number limit is global and persists between runs: start from a clean log.
    psql(`delete from public.notification_verification_sends where phone_hmac = '${mac}'`)
    psql(`delete from public.notification_phone_opt_outs where phone_hmac = '${mac}'`)
    const results: string[] = []
    for (const [i, user] of [f.owner, f.parent, f.owner, f.parent, f.owner, f.parent].entries()) {
      await admin.rpc('set_contact', {
        p_household_id: f.householdId,
        p_user_id: user.id,
        p_ciphertext: encryptPhone(number),
        p_hmac: mac,
        p_last4: '0132',
        p_set_by: user.id,
      })
      results.push(String((await begin(f, user, mac)).data))
      age(user.id)
      void i
    }
    expect(results).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'daily_limit'])
  })

  it('a number that replied STOP cannot be verified (or un-stopped by an old code) until START', async () => {
    const f = await createFamily('Stop family')
    const number = '+12015550133'
    const mac = phoneHmac(number)
    // The per-number limit is global and persists between runs: start from a clean log.
    psql(`delete from public.notification_verification_sends where phone_hmac = '${mac}'`)
    psql(`delete from public.notification_phone_opt_outs where phone_hmac = '${mac}'`)
    await admin.rpc('set_contact', {
      p_household_id: f.householdId,
      p_user_id: f.parent.id,
      p_ciphertext: encryptPhone(number),
      p_hmac: mac,
      p_last4: '0133',
      p_set_by: f.parent.id,
    })
    expect((await begin(f, f.parent, mac)).data).toBe('ok')
    await admin.rpc('record_opt_out', { p_phone_hmac: mac })
    const confirm = await admin.rpc('confirm_contact_verification', {
      p_household_id: f.householdId,
      p_user_id: f.parent.id,
      p_code_hash: hashVerificationCode('424242', mac),
      p_consent_version: 'v1',
    })
    expect(confirm.data).not.toBe('ok')
    // Removing and re-adding the number doesn't clear the STOP either.
    psql(`delete from public.notification_contacts where user_id = '${f.parent.id}'`)
    await admin.rpc('set_contact', {
      p_household_id: f.householdId,
      p_user_id: f.parent.id,
      p_ciphertext: encryptPhone(number),
      p_hmac: mac,
      p_last4: '0133',
      p_set_by: f.parent.id,
    })
    age(f.parent.id)
    expect((await begin(f, f.parent, mac)).data).toBe('opted_out')
    await admin.rpc('record_opt_in', { p_phone_hmac: mac })
    expect((await begin(f, f.parent, mac)).data).toBe('ok')
  })
})

describe('P2: people who stop receiving texts lose their stored number', () => {
  it('demoting or disabling a parent deletes their contact and cancels queued texts', async () => {
    const f = await createFamily('Demote family')
    await admin
      .from('households')
      .update({ notification_mode: 'AUTOMATIC' })
      .eq('id', f.householdId)
    await addVerifiedNumber(f, f.parent, '+12015550134')
    const { data } = await logEvent(f.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    const eventId = (data as { id: string }).id
    expect(
      psql(
        `select state from public.notification_outbox where event_id = '${eventId}' and user_id = '${f.parent.id}'`,
      ),
    ).toBe('PENDING')
    const demoted = await f.owner.client.rpc('set_member_role', {
      p_household_id: f.householdId,
      p_user_id: f.parent.id,
      p_role: 'caregiver',
    })
    expect(demoted.error).toBeNull()
    expect(
      psql(`select count(*) from public.notification_contacts where user_id = '${f.parent.id}'`),
    ).toBe('0')
    expect(
      psql(
        `select state || ':' || reason from public.notification_outbox where event_id = '${eventId}' and user_id = '${f.parent.id}'`,
      ),
    ).toBe('CANCELED:MEMBER_DISABLED')
  })
})

describe('P1/P2: every text is re-checked right before it is sent', () => {
  it('turning texts off after an entry was queued is honoured; a late entry is not texted', async () => {
    const f = await createFamily('Recheck family')
    await admin
      .from('households')
      .update({ notification_mode: 'AUTOMATIC' })
      .eq('id', f.householdId)
    await addVerifiedNumber(f, f.owner, '+12015550135')
    await addVerifiedNumber(f, f.parent, '+12015550136')
    const { data } = await logEvent(f.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    const id = (data as { id: string }).id
    // Dad turns automatic texts off before the dispatcher runs.
    await admin
      .from('notification_preferences')
      .update({ auto_sms_enabled: false })
      .eq('user_id', f.parent.id)
    await dispatchOutbox({ eventId: id })
    const states = psql(
      `select string_agg(o.state::text || ':' || coalesce(o.reason,''), ',' order by o.user_id = '${f.owner.id}' desc) from public.notification_outbox o where o.event_id = '${id}'`,
    )
    expect(states).toBe('SENT_TO_PROVIDER:,CANCELED:PREFS_OFF')

    // An entry that happened two hours ago (offline sync / backfill) is saved but not texted.
    const late = await logEvent(f.parent, {
      p_intent: 'POOP',
      p_subtype: 'POOP',
      p_child_id: f.childId,
      p_occurred_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    })
    const lateId = (late.data as { id: string }).id
    await dispatchOutbox({ eventId: lateId })
    expect(
      psql(
        `select string_agg(distinct state::text || ':' || coalesce(reason,''), ',') from public.notification_outbox where event_id = '${lateId}'`,
      ),
    ).toBe('CANCELED:STALE')
  })
})

describe('P2: owner test texts are limited atomically', () => {
  it('six simultaneous requests reserve exactly three', async () => {
    const f = await createFamily('Test text family')
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        admin.rpc('reserve_test_text', {
          p_household_id: f.householdId,
          p_user_id: f.parent.id,
          p_requested_by: f.owner.id,
        }),
      ),
    )
    expect(results.filter((r) => r.data).length).toBe(3)
  })
})

describe('P2: sign-in code requests look the same for members and strangers', () => {
  it('one request per address per cooldown, whoever the address belongs to', async () => {
    const hash = `test-${randomUUID()}`
    const take = (seconds: number) =>
      admin.rpc('take_auth_code_slot', { p_email_hash: hash, p_cooldown_seconds: seconds })
    expect((await take(60)).data).toBe(true)
    expect((await take(60)).data).toBe(false)
    expect((await take(0)).data).toBe(true)
  })
})
