import { beforeAll, describe, expect, it } from 'vitest'
import {
  admin,
  anonClient,
  countEvents,
  createFamily,
  createTag,
  createTestUser,
  logEvent,
  type Family,
  type TestUser,
} from './helpers'

/**
 * Row Level Security and authorization against the real local Supabase (PostgREST + Postgres),
 * using real user JWTs. Covers adversarial scenarios 1–3 of prompts/10 and acceptance A07–A09.
 */
let familyA: Family
let familyB: Family
let outsider: TestUser
let eventA: string
let tagA: { id: string; token: string }

beforeAll(async () => {
  familyA = await createFamily('Family A')
  familyB = await createFamily('Family B')
  outsider = await createTestUser('outsider')
  tagA = await createTag(familyA, 'WET')
  const { data, error } = await logEvent(familyA.parent, {
    p_intent: 'WET',
    p_subtype: 'WET',
    p_tag_token: tagA.token,
    p_notes: 'private note A',
  })
  if (error) throw error
  eventA = (data as { id: string }).id
})

describe('anonymous visitor', () => {
  it.each([
    'households',
    'children',
    'care_events',
    'nfc_tags',
    'profiles',
    'household_members',
    'notification_contacts',
    'care_event_list',
  ])('cannot read %s', async (table) => {
    const { data, error } = await anonClient().from(table).select('*').limit(5)
    // No grant at all → permission denied (42501), never data.
    expect(data ?? []).toEqual([])
    expect(error?.code).toBe('42501')
  })

  it('cannot call write or resolver functions', async () => {
    const anon = anonClient()
    const log = await anon.rpc('log_care_event', {
      p_client_request_id: crypto.randomUUID(),
      p_intent: 'WET',
      p_subtype: 'WET',
      p_source: 'TAG',
      p_tag_token: tagA.token,
    })
    expect(log.error).not.toBeNull()
    const resolve = await anon.rpc('resolve_tag', { p_token: tagA.token })
    expect(resolve.data ?? null).toBeNull()
    expect(await countEvents(familyA.householdId)).toBe(1)
  })
})

describe('member of another household', () => {
  it('sees none of family A data', async () => {
    const c = familyB.owner.client
    for (const table of ['care_events', 'children', 'nfc_tags', 'care_event_list', 'households']) {
      const { data, error } = await c
        .from(table)
        .select('*')
        .eq(table === 'households' ? 'id' : 'household_id', familyA.householdId)
      expect(error).toBeNull()
      expect(data).toEqual([])
    }
    const profiles = await c.from('profiles').select('*').eq('user_id', familyA.owner.id)
    expect(profiles.data).toEqual([])
  })

  it('cannot resolve family A tag (same answer as an unknown token)', async () => {
    const { data, error } = await familyB.owner.client.rpc('resolve_tag', { p_token: tagA.token })
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('cannot log through family A tag or child id', async () => {
    const viaTag = await logEvent(familyB.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_tag_token: tagA.token,
    })
    expect(viaTag.error?.code).toBe('NB404')
    const viaChild = await logEvent(familyB.owner, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: familyA.childId,
    })
    expect(viaChild.error?.code).toBe('NB404')
    expect(await countEvents(familyA.householdId)).toBe(1)
  })

  it('cannot edit, void, or read the dashboard of family A', async () => {
    const c = familyB.parent.client
    const upd = await c.rpc('update_care_event', {
      p_event_id: eventA,
      p_expected_revision: 1,
      p_patch: { notes: 'hijacked' },
    })
    expect(upd.error?.code).toBe('NB404')
    const voided = await c.rpc('void_care_event', { p_event_id: eventA, p_expected_revision: 1 })
    expect(voided.error?.code).toBe('NB404')
    const dash = await c.rpc('get_dashboard', { p_child_id: familyA.childId })
    expect(dash.error?.code).toBe('NB404')
    const tagEdit = await c.rpc('revoke_tag', { p_tag_id: tagA.id })
    expect(tagEdit.error?.code).toBe('NB404')
  })

  it('a signed-in user with no household sees nothing and cannot log', async () => {
    const ctx = await outsider.client.rpc('get_my_context')
    expect((ctx.data as { membership: unknown }).membership).toBeNull()
    const events = await outsider.client.from('care_events').select('id')
    expect(events.data).toEqual([])
    const log = await logEvent(outsider, {
      p_intent: 'POOP',
      p_subtype: 'POOP',
      p_child_id: familyA.childId,
    })
    expect(log.error?.code).toBe('NB404')
  })
})

describe('members cannot bypass the write functions', () => {
  it('direct INSERT/UPDATE/DELETE on care_events is denied', async () => {
    const c = familyA.owner.client
    const ins = await c.from('care_events').insert({
      household_id: familyA.householdId,
      child_id: familyA.childId,
      event_type: 'DIAPER',
      subtype: 'WET',
      occurred_at: new Date().toISOString(),
      created_by: familyA.parent.id, // impersonation attempt
      source: 'DASHBOARD',
      idempotency_key: crypto.randomUUID(),
      request_hash: 'xxxxxxxxxxxx',
    })
    expect(ins.error?.code).toBe('42501')
    const upd = await c.from('care_events').update({ notes: 'x' }).eq('id', eventA)
    expect(upd.error?.code).toBe('42501')
    const del = await c.from('care_events').delete().eq('id', eventA)
    expect(del.error?.code).toBe('42501')
  })

  it('cannot read or write phone contacts, even as owner', async () => {
    const read = await familyA.owner.client.from('notification_contacts').select('*')
    expect(read.error?.code).toBe('42501')
    const write = await familyA.owner.client.from('notification_contacts').insert({
      household_id: familyA.householdId,
      user_id: familyA.owner.id,
      phone_ciphertext: 'x',
      phone_hmac: '0'.repeat(64),
      phone_last4: '0000',
      set_by: familyA.owner.id,
    })
    expect(write.error?.code).toBe('42501')
  })

  it('cannot call internal/service-only functions', async () => {
    const c = familyA.owner.client
    const enqueue = await c.rpc('_enqueue_notifications', { p_event_id: eventA })
    expect(enqueue.error).not.toBeNull()
    const boot = await c.rpc('bootstrap_household', {
      p_user_id: familyA.owner.id,
      p_household_name: 'x',
      p_timezone: 'UTC',
      p_child_nickname: 'x',
      p_display_name: 'x',
    })
    expect(boot.error).not.toBeNull()
  })

  it('event author is always the signed-in user', async () => {
    const { data } = await logEvent(familyA.caregiver, {
      p_intent: 'POOP',
      p_subtype: 'POOP',
      p_child_id: familyA.childId,
    })
    const row = await admin
      .from('care_events')
      .select('created_by')
      .eq('id', (data as { id: string }).id)
      .single()
    expect(row.data?.created_by).toBe(familyA.caregiver.id)
  })
})

describe('role boundaries', () => {
  it('viewer can read but not log', async () => {
    const read = await familyA.viewer.client.from('care_events').select('id').eq('id', eventA)
    expect(read.data).toHaveLength(1)
    const log = await logEvent(familyA.viewer, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: familyA.childId,
    })
    expect(log.error?.code).toBe('NB403')
  })

  it('caregiver can log, edit own entries, but not edit or void others', async () => {
    const own = await logEvent(familyA.caregiver, {
      p_intent: 'WET',
      p_subtype: 'WET',
      p_child_id: familyA.childId,
    })
    expect(own.error).toBeNull()
    const ownId = (own.data as { id: string }).id
    const editOwn = await familyA.caregiver.client.rpc('update_care_event', {
      p_event_id: ownId,
      p_expected_revision: 1,
      p_patch: { notes: 'changed by sitter' },
    })
    expect(editOwn.error).toBeNull()
    const editOther = await familyA.caregiver.client.rpc('update_care_event', {
      p_event_id: eventA,
      p_expected_revision: 1,
      p_patch: { notes: 'x' },
    })
    expect(editOther.error?.code).toBe('NB403')
    const voidOther = await familyA.caregiver.client.rpc('void_care_event', {
      p_event_id: eventA,
      p_expected_revision: 1,
    })
    expect(voidOther.error?.code).toBe('NB403')
  })

  it('audit trail is visible to owner/parent only', async () => {
    const parent = await familyA.parent.client
      .from('care_event_audit')
      .select('*')
      .eq('event_id', eventA)
    expect(parent.data!.length).toBeGreaterThan(0)
    const caregiver = await familyA.caregiver.client
      .from('care_event_audit')
      .select('*')
      .eq('event_id', eventA)
    expect(caregiver.data).toEqual([])
  })

  it('caregiver and viewer cannot manage tags; parent can', async () => {
    for (const u of [familyA.caregiver, familyA.viewer]) {
      const res = await u.client.rpc('create_tag', {
        p_token: '0123456789abcdefghjkmnpqrs',
        p_child_id: familyA.childId,
        p_purpose: 'POOP',
        p_label: 'x',
      })
      expect(res.error?.code).toBe('NB403')
    }
    await expect(createTag(familyA, 'POOP', familyA.parent)).resolves.toBeTruthy()
  })

  it('only owners manage invites, members and household settings', async () => {
    const invite = await familyA.parent.client.rpc('create_invite', {
      p_household_id: familyA.householdId,
      p_email: 'someone@example.test',
      p_role: 'parent',
      p_display_name: 'Someone',
      p_token_hash: 'a'.repeat(64),
      p_ttl_hours: 24,
    })
    expect(invite.error?.code).toBe('NB403')
    const hh = await familyA.parent.client.rpc('update_household', {
      p_household_id: familyA.householdId,
      p_display_name: 'Renamed',
      p_timezone: 'UTC',
      p_default_feed_method: null,
      p_default_volume_unit: 'ml',
    })
    expect(hh.error?.code).toBe('NB403')
    const mode = await familyA.parent.client.rpc('set_notification_mode', {
      p_household_id: familyA.householdId,
      p_mode: 'AUTOMATIC',
    })
    expect(mode.error?.code).toBe('NB403')
    const role = await familyA.parent.client.rpc('set_member_role', {
      p_household_id: familyA.householdId,
      p_user_id: familyA.parent.id,
      p_role: 'owner',
    })
    expect(role.error?.code).toBe('NB403')
  })

  it('cannot remove the last owner', async () => {
    const res = await familyA.owner.client.rpc('set_member_role', {
      p_household_id: familyA.householdId,
      p_user_id: familyA.owner.id,
      p_role: 'parent',
    })
    expect(res.error?.code).toBe('NB422')
  })

  it('notification overview: owner sees masked numbers for all adults, others only their own', async () => {
    const owner = await familyA.owner.client.rpc('get_notification_overview', {
      p_household_id: familyA.householdId,
    })
    const ownerRecipients = (owner.data as { recipients: { userId: string }[] }).recipients
    expect(ownerRecipients.map((r) => r.userId).sort()).toEqual(
      [familyA.owner.id, familyA.parent.id].sort(),
    )
    const parent = await familyA.parent.client.rpc('get_notification_overview', {
      p_household_id: familyA.householdId,
    })
    expect(
      (parent.data as { recipients: { userId: string }[] }).recipients.map((r) => r.userId),
    ).toEqual([familyA.parent.id])
    const outsiderView = await familyB.owner.client.rpc('get_notification_overview', {
      p_household_id: familyA.householdId,
    })
    expect(outsiderView.error?.code).toBe('NB404')
  })
})
