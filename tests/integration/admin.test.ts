import { createHash, randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createFamily, createTestUser, psql, type Family } from './helpers'

const hash = (t: string) => createHash('sha256').update(t).digest('hex')

let fam: Family
beforeAll(async () => {
  fam = await createFamily('Admin family')
})

async function invite(email: string, role = 'parent', ttl = 24) {
  const token = randomBytes(32).toString('base64url')
  const { data, error } = await fam.owner.client.rpc('create_invite', {
    p_household_id: fam.householdId,
    p_email: email,
    p_role: role,
    p_display_name: 'New person',
    p_token_hash: hash(token),
    p_ttl_hours: ttl,
  })
  if (error) throw error
  return { id: data as string, token }
}

describe('invites', () => {
  it('stores only a hash, accepts once for the matching email, and is idempotent for that user', async () => {
    const joiner = await createTestUser('joiner')
    const { id, token } = await invite(joiner.email.toUpperCase())
    const row = await admin.from('household_invites').select('*').eq('id', id).single()
    expect(row.data!.token_hash).toBe(hash(token))
    expect(JSON.stringify(row.data)).not.toContain(token)
    expect(row.data!.email).toBe(joiner.email)

    const accepted = await joiner.client.rpc('accept_invite', {
      p_token_hash: hash(token),
      p_display_name: 'Papa',
    })
    expect(accepted.error).toBeNull()
    const again = await joiner.client.rpc('accept_invite', {
      p_token_hash: hash(token),
      p_display_name: 'Papa',
    })
    expect(again.error).toBeNull()
    const ctx = await joiner.client.rpc('get_my_context')
    expect((ctx.data as { membership: { role: string } }).membership.role).toBe('parent')

    const someoneElse = await createTestUser('else')
    const reuse = await someoneElse.client.rpc('accept_invite', {
      p_token_hash: hash(token),
      p_display_name: 'x',
    })
    expect(reuse.error?.message).toBe('INVITE_INVALID')
  })

  it('rejects a different signed-in email, expired, revoked and unknown invites', async () => {
    const intended = `intended-${Date.now()}@example.test`
    const { token } = await invite(intended)
    const wrong = await createTestUser('wrong')
    const mismatch = await wrong.client.rpc('accept_invite', {
      p_token_hash: hash(token),
      p_display_name: 'x',
    })
    expect(mismatch.error?.message).toBe('INVITE_EMAIL_MISMATCH')

    const expiredUser = await createTestUser('expired')
    const expired = await invite(expiredUser.email)
    psql(
      `update public.household_invites set expires_at = now() - interval '1 minute', created_at = now() - interval '2 hours' where id = '${expired.id}'`,
    )
    const e = await expiredUser.client.rpc('accept_invite', {
      p_token_hash: hash(expired.token),
      p_display_name: 'x',
    })
    expect(e.error?.message).toBe('INVITE_INVALID')

    const revokedUser = await createTestUser('revoked')
    const revoked = await invite(revokedUser.email)
    await fam.owner.client.rpc('revoke_invite', { p_invite_id: revoked.id })
    const r = await revokedUser.client.rpc('accept_invite', {
      p_token_hash: hash(revoked.token),
      p_display_name: 'x',
    })
    expect(r.error?.message).toBe('INVITE_INVALID')

    const unknown = await revokedUser.client.rpc('accept_invite', {
      p_token_hash: 'f'.repeat(64),
      p_display_name: 'x',
    })
    expect(unknown.error?.message).toBe('INVITE_INVALID')
  })

  it('re-inviting the same email retires the older link', async () => {
    const email = `twice-${Date.now()}@example.test`
    const first = await invite(email)
    await invite(email)
    const old = await admin
      .from('household_invites')
      .select('revoked_at')
      .eq('id', first.id)
      .single()
    expect(old.data!.revoked_at).not.toBeNull()
  })

  it('cannot invite an existing member', async () => {
    const res = await fam.owner.client.rpc('create_invite', {
      p_household_id: fam.householdId,
      p_email: fam.parent.email,
      p_role: 'parent',
      p_display_name: null,
      p_token_hash: hash('x'),
      p_ttl_hours: 24,
    })
    expect(res.error?.message).toBe('ALREADY_MEMBER')
  })
})

describe('members', () => {
  it('owner can deactivate a member, who then loses all access', async () => {
    const f = await createFamily('Deactivate family')
    const res = await f.owner.client.rpc('set_member_disabled', {
      p_household_id: f.householdId,
      p_user_id: f.caregiver.id,
      p_disabled: true,
    })
    expect(res.error).toBeNull()
    const ctx = await f.caregiver.client.rpc('get_my_context')
    expect((ctx.data as { membership: unknown }).membership).toBeNull()
    const events = await f.caregiver.client
      .from('care_events')
      .select('id')
      .eq('household_id', f.householdId)
    expect(events.data).toEqual([])
    const self = await f.owner.client.rpc('set_member_disabled', {
      p_household_id: f.householdId,
      p_user_id: f.owner.id,
      p_disabled: true,
    })
    expect(self.error?.code).toBe('NB422')
  })
})

describe('bootstrap', () => {
  it('is callable only by the service role, and only while no household exists', async () => {
    const user = await createTestUser('boot')
    const asUser = await user.client.rpc('bootstrap_household', {
      p_user_id: user.id,
      p_household_name: 'x',
      p_timezone: 'UTC',
      p_child_nickname: 'x',
      p_display_name: 'x',
    })
    expect(asUser.error).not.toBeNull()
    // Households already exist in this test database → refused even for the service role.
    const asService = await admin.rpc('bootstrap_household', {
      p_user_id: user.id,
      p_household_name: 'x',
      p_timezone: 'UTC',
      p_child_nickname: 'x',
      p_display_name: 'x',
    })
    expect(asService.error?.message).toBe('ALREADY_BOOTSTRAPPED')
  })
})

describe('schema matches the TypeScript read model', () => {
  it('care_event_list exposes every column toCareEvent reads', async () => {
    const cols = psql(
      "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'care_event_list'",
    )
      .trim()
      .split(',')
    for (const c of [
      'id',
      'child_id',
      'event_type',
      'subtype',
      'occurred_at',
      'created_at',
      'updated_at',
      'created_by',
      'created_by_name',
      'updated_by',
      'updated_by_name',
      'source',
      'source_tag_id',
      'source_tag_label',
      'notes',
      'state',
      'voided_at',
      'voided_by',
      'voided_by_name',
      'void_reason',
      'revision',
      'milk_type',
      'amount_ml',
      'amount_unknown',
      'amount_entered_value',
      'amount_entered_unit',
      'side',
      'duration_seconds',
      'ended_at',
    ]) {
      expect(cols).toContain(c)
    }
  })

  it('every public table has RLS enabled', () => {
    const off = psql(
      "select coalesce(string_agg(relname, ','), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
    ).trim()
    expect(off).toBe('')
  })

  it('no SECURITY DEFINER function is executable by anon', () => {
    const exposed = psql(`
      select coalesce(string_agg(p.proname, ','), '')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
    `).trim()
    expect(exposed).toBe('')
  })
})
