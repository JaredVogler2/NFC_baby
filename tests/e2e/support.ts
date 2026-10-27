import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Load .env.local for the local Supabase URLs/keys (CI exports them directly).
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]
  }
}

export const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? 3100}`
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'
const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
export const BOOTSTRAP_EMAIL = process.env.BOOTSTRAP_OWNER_EMAIL ?? 'owner@example.test'

export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
)

export function sql(query: string): string {
  return execFileSync('psql', [DB_URL, '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', query], {
    encoding: 'utf8',
  }).trim()
}

export function sqlNumber(query: string): number {
  return Number(sql(query))
}

/** Wipe all family data and auth users (E2E only; never against a real project). */
export async function resetAll() {
  sql("set nfcb.allow_purge = 'on'; truncate public.households cascade; delete from auth.users;")
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
}

export function uniqueEmail(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}@example.test`
}

/** Newest sign-in code emailed to `email` after `since` (ms epoch). */
export async function waitForCode(email: string, since: number): Promise<string> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    const body = (await res.json()) as { messages: { ID: string; Created: string }[] }
    const fresh = body.messages.find((m) => Date.parse(m.Created) >= since - 2000)
    if (fresh) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as {
        Text: string
      }
      const code = msg.Text.match(/\b(\d{6})\b/)?.[1]
      if (code) return code
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`no sign-in email for ${email}`)
}

export async function waitForLink(email: string, since: number): Promise<string> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    const body = (await res.json()) as { messages: { ID: string; Created: string }[] }
    const fresh = body.messages.find((m) => Date.parse(m.Created) >= since - 2000)
    if (fresh) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as {
        HTML: string
      }
      const href = msg.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1]
      if (href) return href.replace(/&amp;/g, '&')
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`no sign-in link for ${email}`)
}

/** Sign in through the real UI (email → emailed code). */
export async function signInViaUi(page: Page, email: string, next = '/dashboard') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.getByLabel('Email').fill(email)
  const since = Date.now()
  await page.getByRole('button', { name: 'Email me a sign-in code' }).click()
  await expect(page.getByText('Check your email')).toBeVisible()
  await page.getByLabel('Code').fill(await waitForCode(email, since))
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Fast sign-in through the same API the UI uses; cookies land in the browser context. */
export async function signInContext(context: BrowserContext | APIRequestContext, email: string) {
  const request = 'request' in context ? context.request : context
  const headers = { Origin: BASE_URL }
  const since = Date.now()
  const sent = await request.post(`${BASE_URL}/api/v1/auth/otp`, { data: { email }, headers })
  expect(sent.status()).toBe(200)
  const code = await waitForCode(email, since)
  const verified = await request.post(`${BASE_URL}/api/v1/auth/verify`, {
    data: { email, code },
    headers,
  })
  expect(verified.status()).toBe(200)
}

export type SeededFamily = {
  householdId: string
  childId: string
  childName: string
  owner: { id: string; email: string }
  parent: { id: string; email: string }
  caregiver: { id: string; email: string }
  viewer: { id: string; email: string }
}

async function createUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('createUser failed')
  return { id: data.user.id, email }
}

/** Synthetic family (fake names only) created with the service role. */
export async function seedFamily(
  opts: { childName?: string; mode?: 'OFF' | 'COMPOSE' | 'AUTOMATIC' } = {},
): Promise<SeededFamily> {
  const childName = opts.childName ?? `Bean ${randomUUID().slice(0, 4)}`
  const [owner, parent, caregiver, viewer] = await Promise.all([
    createUser(uniqueEmail('mom')),
    createUser(uniqueEmail('dad')),
    createUser(uniqueEmail('sitter')),
    createUser(uniqueEmail('grandma')),
  ])
  const hh = await admin
    .from('households')
    .insert({
      display_name: 'E2E family',
      timezone: 'America/New_York',
      notification_mode: opts.mode ?? 'OFF',
    })
    .select('id')
    .single()
  if (hh.error) throw hh.error
  const householdId = hh.data.id as string
  const child = await admin
    .from('children')
    .insert({ household_id: householdId, nickname: childName })
    .select('id')
    .single()
  if (child.error) throw child.error
  const people = [
    [owner, 'owner', 'Mom'],
    [parent, 'parent', 'Dad'],
    [caregiver, 'caregiver', 'Sitter'],
    [viewer, 'viewer', 'Grandma'],
  ] as const
  await admin
    .from('profiles')
    .insert(people.map(([u, , name]) => ({ user_id: u.id, display_name: name })))
  await admin
    .from('household_members')
    .insert(people.map(([u, role]) => ({ household_id: householdId, user_id: u.id, role })))
  await admin
    .from('notification_preferences')
    .insert([owner, parent].map((u) => ({ household_id: householdId, user_id: u.id })))
  return {
    householdId,
    childId: child.data.id as string,
    childName,
    owner,
    parent,
    caregiver,
    viewer,
  }
}

export function countEvents(householdId: string): number {
  return sqlNumber(`select count(*) from public.care_events where household_id = '${householdId}'`)
}

export function countOutbox(householdId: string): number {
  return sqlNumber(
    `select count(*) from public.notification_outbox where household_id = '${householdId}'`,
  )
}
