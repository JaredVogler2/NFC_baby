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
    // It may have reached the server: no "no text sent" claim.
    await expect(page.getByText('Kept on this phone — may already be saved')).toBeVisible()
    await expect(page.getByText(/no text sent/)).toHaveCount(0)
    await page.unrouteAll()
    // Scanning again with signal syncs the earlier, deliberately saved entry (Safari keeps its own
    // storage, so this is where it gets the chance); the scan itself adds nothing.
    await page.goto(`/t/${token}`)
    await expect(
      page.getByText(/1 earlier entry from this phone is now in the shared history/),
    ).toBeVisible()
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

  test('slow server: taps while saving send nothing more, and success shows only after the answer', async () => {
    const token = await seedTag(fam, 'POOP')
    await page.goto(`/t/${token}`)
    let posts = 0
    await page.route('**/api/v1/events', async (route) => {
      posts++
      await new Promise((r) => setTimeout(r, 2500))
      await route.continue()
    })
    await page.getByRole('button', { name: 'Save poop diaper' }).click()
    const saving = page.getByRole('button', { name: 'Saving…' })
    await expect(saving).toBeDisabled()
    for (let i = 0; i < 4; i++) await saving.click({ force: true })
    expect(page.url()).not.toMatch(/\/saved\//) // no success before the server has answered
    await expect(page).toHaveURL(/\/saved\//)
    expect(posts).toBe(1)
    expect(countEvents(fam.householdId)).toBe(1)
  })
})
