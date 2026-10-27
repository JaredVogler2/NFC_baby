import { randomUUID } from 'node:crypto'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { generateTagToken } from '../../lib/nfc/token'
import { admin, countEvents, seedFamily, signInContext, sql, type SeededFamily } from './support'

/**
 * Daylight-saving edges in America/New_York (prompt 10 scenario 9): a time that never happened is
 * refused with an explanation, and a time that happened twice must be chosen explicitly.
 */

/** nth Sunday of a month (UTC date parts are fine for a calendar date). */
function nthSunday(year: number, month: number, n: number): string {
  const first = new Date(Date.UTC(year, month, 1))
  const day = 1 + ((7 - first.getUTCDay()) % 7) + (n - 1) * 7
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Most recent US transition date (spring: 2nd Sunday of March, fall: 1st Sunday of November)
 * that is at least two days in the past, so it is always within the app's one-year window. */
function recent(kind: 'spring' | 'fall'): string {
  const now = Date.now()
  const year = new Date().getUTCFullYear()
  for (const y of [year, year - 1]) {
    const date = kind === 'spring' ? nthSunday(y, 2, 2) : nthSunday(y, 10, 1)
    if (Date.parse(`${date}T12:00:00Z`) < now - 2 * 86_400_000) return date
  }
  throw new Error('no transition found')
}

test.describe('daylight-saving time edges', () => {
  let fam: SeededFamily
  let token: string
  let context: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    fam = await seedFamily()
    token = generateTagToken()
    const { error } = await admin.from('nfc_tags').insert({
      token,
      household_id: fam.householdId,
      child_id: fam.childId,
      purpose: 'WET',
      label: 'DST test',
      created_by: fam.owner.id,
    })
    if (error) throw error
    context = await browser.newContext()
    await signInContext(context, fam.parent.email)
    page = await context.newPage()
  })
  test.afterAll(async () => {
    await context.close()
  })

  async function pick(date: string, time: string) {
    await page.goto(`/t/${token}`)
    await page.getByRole('button', { name: 'Change time' }).click()
    await page.getByLabel('Date', { exact: true }).fill(date)
    await page.getByLabel('Time', { exact: true }).fill(time)
  }

  test('spring forward: 2:30 AM never happened → explained, nothing saved', async () => {
    const before = countEvents(fam.householdId)
    await pick(recent('spring'), '02:30')
    await page.getByRole('button', { name: 'Save wet diaper' }).click()
    await expect(page.getByText('That time didn’t exist (clocks moved forward)')).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(before)
  })

  for (const [choice, label, utcHour] of [
    [0, /EDT \(first time\)/, '05:30'],
    [1, /EST \(second time\)/, '06:30'],
  ] as const) {
    test(`fall back: 1:30 AM happened twice → the ${choice === 0 ? 'first' : 'second'} one is stored exactly`, async () => {
      const date = recent('fall')
      await pick(date, '01:30')
      await expect(page.getByText('Clocks went back that night')).toBeVisible()
      await page.getByRole('radio', { name: label }).check()
      await page.getByRole('button', { name: 'Save wet diaper' }).click()
      // More than a day ago: the app asks first.
      await page.getByRole('button', { name: 'Yes, that time is right' }).click()
      await page.getByRole('button', { name: 'Save wet diaper' }).click()
      await expect(page).toHaveURL(/\/saved\//)
      const stored = sql(
        `select to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') from public.care_events where household_id = '${fam.householdId}' order by created_at desc limit 1`,
      )
      expect(stored).toBe(`${date}T${utcHour}`)
    })
  }

  test('the API refuses a local time without an offset (no silent guessing)', async () => {
    const res = await context.request.post('/api/v1/events', {
      headers: { Origin: 'http://localhost:3100' },
      data: {
        clientRequestId: randomUUID(),
        intent: 'WET',
        tagToken: token,
        occurredAt: `${recent('fall')}T01:30:00`,
        confirmOld: true,
      },
    })
    expect(res.status()).toBe(422)
  })
})
