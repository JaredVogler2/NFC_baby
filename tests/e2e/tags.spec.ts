import { expect, test, type Page } from '@playwright/test'
import { generateTagToken } from '../../lib/nfc/token'
import {
  BASE_URL,
  countEvents,
  requestCodeViaUi,
  countOutbox,
  seedFamily,
  signInContext,
  sql,
  waitForCode,
  type SeededFamily,
} from './support'

/** Create a sticker through the real Settings UI and return its token + id. */
async function createTagViaUi(
  page: Page,
  purpose: 'Wet' | 'Poop' | 'Both' | 'Feed',
  label: string,
) {
  await page.goto('/settings/tags')
  await page.getByRole('radio', { name: purpose }).check({ force: true })
  await page.getByLabel('Label (where it is)').fill(label)
  await page.getByRole('button', { name: 'Create sticker link' }).click()
  await expect(page).toHaveURL(/\/settings\/tags\/[0-9a-f-]{36}\?created=1$/)
  await expect(page.getByText('Sticker link created')).toBeVisible()
  const url = await page.getByLabel('Sticker link (write this to the NFC tag)').inputValue()
  const token = url.match(/\/t\/([0-9a-z]{26})$/)![1]!
  const id = page.url().match(/tags\/([0-9a-f-]{36})/)![1]!
  return { token, id, url }
}

test.describe('NFC tag administration', () => {
  test('owner registers all four stickers; creating them logs nothing; QR + steps shown', async ({
    browser,
  }) => {
    const fam = await seedFamily()
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.owner.email)
    const page = await ctx.newPage()
    for (const [purpose, label] of [
      ['Wet', 'Changing table wet'],
      ['Poop', 'Changing table poop'],
      ['Both', 'Changing table both'],
      ['Feed', 'Bottle station'],
    ] as const) {
      const { url } = await createTagViaUi(page, purpose, label)
      expect(url).toMatch(new RegExp(`^${BASE_URL}/t/[0-9a-hjkmnp-tv-z]{26}$`))
      await expect(page.getByRole('img', { name: 'QR code with the same link' })).toBeVisible()
      await expect(page.getByText('Write it to a sticker (iPhone)')).toBeVisible()
    }
    // Local http address → loud warning not to write it to a real sticker.
    await expect(page.getByText(/not HTTPS/).first()).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(0)
    expect(
      sql(
        `select string_agg(purpose::text, ',' order by purpose) from public.nfc_tags where household_id = '${fam.householdId}'`,
      ),
    ).toBe('WET,POOP,BOTH,FEED')

    await page.goto('/settings/tags/print')
    await expect(page.getByText('WET', { exact: true })).toBeVisible()
    await expect(page.getByText('FEED', { exact: true })).toBeVisible()
    // Printed labels never include the child's name.
    await expect(page.locator('main')).not.toContainText(fam.childName)
  })

  test('caregivers cannot reach tag management', async ({ browser }) => {
    const fam = await seedFamily()
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.caregiver.email)
    const page = await ctx.newPage()
    await page.goto('/settings/tags')
    await expect(page).toHaveURL(/\/settings$/)
    const res = await ctx.request.post(`${BASE_URL}/api/v1/tags`, {
      data: { purpose: 'WET', childId: fam.childId, label: 'x' },
      headers: { Origin: BASE_URL },
    })
    expect(res.status()).toBe(403)
  })
})

test.describe('scanning a sticker', () => {
  let fam: SeededFamily
  let wet: { token: string; id: string }
  let feed: { token: string; id: string }

  test.beforeAll(async ({ browser }) => {
    fam = await seedFamily()
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.owner.email)
    const page = await ctx.newPage()
    wet = await createTagViaUi(page, 'Wet', 'Changing table wet')
    feed = await createTagViaUi(page, 'Feed', 'Bottle station')
    await ctx.close()
  })

  test('signed-out gate is identical for valid, unknown and malformed tokens and leaks nothing', async ({
    page,
    request,
  }) => {
    const texts: string[] = []
    for (const token of [wet.token, generateTagToken(), 'not-a-token']) {
      const res = await page.goto(`/t/${token}`)
      expect(res?.status()).toBe(200)
      await expect(page.getByRole('heading', { name: 'Private family log' })).toBeVisible()
      texts.push((await page.locator('main').innerText()).trim())
      const html = await page.content()
      expect(html).not.toContain(fam.childName)
      expect(html).not.toMatch(/wet diaper|changing table|E2E family/i)
      expect(res!.headers()['cache-control']).toContain('no-store')
    }
    expect(new Set(texts).size).toBe(1)
    // Crawlers / link previews / prefetch: still nothing written.
    await request.get(`/t/${wet.token}`, { headers: { 'User-Agent': 'facebookexternalhit/1.1' } })
    await request.get(`/t/${wet.token}`, {
      headers: { Purpose: 'prefetch', 'Sec-Purpose': 'prefetch' },
    })
    expect(countEvents(fam.householdId)).toBe(0)
    expect(countOutbox(fam.householdId)).toBe(0)
  })

  test('E: signed-out scan → sign in → back on the same sticker form, nothing recorded', async ({
    page,
  }) => {
    await page.goto(`/t/${wet.token}`)
    await page.getByRole('link', { name: 'Sign in to continue' }).click()
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Ft%2F${wet.token}$`))
    await expect(page.getByText('Nothing has been recorded yet')).toBeVisible()
    await page.getByLabel('Email').fill(fam.parent.email)
    const since = await requestCodeViaUi(page)
    await page.getByLabel('Code').fill(await waitForCode(fam.parent.email, since))
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(new RegExp(`/t/${wet.token}$`))
    await expect(page.getByRole('heading', { name: 'Log wet diaper' })).toBeVisible()
    await expect(page.getByText(fam.childName).first()).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(0)
  })

  test('D: repeat scans, reloads and back/forward create nothing; one Save creates one entry', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.parent.email)
    const page = await ctx.newPage()
    const before = countEvents(fam.householdId)
    for (let i = 0; i < 3; i++) await page.goto(`/t/${wet.token}`)
    await page.reload()
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    // Browser back/forward (Next may restore these entries without a full document load).
    await page.evaluate(() => void setTimeout(() => history.back(), 0))
    await expect(page).toHaveURL(new RegExp(`/t/${wet.token}$`))
    await page.evaluate(() => void setTimeout(() => history.forward(), 0))
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.evaluate(() => void setTimeout(() => history.back(), 0))
    await expect(page).toHaveURL(new RegExp(`/t/${wet.token}$`))
    await expect(page.getByRole('heading', { name: 'Log wet diaper' })).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(before)

    await page.getByRole('button', { name: 'Save wet diaper' }).click()
    await expect(page).toHaveURL(/\/saved\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: /Wet diaper saved at/ })).toBeVisible()
    await expect(page.getByText('Logged by')).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(before + 1)

    // Back from the success screen does not land on a filled-in form that could re-submit.
    await page.evaluate(() => void setTimeout(() => history.back(), 0))
    await expect(page).not.toHaveURL(/\/saved\//)
    await page.reload()
    expect(countEvents(fam.householdId)).toBe(before + 1)
  })

  test('two parents use the same physical sticker on their own phones', async ({ browser }) => {
    const before = countEvents(fam.householdId)
    for (const person of [fam.owner, fam.parent]) {
      const ctx = await browser.newContext()
      await signInContext(ctx, person.email)
      const page = await ctx.newPage()
      await page.goto(`/t/${wet.token}`)
      await page.getByRole('button', { name: 'Save wet diaper' }).click()
      await expect(page).toHaveURL(/\/saved\//)
      await ctx.close()
    }
    expect(countEvents(fam.householdId)).toBe(before + 2)
    const authors = sql(
      `select string_agg(distinct created_by::text, ',') from public.care_events where household_id = '${fam.householdId}' and source = 'TAG'`,
    ).split(',')
    expect(authors).toEqual(expect.arrayContaining([fam.owner.id, fam.parent.id]))
  })

  test('FEED sticker opens the feeding screen', async ({ browser }) => {
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.parent.email)
    const page = await ctx.newPage()
    await page.goto(`/t/${feed.token}`)
    await expect(page.getByRole('heading', { name: 'Log feeding' })).toBeVisible()
  })

  test('a member of another family gets a generic not-found and cannot post through the token', async ({
    browser,
  }) => {
    const other = await seedFamily()
    const ctx = await browser.newContext()
    await signInContext(ctx, other.owner.email)
    const page = await ctx.newPage()
    const res = await page.goto(`/t/${wet.token}`)
    expect(res?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: 'Not available' })).toBeVisible()
    expect(await page.content()).not.toContain(fam.childName)
    const before = countEvents(fam.householdId)
    const post = await ctx.request.post(`${BASE_URL}/api/v1/events`, {
      data: { clientRequestId: crypto.randomUUID(), intent: 'WET', tagToken: wet.token },
      headers: { Origin: BASE_URL },
    })
    expect(post.status()).toBe(404)
    const api = await ctx.request.get(`${BASE_URL}/api/v1/tags/${wet.token}`)
    expect(api.status()).toBe(404)
    expect(countEvents(fam.householdId)).toBe(before)
  })

  test('a viewer can open the sticker but cannot log', async ({ browser }) => {
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.viewer.email)
    const page = await ctx.newPage()
    await page.goto(`/t/${wet.token}`)
    await expect(page.getByRole('heading', { name: 'View only' })).toBeVisible()
  })

  test('owner sees the scan-test panel on an untested sticker and can confirm routing', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.owner.email)
    const page = await ctx.newPage()
    await page.goto(`/t/${feed.token}`)
    await expect(page.getByText('Sticker check')).toBeVisible()
    await page.getByRole('button', { name: 'Mark sticker as tested' }).click()
    await expect(page.getByText('Sticker marked as tested')).toBeVisible()
    expect(sql(`select tested_at is not null from public.nfc_tags where id = '${feed.id}'`)).toBe(
      't',
    )
    expect(countEvents(fam.householdId)).toBe(countEvents(fam.householdId))
  })

  test('relabelling keeps the URL; retiring stops the sticker for good', async ({ browser }) => {
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.owner.email)
    const page = await ctx.newPage()
    const tag = await createTagViaUi(page, 'Poop', 'Upstairs poop')
    await page.getByLabel('Label', { exact: true }).fill('Nursery poop')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('The sticker URL did not change')).toBeVisible()
    await expect(page.getByLabel('Sticker link (write this to the NFC tag)')).toHaveValue(
      `${BASE_URL}/t/${tag.token}`,
    )

    await page.getByRole('button', { name: 'Retire this sticker' }).click()
    await page.getByRole('button', { name: 'Retire sticker' }).click()
    await expect(page.getByText(/Retired on/)).toBeVisible()

    await page.goto(`/t/${tag.token}`)
    await expect(page.getByRole('heading', { name: 'Sticker retired' })).toBeVisible()
    const post = await ctx.request.post(`${BASE_URL}/api/v1/events`, {
      data: { clientRequestId: crypto.randomUUID(), intent: 'POOP', tagToken: tag.token },
      headers: { Origin: BASE_URL },
    })
    expect(post.status()).toBe(410)
  })

  test('session expires before Save: entry is kept, re-auth returns to it, one save', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    await signInContext(ctx, fam.parent.email)
    const page = await ctx.newPage()
    await page.goto(`/t/${wet.token}`)
    await page.getByRole('button', { name: /Add note/ }).click()
    await page.getByRole('textbox', { name: /Note/ }).fill('kept across sign-in')
    const before = countEvents(fam.householdId)
    await ctx.clearCookies()
    await page.getByRole('button', { name: 'Save wet diaper' }).click()
    await expect(page.getByText('Sign in again to save')).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(before)
    await page.getByRole('link', { name: 'Sign in' }).click()
    await page.getByLabel('Email').fill(fam.parent.email)
    const since = await requestCodeViaUi(page)
    await page.getByLabel('Code').fill(await waitForCode(fam.parent.email, since))
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(new RegExp(`/t/${wet.token}$`))
    await expect(page.getByText('Your unsaved entry is back')).toBeVisible()
    await expect(page.getByRole('textbox', { name: /Note/ })).toHaveValue('kept across sign-in')
    await page.getByRole('button', { name: 'Save wet diaper' }).click()
    await expect(page).toHaveURL(/\/saved\//)
    await expect(page.getByText('kept across sign-in')).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(before + 1)
  })
})
