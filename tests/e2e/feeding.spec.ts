import { expect, test, type Page } from '@playwright/test'
import { generateTagToken } from '../../lib/nfc/token'
import { addDays, localDateKey, localToUtcCandidates, zonedParts } from '../../lib/time/zoned'
import {
  admin,
  countEvents,
  countOutbox,
  seedFamily,
  signInContext,
  sql,
  type SeededFamily,
} from './support'

const NY = 'America/New_York'

async function feedTag(fam: SeededFamily) {
  const token = generateTagToken()
  const { error } = await admin.from('nfc_tags').insert({
    token,
    household_id: fam.householdId,
    child_id: fam.childId,
    purpose: 'FEED',
    label: 'Bottle station',
    created_by: fam.owner.id,
    tested_at: new Date().toISOString(),
  })
  if (error) throw error
  return token
}

function lastFeed(householdId: string) {
  const row = sql(`
    select e.subtype || '|' || coalesce(d.milk_type::text,'') || '|' || coalesce(d.amount_ml::text,'') || '|' ||
           d.amount_unknown || '|' || coalesce(d.amount_entered_value::text,'') || '|' || coalesce(d.amount_entered_unit::text,'') || '|' ||
           coalesce(d.side::text,'') || '|' || coalesce(d.duration_seconds::text,'') || '|' || extract(epoch from e.occurred_at)::bigint
    from public.care_events e join public.feeding_details d on d.event_id = e.id
    where e.household_id = '${householdId}' order by e.created_at desc limit 1`)
  const [subtype, milk, ml, unknown, entered, unit, side, duration, epoch] = row.split('|')
  return {
    subtype,
    milk,
    ml,
    unknown: unknown === 'true',
    entered,
    unit,
    side,
    duration,
    occurredAt: Number(epoch) * 1000,
  }
}

let fam: SeededFamily
let token: string
let page: Page

test.beforeAll(async ({ browser }) => {
  fam = await seedFamily()
  token = await feedTag(fam)
  const ctx = await browser.newContext()
  await signInContext(ctx, fam.parent.email)
  page = await ctx.newPage()
})

test.describe.configure({ mode: 'serial' })

test('C: bottle, breastmilk, 3.5 oz at 2:10 AM is stored canonically and shown in the family zone', async () => {
  await page.goto(`/t/${token}`)
  await expect(page.getByRole('heading', { name: 'Log feeding' })).toBeVisible()
  await page.getByRole('radio', { name: 'Bottle' }).check({ force: true })
  await page.getByRole('radio', { name: 'Breastmilk' }).check({ force: true })
  await page.getByLabel(/Custom amount/).fill('3.5')
  await expect(page.getByRole('button', { name: 'Save bottle · 3.5 oz' })).toBeVisible()
  // 2:10 AM today if that has passed, else yesterday (both within 24 h).
  const nowNy = zonedParts(new Date(), NY)
  const today = localDateKey(new Date(), NY)
  const day = nowNy.hour * 60 + nowNy.minute > 2 * 60 + 15 ? today : addDays(today, -1)
  await page.getByRole('button', { name: 'Change time' }).click()
  await page.getByLabel('Date', { exact: true }).fill(day)
  await page.getByLabel('Time', { exact: true }).fill('02:10')
  await page.getByRole('button', { name: 'Save bottle · 3.5 oz' }).click()
  await expect(
    page.getByRole('heading', { name: 'Bottle · Breastmilk · 3.5 oz saved at 2:10 AM' }),
  ).toBeVisible()
  const f = lastFeed(fam.householdId)
  expect(f).toMatchObject({
    subtype: 'BOTTLE',
    milk: 'BREASTMILK',
    ml: '103.5074',
    unknown: false,
    entered: '3.5000',
    unit: 'oz',
  })
  expect(f.occurredAt).toBe(localToUtcCandidates(day, '02:10', NY)[0]!.getTime())
})

test('the last amount is offered as a suggestion (not pre-submitted) and method is preselected visibly', async () => {
  await page.goto(`/t/${token}`)
  await expect(page.getByRole('radio', { name: 'Bottle' })).toBeChecked()
  await expect(page.getByText(/Selected because the last feeding was a bottle/)).toBeVisible()
  const suggestion = page.getByRole('button', { name: 'Last: 3.5 oz' })
  await expect(suggestion).toBeVisible()
  await expect(page.getByLabel(/Custom amount/)).toHaveValue('')
  await suggestion.click()
  await expect(page.getByLabel(/Custom amount/)).toHaveValue('3.5')
})

test('120 mL via the unit toggle; switching units converts what was typed', async () => {
  await page.goto(`/t/${token}`)
  await page.getByRole('radio', { name: 'Formula' }).check({ force: true })
  await page.getByLabel(/Custom amount/).fill('3.5')
  await page.getByRole('radio', { name: 'mL' }).check({ force: true })
  await expect(page.getByLabel(/Custom amount/)).toHaveValue('104')
  await page.getByRole('button', { name: '120 millilitres' }).click()
  await page.getByRole('button', { name: 'Save bottle · 120 mL' }).click()
  await expect(page).toHaveURL(/\/saved\//)
  expect(lastFeed(fam.householdId)).toMatchObject({
    ml: '120.0000',
    entered: '120.0000',
    unit: 'ml',
    milk: 'FORMULA',
  })
  // Family default unit is oz: shown converted, from the same stored value.
  await expect(page.getByRole('heading', { name: /4\.1 oz saved at/ })).toBeVisible()
})

test('missing, malformed and implausible amounts are refused; nothing is saved', async () => {
  await page.goto(`/t/${token}`)
  const before = countEvents(fam.householdId)
  await page.getByRole('radio', { name: 'oz' }).check({ force: true })
  await page.getByRole('button', { name: 'Save bottle' }).click()
  await expect(page.getByText(/Choose an amount or tick/)).toBeVisible()
  await page.getByLabel(/Custom amount/).fill('3.5.5')
  await page.getByRole('button', { name: /Save bottle/ }).click()
  await expect(page.getByText(/Enter an amount like 3.5/)).toBeVisible()
  await page.getByLabel(/Custom amount/).fill('20')
  await page.getByRole('button', { name: /Save bottle/ }).click()
  await expect(page.getByText(/larger than this app can record/)).toBeVisible()
  expect(countEvents(fam.householdId)).toBe(before)
})

test('"Amount not measured" is stored as unknown, never zero', async () => {
  await page.goto(`/t/${token}`)
  await page.getByRole('radio', { name: 'Unknown' }).check({ force: true })
  await page.getByLabel('Amount not measured').check()
  await expect(
    page.getByText('This bottle will be saved with “amount not measured”.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save bottle · amount not measured' }).click()
  await expect(
    page.getByRole('heading', { name: /Bottle · amount not measured saved at/ }),
  ).toBeVisible()
  expect(lastFeed(fam.householdId)).toMatchObject({ ml: '', unknown: true, entered: '' })
})

test('nursing: side + duration, no fabricated volume; and with no details at all', async () => {
  await page.goto(`/t/${token}`)
  await page.getByRole('radio', { name: 'Nursing' }).check({ force: true })
  await page.getByRole('radio', { name: 'Left' }).check({ force: true })
  await page.getByLabel('Minutes', { exact: true }).fill('12')
  await page.getByRole('button', { name: 'Save nursing' }).click()
  await expect(
    page.getByRole('heading', { name: /Nursing · Left · 12 min saved at/ }),
  ).toBeVisible()
  expect(lastFeed(fam.householdId)).toMatchObject({
    subtype: 'NURSING',
    side: 'LEFT',
    duration: '720',
    ml: '',
    milk: '',
  })

  await page.goto(`/t/${token}`)
  await expect(page.getByRole('radio', { name: 'Nursing' })).toBeChecked()
  await page.getByRole('button', { name: 'Save nursing' }).click()
  await expect(page.getByRole('heading', { name: /^Nursing saved at/ })).toBeVisible()
  expect(lastFeed(fam.householdId)).toMatchObject({ side: 'UNKNOWN', duration: '' })
})

test('"Repeat last feed" pre-fills visibly and still needs an explicit Save', async () => {
  await page.goto('/dashboard')
  const before = countEvents(fam.householdId)
  await page.getByRole('link', { name: 'Repeat last feed' }).click()
  await expect(page.getByText('Filled in from the last feeding')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Nursing' })).toBeChecked()
  expect(countEvents(fam.householdId)).toBe(before)
  await page.getByRole('button', { name: 'Save nursing' }).click()
  await expect(page).toHaveURL(/\/saved\//)
  expect(countEvents(fam.householdId)).toBe(before + 1)
})

test('H: editing the amount after a text was sent corrects history, warns, and sends nothing new', async () => {
  // Simulate a provider-accepted text for a new bottle entry.
  await admin
    .from('households')
    .update({ notification_mode: 'AUTOMATIC' })
    .eq('id', fam.householdId)
  await page.goto(`/t/${token}`)
  await page.getByRole('radio', { name: 'Bottle' }).check({ force: true })
  await page.getByRole('radio', { name: 'Formula' }).check({ force: true })
  await page.getByRole('radio', { name: 'oz' }).check({ force: true })
  await page.getByRole('button', { name: '3 ounces' }).click()
  await page.getByRole('button', { name: 'Save bottle · 3 oz' }).click()
  await expect(page).toHaveURL(/\/saved\//)
  const eventId = page.url().split('/saved/')[1]!
  sql(`insert into public.notification_outbox (household_id, event_id, user_id, state, provider, provider_message_id)
       values ('${fam.householdId}', '${eventId}', '${fam.owner.id}', 'SENT_TO_PROVIDER', 'mock', 'SM-test-${eventId.slice(0, 8)}')`)
  const outboxBefore = countOutbox(fam.householdId)

  await page.goto(`/history/${eventId}`)
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByText('A text was already sent for this entry')).toBeVisible()
  await page.getByLabel(/Custom amount/).fill('3.5')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Changes saved')).toBeVisible()
  await expect(page.getByText(/texts can’t be corrected or recalled/)).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Bottle · Formula · 3.5 oz' })).toBeVisible()
  await expect(page.getByText('Amount: 3 oz → 3.5 oz')).toBeVisible()
  expect(countOutbox(fam.householdId)).toBe(outboxBefore)
  await admin.from('households').update({ notification_mode: 'OFF' }).eq('id', fam.householdId)
})
