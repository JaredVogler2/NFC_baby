import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { generateTagToken } from '../../lib/nfc/token'
import { addDays, localDateKey, localToUtcCandidates } from '../../lib/time/zoned'
import {
  BASE_URL,
  admin,
  countEvents,
  seedFamily,
  signInContext,
  sql,
  type SeededFamily,
} from './support'

const NY = 'America/New_York'

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

async function as(browserContext: () => Promise<BrowserContext>, email: string): Promise<Page> {
  const ctx = await browserContext()
  await signInContext(ctx, email)
  return ctx.newPage()
}

function latestEvent(householdId: string) {
  const row = sql(
    `select subtype || '|' || to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '|' || coalesce(notes,'') || '|' || source from public.care_events where household_id = '${householdId}' order by created_at desc limit 1`,
  )
  const [subtype, occurred, notes, source] = row.split('|')
  return { subtype, occurredAt: Date.parse(`${occurred}Z`), notes, source }
}

test.describe('diaper logging', () => {
  let fam: SeededFamily
  const tokens: Record<string, string> = {}

  test.beforeAll(async () => {
    fam = await seedFamily()
    for (const p of ['WET', 'POOP', 'BOTH'] as const) tokens[p] = await seedTag(fam, p)
  })

  test('each sticker stores its own type at "now" with one explicit tap; BOTH is one row', async ({
    browser,
  }) => {
    const page = await as(() => browser.newContext(), fam.parent.email)
    for (const [purpose, button, heading] of [
      ['WET', 'Save wet diaper', /Wet diaper saved at/],
      ['POOP', 'Save poop diaper', /Poop diaper saved at/],
      ['BOTH', 'Save wet + poop', /Wet \+ poop saved at/],
    ] as const) {
      const before = countEvents(fam.householdId)
      await page.goto(`/t/${tokens[purpose]}`)
      const t0 = Date.now()
      await page.getByRole('button', { name: button }).click() // the one and only tap
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      expect(countEvents(fam.householdId)).toBe(before + 1)
      const e = latestEvent(fam.householdId)
      expect(e.subtype).toBe(purpose)
      expect(e.source).toBe('TAG')
      expect(Math.abs(e.occurredAt - t0)).toBeLessThan(60_000)
    }
    const dash = await page.request.get(`${BASE_URL}/api/v1/dashboard`)
    const { dashboard } = (await dash.json()) as { dashboard: { today: Record<string, number> } }
    // WET + POOP + BOTH: 3 changes; BOTH counts toward wet and poop without duplicating rows.
    const nyHour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: NY, hour: 'numeric', hourCycle: 'h23' }).format(
        new Date(),
      ),
    )
    if (nyHour >= 1) expect(dashboard.today).toMatchObject({ diaperChanges: 3, wet: 2, poop: 2 })
  })

  test('notes are optional; 500 characters save, 501 are refused with a clear message', async ({
    browser,
  }) => {
    const page = await as(() => browser.newContext(), fam.parent.email)
    await page.goto(`/t/${tokens.WET}`)
    await page.getByRole('button', { name: /Add note/ }).click()
    const note = page.getByRole('textbox', { name: /Note/ })
    await note.fill('x'.repeat(501))
    await expect(page.getByText('1 characters too long')).toBeVisible()
    const before = countEvents(fam.householdId)
    await page.getByRole('button', { name: 'Save wet diaper' }).click()
    await expect(page.getByText(/at most 500 characters/)).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(before)
    await note.fill('y'.repeat(500))
    await page.getByRole('button', { name: 'Save wet diaper' }).click()
    await expect(page).toHaveURL(/\/saved\//)
    expect(latestEvent(fam.householdId).notes).toHaveLength(500)
  })

  test('rapid double tap creates exactly one entry', async ({ browser }) => {
    const page = await as(() => browser.newContext(), fam.owner.email)
    await page.goto(`/t/${tokens.POOP}`)
    const before = countEvents(fam.householdId)
    await page.getByRole('button', { name: 'Save poop diaper' }).dblclick()
    await expect(page).toHaveURL(/\/saved\//)
    expect(countEvents(fam.householdId)).toBe(before + 1)
  })

  test('G: response lost after the server committed → "can’t confirm" → found, no duplicate', async ({
    browser,
  }) => {
    const page = await as(() => browser.newContext(), fam.parent.email)
    await page.goto(`/t/${tokens.WET}`)
    const before = countEvents(fam.householdId)
    let intercepted = 0
    await page.route('**/api/v1/events', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      intercepted++
      await route.fetch() // the server really saves it…
      await route.abort('connectionreset') // …but the phone never hears back
    })
    await page.getByRole('button', { name: 'Save wet diaper' }).click()
    await expect(page).toHaveURL(/\/saved\//)
    expect(intercepted).toBe(1)
    expect(countEvents(fam.householdId)).toBe(before + 1)
  })

  test('two parents log different entries at the same time; both remain', async ({ browser }) => {
    const [mom, dad] = await Promise.all([
      as(() => browser.newContext(), fam.owner.email),
      as(() => browser.newContext(), fam.parent.email),
    ])
    await Promise.all([mom.goto(`/t/${tokens.WET}`), dad.goto(`/t/${tokens.POOP}`)])
    const before = countEvents(fam.householdId)
    await Promise.all([
      mom.getByRole('button', { name: 'Save wet diaper' }).click(),
      dad.getByRole('button', { name: 'Save poop diaper' }).click(),
    ])
    await Promise.all([expect(mom).toHaveURL(/\/saved\//), expect(dad).toHaveURL(/\/saved\//)])
    expect(countEvents(fam.householdId)).toBe(before + 2)
  })

  test('backdating: "15 min ago" preset, and a time before midnight lands on the previous family day', async ({
    browser,
  }) => {
    const page = await as(() => browser.newContext(), fam.parent.email)
    await page.goto(`/t/${tokens.BOTH}`)
    await page.getByRole('button', { name: 'Change time' }).click()
    await page.getByRole('button', { name: '15 min ago' }).click()
    const t0 = Date.now()
    await page.getByRole('button', { name: 'Save wet + poop' }).click()
    await expect(page).toHaveURL(/\/saved\//)
    const e = latestEvent(fam.householdId)
    expect(Math.abs(e.occurredAt - (t0 - 15 * 60_000))).toBeLessThan(90_000)
    await expect(page.getByText(/Recorded/)).toBeVisible()

    // Yesterday 11:50 PM family time (crosses midnight; UTC is already the next day).
    const yesterday = addDays(localDateKey(new Date(), NY), -1)
    await page.goto(`/t/${tokens.BOTH}`)
    await page.getByRole('button', { name: 'Change time' }).click()
    await page.getByLabel('Date', { exact: true }).fill(yesterday)
    await page.getByLabel('Time', { exact: true }).fill('23:50')
    await page.getByRole('button', { name: 'Save wet + poop' }).click()
    await expect(page).toHaveURL(/\/saved\//)
    const expected = localToUtcCandidates(yesterday, '23:50', NY)[0]!.getTime()
    expect(latestEvent(fam.householdId).occurredAt).toBe(expected)
    await expect(page.getByRole('heading', { name: /saved at 11:50 PM/ })).toBeVisible()
  })

  test('future times are refused before anything is sent', async ({ browser }) => {
    const page = await as(() => browser.newContext(), fam.parent.email)
    await page.goto(`/t/${tokens.WET}`)
    await page.getByRole('button', { name: 'Change time' }).click()
    const tomorrow = addDays(localDateKey(new Date(), NY), 1)
    await page.getByLabel('Date', { exact: true }).fill(tomorrow)
    await page.getByLabel('Time', { exact: true }).fill('10:00')
    await expect(page.getByText('That time is in the future.').first()).toBeVisible()
    const before = countEvents(fam.householdId)
    await page.getByRole('button', { name: 'Save wet diaper' }).click()
    expect(countEvents(fam.householdId)).toBe(before)
  })

  test('Home quick actions log the same way (source: Home)', async ({ browser }) => {
    const page = await as(() => browser.newContext(), fam.owner.email)
    await page.goto('/dashboard')
    await page.getByRole('link', { name: 'Wet', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Log wet diaper' })).toBeVisible()
    await page.getByRole('button', { name: 'Save wet diaper' }).click()
    await expect(page).toHaveURL(/\/saved\//)
    expect(latestEvent(fam.householdId).source).toBe('DASHBOARD')
  })
})

test.describe('corrections', () => {
  test('parent corrects type + note; audit shows who changed what; caregiver cannot edit others', async ({
    browser,
  }) => {
    const fam = await seedFamily()
    const token = await seedTag(fam, 'WET')
    const mom = await as(() => browser.newContext(), fam.owner.email)
    await mom.goto(`/t/${token}`)
    await mom.getByRole('button', { name: 'Save wet diaper' }).click()
    await expect(mom).toHaveURL(/\/saved\//)
    const eventId = mom.url().split('/saved/')[1]!

    const dad = await as(() => browser.newContext(), fam.parent.email)
    await dad.goto(`/history/${eventId}`)
    await dad.getByRole('button', { name: 'Edit' }).click()
    await dad.getByRole('radio', { name: 'Wet + poop' }).check({ force: true })
    await dad.getByRole('button', { name: /Add note/ }).click()
    await dad.getByRole('textbox', { name: /Note/ }).fill('blowout')
    await dad.getByRole('button', { name: 'Save changes' }).click()
    await expect(dad.getByText('Changes saved')).toBeVisible()
    await dad.reload()
    await expect(dad.getByRole('heading', { name: 'Wet + poop' })).toBeVisible()
    await expect(dad.getByText('Changed by Dad')).toBeVisible()
    await expect(dad.getByText('Type: Wet diaper → Wet + poop')).toBeVisible()
    await expect(dad.getByText('Note added: “blowout”')).toBeVisible()
    expect(sql(`select created_by::text from public.care_events where id = '${eventId}'`)).toBe(
      fam.owner.id,
    )

    const sitter = await as(() => browser.newContext(), fam.caregiver.email)
    await sitter.goto(`/history/${eventId}`)
    await expect(sitter.getByRole('button', { name: 'Edit' })).toHaveCount(0)
    await expect(sitter.getByText('History of changes')).toHaveCount(0)
    const res = await sitter.request.patch(`${BASE_URL}/api/v1/events/${eventId}`, {
      data: { expectedRevision: 2, patch: { notes: 'sitter edit' } },
      headers: { Origin: BASE_URL },
    })
    expect(res.status()).toBe(403)
  })

  test('two parents editing at once: the second save is refused, nothing is overwritten', async ({
    browser,
  }) => {
    const fam = await seedFamily()
    const token = await seedTag(fam, 'POOP')
    const mom = await as(() => browser.newContext(), fam.owner.email)
    await mom.goto(`/t/${token}`)
    await mom.getByRole('button', { name: 'Save poop diaper' }).click()
    await expect(mom).toHaveURL(/\/saved\//)
    const eventId = mom.url().split('/saved/')[1]!
    const dad = await as(() => browser.newContext(), fam.parent.email)
    for (const p of [mom, dad]) {
      await p.goto(`/history/${eventId}`)
      await p.getByRole('button', { name: 'Edit' }).click()
      await p.getByRole('button', { name: /Add note/ }).click()
    }
    await mom.getByRole('textbox', { name: /Note/ }).fill('from mom')
    await mom.getByRole('button', { name: 'Save changes' }).click()
    await expect(mom.getByText('Changes saved')).toBeVisible()
    await dad.getByRole('textbox', { name: /Note/ }).fill('from dad')
    await dad.getByRole('button', { name: 'Save changes' }).click()
    await expect(dad.getByText('Someone else changed this entry')).toBeVisible()
    expect(sql(`select notes from public.care_events where id = '${eventId}'`)).toBe('from mom')
  })

  test('undo removes the entry from Home and totals; the audit keeps it', async ({ browser }) => {
    const fam = await seedFamily()
    const token = await seedTag(fam, 'WET')
    const page = await as(() => browser.newContext(), fam.parent.email)
    await page.goto(`/t/${token}`)
    await page.getByRole('button', { name: 'Save wet diaper' }).click()
    await expect(page).toHaveURL(/\/saved\//)
    await page.getByRole('button', { name: 'Undo this entry' }).click()
    await page.getByRole('button', { name: 'Undo entry' }).click()
    await expect(page.getByText('Entry undone')).toBeVisible()
    await page.goto('/dashboard')
    await expect(page.getByText('No entries yet')).toBeVisible()
    await expect(page.getByText('No diaper yet')).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(1)
    expect(
      sql(
        `select string_agg(action::text, ',' order by id) from public.care_event_audit where household_id = '${fam.householdId}'`,
      ),
    ).toBe('CREATE,VOID')
  })
})
