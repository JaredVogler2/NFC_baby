import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { generateTagToken } from '@/lib/nfc/token'

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const noSession = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}

export const admin = createClient(SUPABASE_URL, SERVICE_KEY, noSession)

export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, noSession)
}

/** Run SQL as the database superuser (test setup/teardown only). */
export function psql(sql: string): string {
  const url =
    process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  return execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], {
    encoding: 'utf8',
  })
}

export type TestUser = { id: string; email: string; client: SupabaseClient }

const PASSWORD = 'integration-test-password-only'

export async function createTestUser(label: string): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('createUser failed')
  const client = createClient(SUPABASE_URL, ANON_KEY, noSession)
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signIn.error) throw signIn.error
  return { id: data.user.id, email, client }
}

export type Family = {
  householdId: string
  childId: string
  owner: TestUser
  parent: TestUser
  caregiver: TestUser
  viewer: TestUser
}

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data
}

/** A household with one child and one member of every role (service-role setup). */
export async function createFamily(name = 'Test family'): Promise<Family> {
  const [owner, parent, caregiver, viewer] = await Promise.all([
    createTestUser('owner'),
    createTestUser('parent'),
    createTestUser('caregiver'),
    createTestUser('viewer'),
  ])
  const household = await must(
    admin
      .from('households')
      .insert({ display_name: name, timezone: 'America/New_York' })
      .select('id')
      .single(),
  )
  const householdId = (household as { id: string }).id
  const child = await must(
    admin
      .from('children')
      .insert({ household_id: householdId, nickname: 'Test Baby' })
      .select('id')
      .single(),
  )
  const people: [TestUser, string, string][] = [
    [owner, 'owner', 'Owner'],
    [parent, 'parent', 'Parent'],
    [caregiver, 'caregiver', 'Sitter'],
    [viewer, 'viewer', 'Grandma'],
  ]
  await must(
    admin.from('profiles').insert(people.map(([u, , n]) => ({ user_id: u.id, display_name: n }))),
  )
  await must(
    admin
      .from('household_members')
      .insert(people.map(([u, role]) => ({ household_id: householdId, user_id: u.id, role }))),
  )
  return { householdId, childId: (child as { id: string }).id, owner, parent, caregiver, viewer }
}

export async function createTag(
  family: Family,
  purpose: 'WET' | 'POOP' | 'BOTH' | 'FEED',
  by: TestUser = family.owner,
): Promise<{ id: string; token: string }> {
  const token = generateTagToken()
  const { data, error } = await by.client.rpc('create_tag', {
    p_token: token,
    p_child_id: family.childId,
    p_purpose: purpose,
    p_label: `${purpose} test tag`,
  })
  if (error) throw error
  return { id: data as string, token }
}

export type LogArgs = {
  p_client_request_id?: string
  p_intent: 'WET' | 'POOP' | 'BOTH' | 'FEED'
  p_subtype: 'WET' | 'POOP' | 'BOTH' | 'BOTTLE' | 'NURSING'
  p_source?: 'TAG' | 'DASHBOARD' | 'SHORTCUT' | 'OFFLINE_SYNC'
  p_tag_token?: string | null
  p_child_id?: string | null
  p_occurred_at?: string | null
  p_confirm_old?: boolean
  p_notes?: string | null
  p_feeding?: Record<string, unknown> | null
}

export function logEvent(user: TestUser, args: LogArgs) {
  return user.client.rpc('log_care_event', {
    p_client_request_id: args.p_client_request_id ?? randomUUID(),
    p_source: args.p_source ?? (args.p_tag_token ? 'TAG' : 'DASHBOARD'),
    ...args,
  })
}

export async function countEvents(householdId: string): Promise<number> {
  const { count, error } = await admin
    .from('care_events')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
  if (error) throw error
  return count ?? 0
}

/** Give a member a verified, consented SMS contact (fake ciphertext; no real number). */
export async function makeSmsRecipient(
  family: Family,
  user: TestUser,
  opts: { optedOut?: boolean } = {},
) {
  await admin.from('notification_preferences').upsert({
    household_id: family.householdId,
    user_id: user.id,
    auto_sms_enabled: true,
  })
  const { error } = await admin.from('notification_contacts').upsert({
    household_id: family.householdId,
    user_id: user.id,
    phone_ciphertext: 'test-ciphertext',
    phone_hmac: randomUUID().replace(/-/g, '').padEnd(64, '0'),
    phone_last4: '0100',
    set_by: user.id,
    verified_at: new Date().toISOString(),
    consent_at: new Date().toISOString(),
    consent_text_version: 'test',
    opted_out_at: opts.optedOut ? new Date().toISOString() : null,
  })
  if (error) throw error
}
