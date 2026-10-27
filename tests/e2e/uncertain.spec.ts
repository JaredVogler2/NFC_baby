import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { generateTagToken } from '../../lib/nfc/token'
import { admin, countEvents, seedFamily, signInContext, sql, type SeededFamily } from './support'

/** Saves whose outcome is unknown: the phone must say "can't confirm", never guess. */

async function seedTag(fam: SeededFamily, purpose: 'WET' | 'POOP' | 'BOTH' | 'FEED') {
  const token = generateTagToken()
  const { error } = await admin.from('nfc_tags').insert({
    token,
    household_id: fam.householdId,
    child_id: fam.childId,
    purpose,
    label: `${purpose} sticker`,
    created_by: fam.owner.id,
  })
  if (error) throw error
  return token
}

test.describe('uncertain saves', () => {
  let fam: SeededFamily
  let context: BrowserContext
  let page: Page

  test.beforeEach(async ({ browser }) => {
    fam = await seedFamily()
    context = await browser.newContext()
    await signInContext(context, fam.parent.email)
    page = await context.newPage()
  })
  test.afterEach(async () => {
    await context.close()
  })

  test('connection drops while submitting → "can’t confirm" → kept pending → one event after sync', async () => {
    const token = await seedTag(fam, 'BOTH')
    await page.goto(`/t/${token}`)
    await page.route('**/api/v1/events', (r) => r.abort('internetdisconnected'))
    await page.route('**/api/v1/events/by-request/**', (r) => r.abort('internetdisconnected'))
    await page.getByRole('button', { name: 'Save wet + poop' }).click()
    await expect(page.getByText('Can’t confirm the save yet', { exact: true })).toBeVisible({
      timeout: 20_000,
    })
    expect(countEvents(fam.householdId)).toBe(0)
    await page.getByRole('button', { name: 'Keep as pending on this phone' }).click()
    await expect(
      page.getByText('Pending on this device — NOT yet in shared history; no text sent.'),
    ).toBeVisible()
    await page.unrouteAll()
    // Scanning again later shows that an earlier entry is still only on this phone.
    await page.goto(`/t/${token}`)
    await expect(page.getByText(/1 earlier entry is still pending on this phone/)).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(0) // scanning never syncs or saves anything
    await page.getByRole('link', { name: 'Open Home to sync' }).click()
    await expect(page.getByText(/1 pending entry is now in the shared history/)).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(1)
    expect(
      sql(`select source from public.care_events where household_id = '${fam.householdId}'`),
    ).toBe('OFFLINE_SYNC')
  })

  test('response lost right after the server committed → sync finds that event; no duplicate', async () => {
    const token = await seedTag(fam, 'WET')
    await page.goto(`/t/${token}`)
    await page.route('**/api/v1/events', async (route) => {
      await route.fetch() // the server really saves it…
      await route.abort('connectionreset') // …but the phone never hears back
    })
    await page.route('**/api/v1/events/by-request/**', (r) => r.abort('internetdisconnected'))
    await page.getByRole('button', { name: 'Save wet diaper' }).click()
    await expect(page.getByText('Can’t confirm the save yet', { exact: true })).toBeVisible({
      timeout: 20_000,
    })
    expect(countEvents(fam.householdId)).toBe(1) // committed, but the phone can't know yet
    await page.getByRole('button', { name: 'Keep as pending on this phone' }).click()
    await page.unrouteAll()
    await page.getByRole('link', { name: 'Done' }).click()
    await expect(page.getByText(/1 pending entry is now in the shared history/)).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(1)
    // The original committed save is the record (it was never re-sent).
    expect(
      sql(`select source from public.care_events where household_id = '${fam.householdId}'`),
    ).toBe('TAG')
  })
})
