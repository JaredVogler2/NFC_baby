import { expect, test } from '@playwright/test'
import { addDays, localDateKey, localToUtcCandidates } from '../../lib/time/zoned'
import { BASE_URL, seedFamily, signInContext, sql, type SeededFamily } from './support'

const NY = 'America/New_York'
const json = (data: unknown) => ({ data, headers: { Origin: BASE_URL } })

/** Insert a synthetic event directly (setup only; product code always goes through log_care_event). */
function insertEvent(
  fam: SeededFamily,
  opts: { subtype: string; at: string; notes?: string; by?: string },
) {
  const type = opts.subtype === 'BOTTLE' || opts.subtype === 'NURSING' ? 'FEED' : 'DIAPER'
  const notes = opts.notes ? `'${opts.notes.replace(/'/g, "''")}'` : 'null'
  const details =
    opts.subtype === 'BOTTLE'
      ? `, d as (insert into public.feeding_details (event_id, feed_method, milk_type, amount_ml, amount_entered_value, amount_entered_unit) select id, 'BOTTLE', 'FORMULA', 88.7206, 3, 'oz' from e)`
      : opts.subtype === 'NURSING'
        ? `, d as (insert into public.feeding_details (event_id, feed_method, side) select id, 'NURSING', 'LEFT' from e)`
        : ''
  // One statement = one transaction, so the deferred "FEED needs details" check sees both rows.
  return sql(`with e as (insert into public.care_events (household_id, child_id, event_type, subtype, occurred_at, created_by, source, notes, idempotency_key, request_hash)
    values ('${fam.householdId}', '${fam.childId}', '${type}', '${opts.subtype}', '${opts.at}', '${opts.by ?? fam.owner.id}', 'DASHBOARD', ${notes}, gen_random_uuid(), 'seeded-hash') returning id)${details}
    select id from e`)
}

test.describe('shared timeline between two parents', () => {
  test('A: Mom saves; Dad’s open Home shows it when he returns to the app (focus refresh)', async ({
    browser,
  }) => {
    const fam = await seedFamily()
    const mom = await browser.newContext()
    await signInContext(mom, fam.owner.email)
    const dadCtx = await browser.newContext()
    await signInContext(dadCtx, fam.parent.email)
    const dad = await dadCtx.newPage()
    await dad.goto('/dashboard')
    await expect(dad.getByText('No entries yet')).toBeVisible()

    const res = await mom.request.post(
      `${BASE_URL}/api/v1/events`,
      json({ clientRequestId: crypto.randomUUID(), intent: 'WET', childId: fam.childId }),
    )
    expect(res.status()).toBe(201)
    // iPhone resumes the tab → visibilitychange → refetch.
    await dad.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(dad.getByRole('link', { name: /Wet diaper.*Mom/ })).toBeVisible({
      timeout: 10_000,
    })
    await expect(dad.getByText(/^Updated /)).toBeVisible()
  })

  test('an open screen also catches up on its own within ~20 s (polling, not websockets)', async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const fam = await seedFamily()
    const momCtx = await browser.newContext()
    await signInContext(momCtx, fam.owner.email)
    const dadCtx = await browser.newContext()
    await signInContext(dadCtx, fam.parent.email)
    const dad = await dadCtx.newPage()
    await dad.goto('/history')
    await momCtx.request.post(
      `${BASE_URL}/api/v1/events`,
      json({ clientRequestId: crypto.randomUUID(), intent: 'POOP', childId: fam.childId }),
    )
    await expect(dad.getByRole('link', { name: /Poop diaper.*Mom/ })).toBeVisible({
      timeout: 30_000,
    })
  })
})

test.describe('history', () => {
  let fam: SeededFamily
  test.beforeAll(async () => {
    fam = await seedFamily()
    const today = localDateKey(new Date(), NY)
    const yesterday = addDays(today, -1)
    const at = (d: string, t: string) => localToUtcCandidates(d, t, NY)[0]!.toISOString()
    insertEvent(fam, { subtype: 'WET', at: at(yesterday, '23:50'), notes: '=1+1 leak' })
    insertEvent(fam, { subtype: 'BOTTLE', at: at(yesterday, '22:00') })
    // Entered last, happened earliest that day: must sort by occurrence, not entry.
    insertEvent(fam, { subtype: 'POOP', at: at(yesterday, '06:00') })
    const voided = insertEvent(fam, { subtype: 'BOTH', at: at(yesterday, '12:00') })
    sql(
      `update public.care_events set state = 'VOID', voided_at = now(), voided_by = '${fam.owner.id}' where id = '${voided}'`,
    )
    for (let i = 0; i < 40; i++)
      insertEvent(fam, { subtype: 'NURSING', at: at(addDays(today, -3), '00:30') })
  })

  test('newest occurrence first, grouped by family day, undone hidden by default', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.parent.email)
    const page = await ctx.newPage()
    await page.goto('/history?type=diapers')
    await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible()
    const rows = page.locator('main a[href^="/history/"]')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('11:50 PM')
    await expect(rows.nth(1)).toContainText('6:00 AM')
    await expect(rows.nth(0)).toContainText('=1+1 leak') // rendered as text

    await page.getByRole('link', { name: 'Show undone entries' }).click()
    await expect(page.getByRole('link', { name: /Wet \+ poop.*undone/ })).toBeVisible()
    await page.getByRole('link', { name: 'Feeding' }).click()
    await expect(page.getByRole('link', { name: /Bottle · Formula · 3 oz/ })).toBeVisible()
    await expect(page.locator('main a[href^="/history/"]', { hasText: /diaper/i })).toHaveCount(0)
  })

  test('long history pages with "Load older" and a single-day filter', async ({ browser }) => {
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.parent.email)
    const page = await ctx.newPage()
    await page.goto('/history?type=feeding')
    await expect(page.getByRole('link', { name: /Nursing/ })).toHaveCount(29) // 30 per page incl. the bottle
    await page.getByRole('button', { name: 'Load older entries' }).click()
    await expect(page.getByRole('link', { name: /Nursing/ })).toHaveCount(40)
    await expect(page.getByText('That’s everything.')).toBeVisible()

    const yesterday = addDays(localDateKey(new Date(), NY), -1)
    await page.goto(`/history?day=${yesterday}`)
    await expect(page.getByRole('link', { name: /Nursing/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Bottle/ })).toHaveCount(1)
    await page.getByRole('link', { name: 'Reset filters' }).first().click()
    await expect(page).toHaveURL(/\/history$/)
  })

  test('export: owner/parent download CSV (formula-safe) and JSON; caregiver and viewer cannot', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.owner.email)
    const csv = await ctx.request.get(`${BASE_URL}/api/v1/export?format=csv`)
    expect(csv.status()).toBe(200)
    expect(csv.headers()['content-disposition']).toMatch(
      /attachment; filename="nfc-baby-export-\d{4}-\d{2}-\d{2}\.csv"/,
    )
    expect(csv.headers()['cache-control']).toContain('no-store')
    const text = await csv.text()
    expect(text.split('\r\n')[0]).toContain('event_id,occurred_local,occurred_utc')
    expect(text).toContain("'=1+1 leak")
    expect(text).not.toMatch(/,=1\+1/)
    expect(text).toContain('VOID')
    const jsonRes = await ctx.request.get(`${BASE_URL}/api/v1/export?format=json`)
    const body = (await jsonRes.json()) as { events: unknown[]; timezone: string }
    expect(body.events).toHaveLength(44)
    expect(body.timezone).toBe(NY)

    for (const who of [fam.caregiver, fam.viewer]) {
      const c = await browser.newContext()
      await signInContext(c, who.email)
      expect((await c.request.get(`${BASE_URL}/api/v1/export?format=csv`)).status()).toBe(403)
    }
    const other = await seedFamily()
    const o = await browser.newContext()
    await signInContext(o, other.owner.email)
    const otherJson = (await (
      await o.request.get(`${BASE_URL}/api/v1/export?format=json`)
    ).json()) as { events: unknown[] }
    expect(otherJson.events).toHaveLength(0)
  })
})

test.describe('settings', () => {
  test('per-phone unit + night theme; family time zone changes how times read everywhere', async ({
    browser,
  }) => {
    const fam = await seedFamily()
    const at = localToUtcCandidates(localDateKey(new Date(), NY), '00:05', NY)[0]!.toISOString()
    insertEvent(fam, { subtype: 'BOTTLE', at })
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.owner.email)
    const page = await ctx.newPage()
    await page.goto('/settings/display')
    await page.getByRole('radio', { name: 'mL' }).check({ force: true })
    await page.getByRole('radio', { name: 'Night' }).check({ force: true })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.goto('/history')
    await expect(page.getByRole('link', { name: /Bottle · Formula · 89 mL/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /12:05 AM/ })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.goto('/settings/family')
    await page.getByLabel('Time zone').selectOption('America/Los_Angeles')
    await page.getByRole('button', { name: 'Save family settings' }).click()
    await expect(page.getByText('Saved.').first()).toBeVisible()
    await page.goto('/history')
    await expect(page.getByRole('link', { name: /9:05 PM/ })).toBeVisible()
  })

  test('owner deactivates a caregiver, who immediately loses access', async ({ browser }) => {
    const fam = await seedFamily()
    const ownerCtx = await browser.newContext()
    await signInContext(ownerCtx, fam.owner.email)
    const sitterCtx = await browser.newContext()
    await signInContext(sitterCtx, fam.caregiver.email)
    const sitter = await sitterCtx.newPage()
    await sitter.goto('/dashboard')
    await expect(sitter.getByRole('heading', { name: fam.childName })).toBeVisible()

    const owner = await ownerCtx.newPage()
    await owner.goto('/settings/members')
    const sitterRow = owner.getByRole('listitem').filter({ hasText: 'Sitter' })
    await sitterRow.getByRole('button', { name: 'Deactivate' }).click()
    await owner.getByRole('button', { name: 'Confirm' }).click()
    await expect(sitterRow.getByText('deactivated')).toBeVisible()

    await sitter.goto('/dashboard')
    await expect(sitter).toHaveURL(/\/setup$/)
    const api = await sitterCtx.request.get(`${BASE_URL}/api/v1/events`)
    expect(api.status()).toBe(403)
  })

  test('non-owners cannot change family settings or members', async ({ browser }) => {
    const fam = await seedFamily()
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.parent.email)
    const page = await ctx.newPage()
    await page.goto('/settings/family')
    await expect(page.getByText('Only the family owner can change these.')).toBeVisible()
    await page.goto('/settings/members')
    await expect(page).toHaveURL(/\/settings$/)
    const res = await ctx.request.patch(
      `${BASE_URL}/api/v1/household`,
      json({ displayName: 'x', timezone: 'UTC', defaultFeedMethod: null, defaultVolumeUnit: 'ml' }),
    )
    expect(res.status()).toBe(403)
    const role = await ctx.request.patch(
      `${BASE_URL}/api/v1/members/${fam.parent.id}`,
      json({ role: 'owner' }),
    )
    expect(role.status()).toBe(403)
  })
})
