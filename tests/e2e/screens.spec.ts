import { expect, test, type Page } from '@playwright/test'
import { generateTagToken } from '../../lib/nfc/token'
import { admin, seedFamily, signInContext, type SeededFamily } from './support'

/**
 * Visual QA: renders the core screens at 320/375/430 px in day and night themes, asserts there is
 * no horizontal overflow and the primary action is fully on screen, and saves screenshots to
 * test-results/screens/ for human review (not committed).
 */
const WIDTHS = [320, 375, 430] as const
const SCHEMES = ['light', 'dark'] as const

let fam: SeededFamily
let wetToken = ''
let feedToken = ''
let eventId = ''

test.beforeAll(async ({ browser }) => {
  fam = await seedFamily({ childName: 'Juniper' })
  wetToken = generateTagToken()
  feedToken = generateTagToken()
  await admin.from('nfc_tags').insert([
    {
      token: wetToken,
      household_id: fam.householdId,
      child_id: fam.childId,
      purpose: 'WET',
      label: 'Changing table',
      created_by: fam.owner.id,
      tested_at: new Date().toISOString(),
    },
    {
      token: feedToken,
      household_id: fam.householdId,
      child_id: fam.childId,
      purpose: 'FEED',
      label: 'Bottle station',
      created_by: fam.owner.id,
      tested_at: new Date().toISOString(),
    },
  ])
  const ctx = await browser.newContext()
  await signInContext(ctx, fam.owner.email)
  const page = await ctx.newPage()
  await page.goto(`/t/${wetToken}`)
  await page.getByRole('button', { name: /Add note/ }).click()
  await page.getByRole('textbox', { name: /Note/ }).fill('Leak at the side')
  await page.getByRole('button', { name: 'Save wet diaper' }).click()
  await expect(page).toHaveURL(/\/saved\//)
  eventId = page.url().split('/saved/')[1]!
  await ctx.close()
})

async function check(page: Page, name: string, width: number, scheme: string, primary?: RegExp) {
  await page.waitForLoadState('networkidle')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow, `${name} overflows at ${width}px`).toBeLessThanOrEqual(0)
  if (primary) {
    const box = await page.getByRole('button', { name: primary }).boundingBox()
    expect(box, `${name}: primary action missing`).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5)
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 0.5)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({
    path: `test-results/screens/${name}-${width}-${scheme}.png`,
    fullPage: true,
  })
}

for (const scheme of SCHEMES) {
  for (const width of WIDTHS) {
    test(`core screens at ${width}px (${scheme})`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width, height: 740 },
        colorScheme: scheme,
        isMobile: true,
        hasTouch: true,
      })
      const anon = await ctx.newPage()
      await anon.goto(`/t/${wetToken}`)
      await check(anon, 'tag-gate', width, scheme)
      await anon.goto('/login')
      await check(anon, 'login', width, scheme, /Email me a sign-in code/)
      await signInContext(ctx, fam.parent.email)
      const page = await ctx.newPage()
      await page.goto(`/t/${wetToken}`)
      await check(page, 'log-wet', width, scheme, /Save wet diaper/)
      await page.getByRole('button', { name: 'Change time' }).click()
      await page.getByRole('button', { name: /Add note/ }).click()
      await check(page, 'log-wet-expanded', width, scheme, /Save wet diaper/)
      await page.goto(`/t/${feedToken}`)
      await check(page, 'log-feed', width, scheme, /Save/)
      await page.goto(`/saved/${eventId}`)
      await check(page, 'saved', width, scheme)
      await page.goto('/dashboard')
      await check(page, 'dashboard', width, scheme)
      await page.goto(`/history/${eventId}`)
      await check(page, 'event-detail', width, scheme)
      await ctx.close()
    })
  }
}
