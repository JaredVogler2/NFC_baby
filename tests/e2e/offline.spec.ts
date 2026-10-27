import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { generateTagToken } from '../../lib/nfc/token'
import { admin, countEvents, seedFamily, signInContext, sql, type SeededFamily } from './support'

// This spec exercises the real service worker; other specs block it so request interception
// (page.route) stays deterministic.
test.use({ serviceWorkers: 'allow' })

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

/** Count records in one of the app's IndexedDB stores (runs in the page). */
function idbCount(page: Page, store: 'drafts' | 'tags' | 'context') {
  return page.evaluate(
    (s) =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('nfc-baby')
        // Never create the app's database from the test: abort if it doesn't exist yet.
        open.onupgradeneeded = () => open.transaction?.abort()
        open.onerror = () => resolve(0)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains(s)) return resolve(0)
          const req = db.transaction(s).objectStore(s).count()
          req.onsuccess = () => {
            resolve(req.result)
            db.close()
          }
        }
      }),
    store,
  )
}

function idbDrafts(page: Page) {
  return page.evaluate(
    () =>
      new Promise<unknown[]>((resolve) => {
        const open = indexedDB.open('nfc-baby')
        open.onsuccess = () => {
          const req = open.result.transaction('drafts').objectStore('drafts').getAll()
          req.onsuccess = () => {
            resolve(req.result)
            open.result.close()
          }
        }
      }),
  )
}

function idbPutDraft(page: Page, draft: unknown) {
  return page.evaluate(
    (d) =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open('nfc-baby')
        open.onsuccess = () => {
          const tx = open.result.transaction('drafts', 'readwrite')
          tx.objectStore('drafts').put(d)
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
        }
      }),
    draft,
  )
}

/** Load Home online and wait until the service worker controls the page (offline page cached). */
async function installServiceWorker(page: Page) {
  await page.goto('/dashboard')
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration()
        const cached = await caches.match('/offline', { ignoreVary: true })
        return !!reg?.active && !!navigator.serviceWorker.controller && !!cached
      }),
    )
    .toBe(true)
  await expect.poll(() => idbCount(page, 'context')).toBe(1)
}

test.describe('offline and uncertain saves (J-I)', () => {
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

  test('the app is installable: manifest, icons and a service worker that never caches family data', async () => {
    const manifest = await (await page.request.get('/manifest.webmanifest')).json()
    expect(manifest).toMatchObject({
      name: 'NFC Baby',
      start_url: '/dashboard',
      display: 'standalone',
    })
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
    for (const icon of manifest.icons as { src: string }[]) {
      expect((await page.request.get(icon.src)).status()).toBe(200)
    }
    await installServiceWorker(page)
    const cached = await page.evaluate(async () => {
      const out: string[] = []
      for (const name of await caches.keys()) {
        for (const req of await (await caches.open(name)).keys()) {
          out.push(new URL(req.url).pathname)
        }
      }
      return out
    })
    expect(cached).toContain('/offline')
    // Only build assets, icons, manifest and the cookie-less offline page — no pages or API data.
    for (const path of cached) {
      expect(path).toMatch(/^\/(offline|manifest\.webmanifest|icons\/.+|_next\/static\/.+)$/)
    }
  })

  test('scan with no signal → honest pending draft → back online → exactly one event', async () => {
    const token = await seedTag(fam, 'WET')
    await installServiceWorker(page)
    // Open the sticker once online (this phone remembers it), then lose the connection.
    await page.goto(`/t/${token}`)
    await expect(page.getByRole('button', { name: 'Save wet diaper' })).toBeVisible()
    await expect.poll(() => idbCount(page, 'tags')).toBe(1)
    await context.setOffline(true)

    // Scan again with no signal: the service worker shows the remembered form.
    await page.goto(`/t/${token}`)
    await expect(page.getByText('No connection.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Log wet diaper' })).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(0) // the scan itself recorded nothing

    const tappedAt = Date.now()
    await page.getByRole('button', { name: 'Save wet diaper' }).click()
    await expect(page.getByText('You’re offline — not saved')).toBeVisible()
    expect(await idbCount(page, 'drafts')).toBe(0) // nothing kept without consent
    await page.getByRole('button', { name: 'Keep as pending on this phone' }).click()
    await expect(
      page.getByText('Pending on this device — NOT yet in shared history; no text sent.'),
    ).toBeVisible()
    expect(await idbCount(page, 'drafts')).toBe(1)
    expect(countEvents(fam.householdId)).toBe(0)
    const [draft] = (await idbDrafts(page)) as { clientRequestId: string }[]

    // Still offline: Home falls back to the offline screen, which lists the pending entry.
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible()
    await expect(page.getByTestId('pending-draft')).toContainText('Wet diaper')

    // Back online: opening Home syncs it with the original request id.
    await context.setOffline(false)
    await page.goto('/dashboard')
    await expect(page.getByText(/1 pending entry is now in the shared history/)).toBeVisible()
    await expect(page.getByTestId('pending-draft')).toHaveCount(0)
    expect(countEvents(fam.householdId)).toBe(1)
    const row = sql(
      `select source || '|' || idempotency_key || '|' || extract(epoch from occurred_at)::bigint from public.care_events where household_id = '${fam.householdId}'`,
    ).split('|')
    expect(row[0]).toBe('OFFLINE_SYNC')
    expect(row[1]).toBe(draft!.clientRequestId)
    // The entry keeps the time Save was tapped, not the time it synced.
    expect(Math.abs(Number(row[2]) * 1000 - tappedAt)).toBeLessThan(15_000)

    // Re-syncing the very same draft (e.g. a second tab) creates nothing new.
    await idbPutDraft(page, draft)
    await page.reload()
    await expect(page.getByText(/1 pending entry is now in the shared history/)).toBeVisible()
    await expect.poll(() => idbCount(page, 'drafts')).toBe(0)
    await expect(page.getByTestId('pending-draft')).toHaveCount(0)
    expect(countEvents(fam.householdId)).toBe(1)
  })

  test('offline after the form loaded: typed values and the tap time are kept', async () => {
    const token = await seedTag(fam, 'FEED')
    await installServiceWorker(page)
    await page.goto(`/t/${token}`)
    await page
      .locator('label')
      .filter({ hasText: /^Bottle$/ })
      .click()
    await page
      .locator('label')
      .filter({ hasText: /^Formula$/ })
      .click()
    await expect(page.getByRole('radio', { name: 'Formula' })).toBeChecked()
    await page.getByLabel(/Custom amount/).fill('3.5')
    await context.setOffline(true)
    const tappedAt = Date.now()
    await page.getByRole('button', { name: 'Save bottle · 3.5 oz' }).click()
    await page.getByRole('button', { name: 'Keep as pending on this phone' }).click()
    await expect(page.getByText(/Pending on this device/)).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(0)
    await context.setOffline(false)
    await page.getByRole('link', { name: 'Done' }).click()
    await expect(page.getByText(/1 pending entry is now in the shared history/)).toBeVisible()
    expect(countEvents(fam.householdId)).toBe(1)
    const amount = sql(
      `select f.amount_entered_value::float8 || ' ' || f.amount_entered_unit || ' ' || f.milk_type || ' ' || extract(epoch from e.occurred_at)::bigint from public.feeding_details f join public.care_events e on e.id = f.event_id where e.household_id = '${fam.householdId}'`,
    ).split(' ')
    expect(amount.slice(0, 3).join(' ')).toBe('3.5 oz FORMULA')
    expect(Math.abs(Number(amount[3]) * 1000 - tappedAt)).toBeLessThan(15_000)
  })

  test('another person signing in on this phone never sees or uploads the previous drafts', async () => {
    const token = await seedTag(fam, 'POOP')
    await installServiceWorker(page)
    await page.goto(`/t/${token}`)
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Save poop diaper' }).click()
    await page.getByRole('button', { name: 'Keep as pending on this phone' }).click()
    await expect(page.getByText(/Pending on this device/)).toBeVisible()
    await context.setOffline(false)

    // Simulate the session silently switching to another family member (no sign-out).
    await context.clearCookies()
    await signInContext(context, fam.owner.email)
    await page.goto('/dashboard')
    await expect(page.getByText('Entries from another sign-in')).toBeVisible()
    await expect(page.getByTestId('pending-draft')).toHaveCount(0)
    expect(countEvents(fam.householdId)).toBe(0)

    // Signing out wipes everything this app stored on the phone.
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
    expect(await idbCount(page, 'drafts')).toBe(0)
    expect(await idbCount(page, 'tags')).toBe(0)
    expect(await idbCount(page, 'context')).toBe(0)
  })

  test('a pending sticker entry never syncs into a different child if the sticker was moved', async () => {
    const token = await seedTag(fam, 'WET')
    await installServiceWorker(page)
    await page.goto(`/t/${token}`)
    await expect(page.getByRole('button', { name: 'Save wet diaper' })).toBeVisible()
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Save wet diaper' }).click()
    await page.getByRole('button', { name: 'Keep as pending on this phone' }).click()
    await expect(page.getByText(/Pending on this device/)).toBeVisible()
    // Meanwhile the sticker is moved to another child of the family.
    const other = await admin
      .from('children')
      .insert({ household_id: fam.householdId, nickname: 'Second child' })
      .select('id')
      .single()
    if (other.error) throw other.error
    sql(`update public.nfc_tags set child_id = '${other.data.id}' where token = '${token}'`)
    await context.setOffline(false)
    await page.goto('/dashboard')
    await expect(page.getByTestId('pending-draft')).toContainText('belongs to a different child')
    expect(countEvents(fam.householdId)).toBe(0)
  })
})
