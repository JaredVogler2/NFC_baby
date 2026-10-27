import { existsSync, readFileSync, rmSync } from 'node:fs'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { encryptWithKey, hmacWithKey } from '../../lib/crypto/contact-crypto'
import { twilioSignature } from '../../lib/notifications/twilio-signature'
import {
  BASE_URL,
  admin,
  countOutbox,
  seedFamily,
  signInContext,
  sql,
  type SeededFamily,
} from './support'

const LOG = `${process.cwd()}/test-results/e2e-mock-sms.jsonl`
const TOKEN = 'e2e-test-auth-token-not-real'
const CRON = process.env.CRON_SECRET!

type Sent = { toLast4: string; body: string; outcome: string; messageId: string | null }
const sent = (): Sent[] =>
  existsSync(LOG)
    ? readFileSync(LOG, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : []
const sentTo = (last4: string) => sent().filter((s) => s.toLast4 === last4)

async function pageFor(
  browser: { newContext: () => Promise<BrowserContext> },
  email: string,
): Promise<Page> {
  const ctx = await browser.newContext()
  await signInContext(ctx, email)
  return ctx.newPage()
}

async function waitForSentCode(last4: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const msg = sentTo(last4)
      .reverse()
      .find((s) => s.body.includes('verification code'))
    if (msg) return msg.body.match(/(\d{6})/)![1]!
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`no verification text to ${last4}`)
}

/** A parent adds their number, agrees, receives a code by (mock) text and verifies. */
async function verifyOwnNumber(page: Page, number: string) {
  await page.goto('/settings/notifications')
  await page.getByLabel('My mobile number').fill(number)
  await page.getByRole('button', { name: 'Save number' }).click()
  await expect(page.getByText(/not verified yet/)).toBeVisible()
  await page.getByLabel('I agree').check()
  await page.getByRole('button', { name: 'Text me a verification code' }).click()
  await expect(page.getByText('Code sent by text. Enter it below.')).toBeVisible()
  await page.getByLabel('Code from the text').fill(await waitForSentCode(number.slice(-4)))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByText('Verified. Automatic texts are on for you.')).toBeVisible()
}

async function signedPost(path: string, params: Record<string, string>, signature?: string) {
  const url = `${BASE_URL}${path}`
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': signature ?? twilioSignature(TOKEN, url, params),
    },
    body: new URLSearchParams(params),
  })
}

test.describe.configure({ mode: 'serial' })
test.beforeAll(() => rmSync(LOG, { force: true }))

test('default mode is off: saving works with zero messaging setup and nothing is texted', async ({
  browser,
}) => {
  const fam = await seedFamily()
  const page = await pageFor(browser, fam.parent.email)
  await page.goto('/log/wet')
  await page.getByRole('button', { name: 'Save wet diaper' }).click()
  await expect(
    page.getByText('Texts are off. Everyone in the family sees this entry in History.'),
  ).toBeVisible()
  expect(countOutbox(fam.householdId)).toBe(0)
})

test('compose mode: a draft to share/copy, never shown as sent', async ({ browser }) => {
  const fam = await seedFamily()
  const owner = await pageFor(browser, fam.owner.email)
  await owner.goto('/settings/notifications')
  await owner.getByRole('radio', { name: /Draft a text after saving/ }).check()
  await expect(owner.getByText('Family texting mode saved. Nothing was sent.')).toBeVisible()
  await owner.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await owner.goto('/log/both')
  await owner.getByRole('button', { name: 'Save wet + poop' }).click()
  await expect(owner.getByText('Saved. Text not sent — tap to share.')).toBeVisible()
  const draft = owner.getByLabel('Update text')
  await expect(draft).toHaveText(
    /^Baby update: Wet \+ poop at \d{1,2}:\d{2} [AP]M \(logged by Mom\)\.$/,
  )
  await expect(draft).not.toContainText(fam.childName)
  await owner.getByRole('button', { name: 'Copy text' }).click()
  await expect(owner.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await owner.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^Baby update: Wet \+ poop/,
  )
  await expect(owner.getByRole('link', { name: 'Open Messages' })).toHaveAttribute('href', 'sms:')
  await expect(owner.getByText(/sent to the text provider|delivered|texts queued/i)).toHaveCount(0)
  expect(countOutbox(fam.householdId)).toBe(0)
})

test.describe('automatic texts (mock provider)', () => {
  let fam: SeededFamily
  let mom: Page
  let dad: Page

  test.beforeAll(async ({ browser }) => {
    fam = await seedFamily()
    mom = await pageFor(browser, fam.owner.email)
    dad = await pageFor(browser, fam.parent.email)
  })

  test('owner turns on automatic mode; each parent verifies their own number with consent', async () => {
    await mom.goto('/settings/notifications')
    await mom.getByRole('radio', { name: /Automatic texts/ }).check()
    await expect(mom.getByText('Family texting mode saved. Nothing was sent.')).toBeVisible()
    expect(sent().filter((s) => s.body.startsWith('Baby update'))).toHaveLength(0)
    await verifyOwnNumber(mom, '(201) 555-0151')
    await verifyOwnNumber(dad, '201-555-0152')
    expect(
      sql(
        `select count(*) from public.notification_contacts where household_id = '${fam.householdId}' and verified_at is not null and consent_text_version is not null`,
      ),
    ).toBe('2')
  })

  test('one save → two separate texts, statuses shown per parent, honest wording', async () => {
    await dad.goto('/log/feed')
    await dad.getByRole('radio', { name: 'Bottle' }).check({ force: true })
    await dad.getByRole('radio', { name: 'Breastmilk' }).check({ force: true })
    await dad.getByLabel(/Custom amount/).fill('3.5')
    await dad.getByRole('button', { name: 'Save bottle · 3.5 oz' }).click()
    await expect(dad.getByText('Saved. Automatic texts:')).toBeVisible()
    await expect(
      dad.getByText(/Mom — sent to the text provider \(delivery not yet confirmed\)/),
    ).toBeVisible({ timeout: 15_000 })
    await expect(dad.getByText(/Dad — sent to the text provider/)).toBeVisible()
    for (const n of ['0151', '0152']) {
      const updates = sentTo(n).filter((s) => s.body.startsWith('Baby update'))
      expect(updates).toHaveLength(1)
      expect(updates[0]!.body).toMatch(
        /^Baby update: Bottle, 3\.5 oz breastmilk at \d{1,2}:\d{2} [AP]M \(logged by Dad\)\.$/,
      )
    }
  })

  test('signed delivery callback marks delivered; unsigned/forged callbacks are refused', async () => {
    const msg = sentTo('0151')
      .filter((s) => s.body.startsWith('Baby update'))
      .at(-1)!
    const params = { MessageSid: msg.messageId!, MessageStatus: 'delivered' }
    expect((await signedPost('/api/v1/notifications/twilio/status', params, 'forged')).status).toBe(
      403,
    )
    expect(
      (
        await signedPost(
          '/api/v1/notifications/twilio/status',
          { ...params, MessageStatus: 'failed' },
          twilioSignature(TOKEN, `${BASE_URL}/api/v1/notifications/twilio/status`, params),
        )
      ).status,
    ).toBe(403)
    expect((await signedPost('/api/v1/notifications/twilio/status', params)).status).toBe(204)
    expect(
      sql(
        `select state from public.notification_outbox where provider_message_id = '${msg.messageId}'`,
      ),
    ).toBe('DELIVERED')
    await mom.goto('/history')
    await mom.locator('main a[href^="/history/"]').first().click()
    await expect(mom.getByText(/Mom — delivered \(reported by the carrier\)/)).toBeVisible()
  })

  test('the pages and APIs never expose a full phone number', async () => {
    for (const p of [mom, dad]) {
      await p.goto('/settings/notifications')
      const html = await p.content()
      expect(html).not.toMatch(/201[\s.-]?555[\s.-]?015\d/)
      expect(html).toContain('•••• 015')
      const api = await p.request.get(`${BASE_URL}/api/v1/notifications/settings`)
      expect(await api.text()).not.toMatch(/2015550\d{3}/)
    }
  })

  test('owner test text: confirmed, exactly one message', async () => {
    const before = sentTo('0152').length
    await mom.goto('/settings/notifications')
    await mom.getByRole('button', { name: 'Send test text…' }).click()
    await mom.getByRole('button', { name: 'Send 1 test text' }).click()
    await expect(mom.getByText(/Test text handed to the provider for •••• 0152/)).toBeVisible()
    expect(sentTo('0152')).toHaveLength(before + 1)
    expect(sentTo('0152').at(-1)!.body).toBe(
      'NFC Baby test: automatic texts are set up for Dad. No action needed. Reply STOP to opt out.',
    )
  })

  test('test texts are limited to three per hour per family', async () => {
    const before = sentTo('0152').length
    const statuses: number[] = []
    for (let i = 0; i < 3; i++) {
      const res = await mom.request.post(`${BASE_URL}/api/v1/notifications/test`, {
        headers: { Origin: BASE_URL },
        data: { userId: fam.parent.id, confirm: true },
      })
      statuses.push(res.status())
    }
    // One was sent by the previous test: two more succeed, the next is refused.
    expect(statuses).toEqual([200, 200, 429])
    expect(sentTo('0152')).toHaveLength(before + 2)
  })

  test('Dad replies STOP: no further automatic texts to him; Mom still gets hers', async () => {
    const params = {
      From: '+12015550152',
      Body: 'Stop',
      To: '+12015550199', // the family's (fictional) sending number
      MessageSid: 'SMinbound1',
    }
    const res = await signedPost('/api/v1/notifications/twilio/inbound', params)
    expect(res.status).toBe(200)
    const dadBefore = sentTo('0152').length
    const momBefore = sentTo('0151').length
    await mom.goto('/log/wet')
    await mom.getByRole('button', { name: 'Save wet diaper' }).click()
    await expect(mom.getByText(/Mom — sent to the text provider/)).toBeVisible({ timeout: 15_000 })
    await expect(mom.getByText(/Dad —/)).toHaveCount(0)
    expect(sentTo('0152')).toHaveLength(dadBefore)
    expect(sentTo('0151')).toHaveLength(momBefore + 1)
    await dad.goto('/settings/notifications')
    await expect(dad.getByText(/texts stopped/)).toBeVisible()
  })

  test('a failing number does not affect the saved entry or the other parent', async () => {
    // Dad re-verified with a number the provider rejects (setup via SQL: the mock can't text it a code).
    sql(
      `update public.notification_contacts set opted_out_at = null, phone_last4 = '0199', phone_ciphertext = (select phone_ciphertext from public.notification_contacts where user_id = '${fam.parent.id}') where user_id = '${fam.parent.id}'`,
    )
    await admin
      .from('notification_preferences')
      .update({ auto_sms_enabled: true })
      .eq('user_id', fam.parent.id)
    const key = process.env.CONTACT_ENCRYPTION_KEY!
    await admin
      .from('notification_contacts')
      .update({
        phone_ciphertext: encryptWithKey('+12015550199', key),
        phone_hmac: hmacWithKey('+12015550199', key),
      })
      .eq('user_id', fam.parent.id)
    await mom.goto('/log/poop')
    await mom.getByRole('button', { name: 'Save poop diaper' }).click()
    await expect(mom.getByText(/Dad — not sent — failed/)).toBeVisible({ timeout: 15_000 })
    await expect(mom.getByText(/Mom — sent to the text provider/)).toBeVisible()
    await expect(mom.getByText('Saved', { exact: true })).toBeVisible()
  })

  test('the cron dispatch endpoint requires the secret', async ({ request }) => {
    expect((await request.post(`${BASE_URL}/api/v1/notifications/dispatch`)).status()).toBe(401)
    expect(
      (
        await request.post(`${BASE_URL}/api/v1/notifications/dispatch`, {
          headers: { Authorization: 'Bearer wrong' },
        })
      ).status(),
    ).toBe(401)
    const ok = await request.post(`${BASE_URL}/api/v1/notifications/dispatch`, {
      headers: { Authorization: `Bearer ${CRON}` },
    })
    expect(ok.status()).toBe(200)
    expect(Object.keys(await ok.json()).sort()).toEqual([
      'canceled',
      'claimed',
      'failed',
      'sent',
      'unknown',
    ])
  })

  test('caregivers and viewers cannot see or set numbers, change the mode, or send tests', async ({
    browser,
  }) => {
    for (const who of [fam.caregiver, fam.viewer]) {
      const p = await pageFor(browser, who.email)
      await p.goto('/settings/notifications')
      await expect(p.getByText(/Automatic texts go only to parents/)).toBeVisible()
      expect(await p.content()).not.toContain('••••')
      const headers = { Origin: BASE_URL }
      expect(
        (
          await p.request.post(`${BASE_URL}/api/v1/notifications/contact`, {
            data: { phone: '2015550160' },
            headers,
          })
        ).status(),
      ).toBe(403)
      expect(
        (
          await p.request.post(`${BASE_URL}/api/v1/notifications/mode`, {
            data: { mode: 'OFF' },
            headers,
          })
        ).status(),
      ).toBe(403)
      expect(
        (
          await p.request.post(`${BASE_URL}/api/v1/notifications/test`, {
            data: { userId: fam.owner.id, confirm: true },
            headers,
          })
        ).status(),
      ).toBe(403)
    }
  })
})
