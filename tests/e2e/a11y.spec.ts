import AxeBuilder from '@axe-core/playwright'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { generateTagToken } from '../../lib/nfc/token'
import { admin, seedFamily, signInContext, type SeededFamily } from './support'

/**
 * Automated accessibility checks (axe-core, WCAG 2.2 A/AA rules) on every main screen, in day and
 * night appearance. Automated checks catch only part of the problems: VoiceOver on a real iPhone
 * is still a manual step (docs/ACCEPTANCE_MATRIX.md).
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Violations as readable lines ("Home dark: color-contrast (serious) — .selector"). */
async function audit(page: Page, label: string): Promise<string[]> {
  // @axe-core/playwright types come from a different playwright-core minor; the API is the same.
  type AxePage = ConstructorParameters<typeof AxeBuilder>[0]['page']
  const result = await new AxeBuilder({ page: page as unknown as AxePage }).withTags(WCAG).analyze()
  return result.violations.map(
    (v) => `${label}: ${v.id} (${v.impact}) — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  )
}

test.describe('accessibility (axe)', () => {
  let fam: SeededFamily
  let token: string
  let eventId: string
  let context: BrowserContext

  test.beforeAll(async ({ browser }) => {
    fam = await seedFamily({ mode: 'COMPOSE' })
    token = generateTagToken()
    const tag = await admin.from('nfc_tags').insert({
      token,
      household_id: fam.householdId,
      child_id: fam.childId,
      purpose: 'FEED',
      label: 'Kitchen',
      created_by: fam.owner.id,
    })
    if (tag.error) throw tag.error
    context = await browser.newContext()
    await signInContext(context, fam.owner.email)
    const res = await context.request.post('/api/v1/events', {
      headers: { Origin: 'http://localhost:3100' },
      data: { clientRequestId: crypto.randomUUID(), intent: 'WET', childId: fam.childId },
    })
    expect(res.status()).toBe(201)
    eventId = (await res.json()).event.id
  })
  test.afterAll(async () => {
    await context.close()
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`signed-in screens pass axe (${scheme})`, async () => {
      const page = await context.newPage()
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      const screens: [string, string][] = [
        ['/dashboard', 'Home'],
        ['/log/wet', 'Log wet'],
        [`/t/${token}`, 'Feeding sticker'],
        [`/saved/${eventId}`, 'Saved'],
        ['/history', 'History'],
        [`/history/${eventId}`, 'Entry detail'],
        ['/settings', 'Settings'],
        ['/settings/family', 'Family'],
        ['/settings/members', 'Members'],
        ['/settings/tags', 'Stickers'],
        ['/settings/notifications', 'Notifications'],
        ['/settings/display', 'Display'],
        ['/settings/privacy', 'Privacy'],
        ['/offline', 'Offline'],
      ]
      const problems: string[] = []
      for (const [path, label] of screens) {
        await page.goto(path)
        await expect(page.locator('main')).toBeVisible()
        problems.push(...(await audit(page, `${label} ${scheme}`)))
      }
      // Feeding form with the bottle section open (more controls on screen).
      await page.goto(`/t/${token}`)
      await page
        .locator('label')
        .filter({ hasText: /^Bottle$/ })
        .click()
      await expect(page.getByLabel(/Custom amount/)).toBeVisible()
      problems.push(...(await audit(page, `Bottle form ${scheme}`)))
      expect(problems, problems.join('\n')).toEqual([])
      await page.close()
    })
  }

  test('signed-out screens pass axe', async ({ browser }) => {
    const anon = await browser.newContext()
    const page = await anon.newPage()
    const problems: string[] = []
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      for (const [path, label] of [
        ['/login', 'Sign in'],
        [`/t/${token}`, 'Sticker gate'],
        ['/offline', 'Offline'],
      ] as const) {
        await page.goto(path)
        problems.push(...(await audit(page, `${label} ${scheme}`)))
      }
    }
    expect(problems, problems.join('\n')).toEqual([])
    await anon.close()
  })
})
