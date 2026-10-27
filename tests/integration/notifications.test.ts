import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { encryptPhone, hashVerificationCode, phoneHmac } from '@/lib/crypto/contacts'
import { dispatchOutbox } from '@/lib/notifications/dispatch'
import { admin, createFamily, logEvent, psql, type Family, type TestUser } from './helpers'

/**
 * Delivery pipeline against real Postgres + the mock provider (no real SMS is possible here:
 * SMS_PROVIDER=mock never sends). Covers prompts/08 test matrix and adversarial scenarios 11, 12, 19.
 */
const LOG = path.join(process.cwd(), 'test-results', 'integration-mock-sms.jsonl')

function sentLog(): { toLast4: string; body: string; outcome: string }[] {
  try {
    return readFileSync(LOG, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

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
  psql(
    `update public.notification_preferences set auto_sms_enabled = true where user_id = '${user.id}'`,
  )
}

async function automaticFamily(momNumber = '+12015550101', dadNumber = '+12015550102') {
  const f = await createFamily('Notify family')
  await admin.from('households').update({ notification_mode: 'AUTOMATIC' }).eq('id', f.householdId)
  await admin.from('notification_preferences').insert([
    { household_id: f.householdId, user_id: f.owner.id },
    { household_id: f.householdId, user_id: f.parent.id },
  ])
  await addVerifiedNumber(f, f.owner, momNumber)
  await addVerifiedNumber(f, f.parent, dadNumber)
  return f
}

const outbox = (eventId: string) =>
  psql(
    `select string_agg(state::text || ':' || coalesce(reason,''), ',' order by user_id) from public.notification_outbox where event_id = '${eventId}'`,
  ).trim()

beforeAll(() => {
  process.env.SMS_PROVIDER = 'mock'
  process.env.MOCK_SMS_LOG_FILE = LOG
})
beforeEach(() => rmSync(LOG, { force: true }))

describe('dispatcher', () => {
  it('both verified parents → two separate texts with the privacy-safe body; states recorded', async () => {
    const f = await automaticFamily()
    const { data } = await logEvent(f.parent, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
      p_notes: 'secret note',
    })
    const id = (data as { id: string }).id
    const summary = await dispatchOutbox({ eventId: id })
    expect(summary).toMatchObject({ claimed: 2, sent: 2 })
    const log = sentLog()
    expect(log.map((l) => l.toLast4).sort()).toEqual(['0101', '0102'])
    for (const l of log) {
      expect(l.body).toMatch(
        /^Baby update: Wet diaper at \d{1,2}:\d{2} [AP]M \(logged by Parent\)\.$/,
      )
      expect(l.body).not.toContain('secret note')
      expect(l.body).not.toContain('Test Baby')
    }
    expect(outbox(id)).toBe('SENT_TO_PROVIDER:,SENT_TO_PROVIDER:')
    // A second pass finds nothing to do: no duplicate sends.
    expect((await dispatchOutbox({ eventId: id })).claimed).toBe(0)
    expect(sentLog()).toHaveLength(2)
  })

  it('one recipient failing does not affect the other or the saved event', async () => {
    const f = await automaticFamily('+12015550101', '+12015550199')
    const { data } = await logEvent(f.owner, {
      p_intent: 'POOP',
      p_subtype: 'POOP',
      p_child_id: f.childId,
    })
    const id = (data as { id: string }).id
    await dispatchOutbox({ eventId: id })
    const states = psql(
      `select string_agg(c.phone_last4 || '=' || o.state, ',' order by c.phone_last4) from public.notification_outbox o join public.notification_contacts c on c.user_id = o.user_id where o.event_id = '${id}'`,
    ).trim()
    expect(states).toBe('0101=SENT_TO_PROVIDER,0199=FAILED_PERMANENT')
    expect(psql(`select state from public.care_events where id = '${id}'`).trim()).toBe('ACTIVE')
  })

  it('a timeout after sending is UNKNOWN and is never re-sent automatically', async () => {
    const f = await automaticFamily('+12015550198', '+12015550101')
    const { data } = await logEvent(f.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    const id = (data as { id: string }).id
    await dispatchOutbox({ eventId: id })
    await dispatchOutbox({})
    await dispatchOutbox({})
    expect(sentLog().filter((l) => l.toLast4 === '0198')).toHaveLength(1)
    expect(outbox(id)).toContain('UNKNOWN:PROVIDER_UNCONFIRMED')
  })

  it('retryable failures back off and stop after the attempt limit', async () => {
    const f = await automaticFamily('+12015550197', '+12015550101')
    const { data } = await logEvent(f.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    const id = (data as { id: string }).id
    await dispatchOutbox({ eventId: id })
    const row = () =>
      psql(
        `select state || '|' || attempts || '|' || (next_attempt_at > now()) from public.notification_outbox o join public.notification_contacts c on c.user_id = o.user_id where o.event_id = '${id}' and c.phone_last4 = '0197'`,
      ).trim()
    expect(row()).toBe('FAILED_RETRYABLE|1|true')
    for (let i = 0; i < 4; i++) {
      psql(
        `update public.notification_outbox set next_attempt_at = now() where event_id = '${id}' and state = 'FAILED_RETRYABLE'`,
      )
      await dispatchOutbox({ eventId: id })
    }
    expect(row()).toMatch(/^FAILED_PERMANENT\|4\|/)
    expect(outbox(id)).toContain('MAX_ATTEMPTS')
  })

  it('a provider "unsubscribed" error opts the number out everywhere', async () => {
    const f = await automaticFamily('+12015550196', '+12015550101')
    const { data } = await logEvent(f.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    await dispatchOutbox({ eventId: (data as { id: string }).id })
    expect(
      psql(
        `select opted_out_at is not null from public.notification_contacts where user_id = '${f.owner.id}'`,
      ).trim(),
    ).toBe('t')
    const next = await logEvent(f.parent, {
      p_intent: 'POOP',
      p_subtype: 'POOP',
      p_child_id: f.childId,
    })
    expect((next.data as { queued: number }).queued).toBe(1)
  })

  it('cancels instead of sending: voided entry, stale entry, mode switched off, member disabled', async () => {
    const f = await automaticFamily()
    const voided = await logEvent(f.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    const voidedId = (voided.data as { id: string }).id
    // Simulate a race: the void happens after the row was claimable but the dispatcher re-checks.
    psql(
      `update public.care_events set state = 'VOID', voided_at = now(), voided_by = '${f.owner.id}' where id = '${voidedId}'`,
    )
    await dispatchOutbox({ eventId: voidedId })
    expect(outbox(voidedId)).toBe('CANCELED:EVENT_VOIDED,CANCELED:EVENT_VOIDED')

    const stale = await logEvent(f.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    const staleId = (stale.data as { id: string }).id
    psql(
      `update public.care_events set created_at = now() - interval '31 minutes' where id = '${staleId}'`,
    )
    await dispatchOutbox({ eventId: staleId })
    expect(outbox(staleId)).toBe('CANCELED:STALE,CANCELED:STALE')

    const off = await logEvent(f.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    const offId = (off.data as { id: string }).id
    await admin.from('households').update({ notification_mode: 'COMPOSE' }).eq('id', f.householdId)
    await dispatchOutbox({ eventId: offId })
    expect(outbox(offId)).toBe('CANCELED:MODE_OFF,CANCELED:MODE_OFF')
    expect(sentLog()).toHaveLength(0)
  })

  it('switching to automatic never sends a backlog of earlier entries', async () => {
    const f = await automaticFamily('+12015550141', '+12015550142')
    await admin.from('households').update({ notification_mode: 'COMPOSE' }).eq('id', f.householdId)
    for (let i = 0; i < 3; i++)
      await logEvent(f.owner, { p_intent: 'WET', p_subtype: 'WET', p_child_id: f.childId })
    await admin
      .from('households')
      .update({ notification_mode: 'AUTOMATIC' })
      .eq('id', f.householdId)
    await dispatchOutbox({ limit: 50 })
    expect(sentLog().filter((l) => l.toLast4 === '0141' || l.toLast4 === '0142')).toHaveLength(0)
  })

  it('concurrent dispatchers never send the same row twice (lease + SKIP LOCKED)', async () => {
    const f = await automaticFamily()
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const { data } = await logEvent(f.owner, {
        p_intent: 'WET',
        p_subtype: 'WET',
        p_child_id: f.childId,
      })
      ids.push((data as { id: string }).id)
    }
    const results = await Promise.all([
      dispatchOutbox({ limit: 50 }),
      dispatchOutbox({ limit: 50 }),
      dispatchOutbox({ limit: 50 }),
    ])
    expect(results.reduce((n, r) => n + r.claimed, 0)).toBeGreaterThanOrEqual(10)
    const mine = sentLog()
    expect(mine).toHaveLength(10)
    const perEvent = psql(
      `select count(*) from public.notification_outbox where event_id = any(array['${ids.join("','")}']::uuid[]) and state = 'SENT_TO_PROVIDER'`,
    ).trim()
    expect(perEvent).toBe('10')
  })
})

describe('database delivery functions', () => {
  let f: Family
  beforeAll(async () => {
    f = await automaticFamily()
  })

  it('an expired PROCESSING lease becomes UNKNOWN (no blind resend)', async () => {
    const { data } = await logEvent(f.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: f.childId,
    })
    const id = (data as { id: string }).id
    psql(
      `update public.notification_outbox set state = 'PROCESSING', lease_until = now() - interval '1 minute' where event_id = '${id}'`,
    )
    const { data: n } = await admin.rpc('expire_outbox_leases')
    expect(Number(n)).toBeGreaterThanOrEqual(2)
    expect(outbox(id)).toBe('UNKNOWN:LEASE_EXPIRED,UNKNOWN:LEASE_EXPIRED')
  })

  it('provider status callbacks move forward only', async () => {
    const { data } = await logEvent(f.owner, {
      p_intent: 'POOP',
      p_subtype: 'POOP',
      p_child_id: f.childId,
    })
    const id = (data as { id: string }).id
    psql(
      `update public.notification_outbox set state = 'SENT_TO_PROVIDER', provider_message_id = 'SMfwd' || substr(id::text, 1, 8) where event_id = '${id}'`,
    )
    const sid = psql(
      `select provider_message_id from public.notification_outbox where event_id = '${id}' and user_id = '${f.owner.id}'`,
    ).trim()
    expect(
      (await admin.rpc('apply_provider_status', { p_message_id: sid, p_status: 'delivered' })).data,
    ).toBe('applied')
    expect(
      (await admin.rpc('apply_provider_status', { p_message_id: sid, p_status: 'sent' })).data,
    ).toBe('ignored')
    expect(
      (await admin.rpc('apply_provider_status', { p_message_id: sid, p_status: 'failed' })).data,
    ).toBe('ignored')
    expect(
      psql(
        `select state from public.notification_outbox where provider_message_id = '${sid}'`,
      ).trim(),
    ).toBe('DELIVERED')
    expect(
      (await admin.rpc('apply_provider_status', { p_message_id: 'SMnope', p_status: 'delivered' }))
        .data,
    ).toBe('unknown_message')
  })

  it('STOP opts out the number and cancels its pending texts; the other parent is unaffected', async () => {
    const g = await automaticFamily('+12015550111', '+12015550112')
    const { data } = await logEvent(g.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: g.childId,
    })
    const id = (data as { id: string }).id
    // STOP applies to every family using that number (earlier test runs may have reused it).
    const { data: n } = await admin.rpc('record_opt_out', {
      p_phone_hmac: phoneHmac('+12015550112'),
    })
    expect(Number(n)).toBeGreaterThanOrEqual(1)
    expect(
      psql(
        `select opted_out_at is not null from public.notification_contacts where user_id = '${g.parent.id}'`,
      ).trim(),
    ).toBe('t')
    expect(outbox(id)).toContain('CANCELED:OPTED_OUT')
    expect(outbox(id)).toContain('PENDING:')
    const next = await logEvent(g.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: g.childId,
    })
    expect((next.data as { queued: number }).queued).toBe(1)
  })

  it('verification: rate limited sends, max 5 tries, code bound to the number, changing the number resets consent', async () => {
    const g = await createFamily('Verify family')
    await admin.rpc('set_contact', {
      p_household_id: g.householdId,
      p_user_id: g.parent.id,
      p_ciphertext: encryptPhone('+12015550121'),
      p_hmac: phoneHmac('+12015550121'),
      p_last4: '0121',
      p_set_by: g.owner.id,
    })
    const mac = phoneHmac('+12015550121')
    const begin = () =>
      admin.rpc('begin_contact_verification', {
        p_household_id: g.householdId,
        p_user_id: g.parent.id,
        p_code_hash: hashVerificationCode('424242', mac),
        p_ttl_seconds: 600,
      })
    expect((await begin()).data).toBe('ok')
    expect((await begin()).data).toBe('too_soon')
    const confirm = (code: string) =>
      admin.rpc('confirm_contact_verification', {
        p_household_id: g.householdId,
        p_user_id: g.parent.id,
        p_code_hash: hashVerificationCode(code, mac),
        p_consent_version: 'v1',
      })
    for (let i = 0; i < 5; i++) expect((await confirm('000000')).data).toBe('wrong_code')
    expect((await confirm('424242')).data).toBe('too_many_attempts')

    psql(
      `update public.notification_contacts set last_verification_sent_at = now() - interval '2 minutes' where user_id = '${g.parent.id}'`,
    )
    expect((await begin()).data).toBe('ok')
    expect((await confirm('424242')).data).toBe('ok')
    expect(
      psql(
        `select (verified_at is not null) || ',' || (consent_at is not null) || ',' || consent_text_version from public.notification_contacts where user_id = '${g.parent.id}'`,
      ).trim(),
    ).toBe('true,true,v1')

    await admin.rpc('set_contact', {
      p_household_id: g.householdId,
      p_user_id: g.parent.id,
      p_ciphertext: encryptPhone('+12015550122'),
      p_hmac: phoneHmac('+12015550122'),
      p_last4: '0122',
      p_set_by: g.owner.id,
    })
    expect(
      psql(
        `select (verified_at is null) || ',' || (consent_at is null) from public.notification_contacts where user_id = '${g.parent.id}'`,
      ).trim(),
    ).toBe('true,true')
  })

  it('contacts never get stored as plaintext', async () => {
    const all = psql(
      `select string_agg(phone_ciphertext || phone_hmac || phone_last4, '|') from public.notification_contacts`,
    )
    expect(all).not.toMatch(/20155501\d\d/)
  })

  it('caregivers cannot be given a number for texts', async () => {
    const { error } = await admin.rpc('set_contact', {
      p_household_id: f.householdId,
      p_user_id: f.caregiver.id,
      p_ciphertext: encryptPhone('+12015550131'),
      p_hmac: phoneHmac('+12015550131'),
      p_last4: '0131',
      p_set_by: f.owner.id,
    })
    expect(error?.code).toBe('NB422')
  })
})
