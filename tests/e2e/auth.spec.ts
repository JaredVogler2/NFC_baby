import { expect, test } from '@playwright/test'
import {
  BASE_URL,
  BOOTSTRAP_EMAIL,
  admin,
  resetAll,
  seedFamily,
  signInContext,
  signInViaUi,
  sqlNumber,
  uniqueEmail,
  waitForCode,
  waitForLink,
} from './support'

test.describe.serial('first owner bootstrap', () => {
  test.beforeAll(async () => {
    await resetAll()
  })

  test('configured owner signs in with an emailed code and creates the family', async ({
    page,
  }) => {
    await signInViaUi(page, BOOTSTRAP_EMAIL)
    await expect(page).toHaveURL(/\/setup$/)
    await expect(page.getByRole('heading', { name: 'Set up your family' })).toBeVisible()
    await page.getByLabel('Your name (as the family sees it)').fill('Mom')
    await page.getByLabel('Baby’s nickname').fill('Bean')
    await page.getByLabel('Family name').fill('Synthetic Family')
    await page.getByRole('button', { name: 'Create our family log' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    expect(sqlNumber('select count(*) from public.households')).toBe(1)
  })

  test('bootstrap is single-use: nobody can create a second family', async ({ page }) => {
    // The owner email now has a family; a stranger cannot sign up at all.
    const stranger = uniqueEmail('stranger')
    await page.goto('/login')
    await page.getByLabel('Email').fill(stranger)
    await page.getByRole('button', { name: 'Email me a sign-in code' }).click()
    // Same response as for a member (no account enumeration) …
    await expect(page.getByText('Check your email')).toBeVisible()
    // … but no account exists and no email was sent.
    expect(sqlNumber(`select count(*) from auth.users where email = '${stranger}'`)).toBe(0)
  })
})

test.describe('invites', () => {
  test('owner invites a parent who joins on their own phone', async ({ browser }) => {
    const family = await seedFamily()
    const ownerCtx = await browser.newContext()
    await signInContext(ownerCtx, family.owner.email)
    const partnerEmail = uniqueEmail('partner')
    const created = await ownerCtx.request.post(`${BASE_URL}/api/v1/invites`, {
      data: { email: partnerEmail, role: 'parent', displayName: 'Papa' },
      headers: { Origin: BASE_URL },
    })
    expect(created.status()).toBe(201)
    const { url } = (await created.json()) as { url: string }
    expect(url).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/)

    const partner = await browser.newPage()
    await partner.goto(url)
    await expect(partner.getByRole('heading', { name: /You.re invited/ })).toBeVisible()
    // Wrong email is refused without sending anything.
    await partner.getByLabel('Email').fill(uniqueEmail('wrong'))
    await partner.getByRole('button', { name: 'Email me a sign-in code' }).click()
    await expect(partner.getByText(/Use the invited address/)).toBeVisible()

    await partner.getByLabel('Email').fill(partnerEmail)
    const since = Date.now()
    await partner.getByRole('button', { name: 'Email me a sign-in code' }).click()
    await partner.getByLabel('Code').fill(await waitForCode(partnerEmail, since))
    await partner.getByRole('button', { name: 'Sign in' }).click()
    await expect(partner.getByRole('heading', { name: 'Join as Parent' })).toBeVisible()
    await expect(partner.getByLabel('Your name (as the family sees it)')).toHaveValue('Papa')
    await partner.getByRole('button', { name: 'Join the family log' }).click()
    await expect(partner).toHaveURL(/\/dashboard$/)
    expect(
      sqlNumber(
        `select count(*) from public.household_members m join auth.users u on u.id = m.user_id where m.household_id = '${family.householdId}' and u.email = '${partnerEmail}' and m.role = 'parent'`,
      ),
    ).toBe(1)

    // The link is single-use.
    const again = await browser.newPage()
    await again.goto(url)
    await expect(again.getByRole('heading', { name: 'Invite not valid' })).toBeVisible()
  })

  test('parents cannot create invites', async ({ browser }) => {
    const family = await seedFamily()
    const ctx = await browser.newContext()
    await signInContext(ctx, family.parent.email)
    const res = await ctx.request.post(`${BASE_URL}/api/v1/invites`, {
      data: { email: uniqueEmail('x'), role: 'parent' },
      headers: { Origin: BASE_URL },
    })
    expect(res.status()).toBe(403)
  })
})

test.describe('session boundaries', () => {
  test('signed-out visitors are sent to sign-in and come back afterwards', async ({ page }) => {
    const family = await seedFamily()
    await page.goto('/history')
    await expect(page).toHaveURL(/\/login\?next=%2Fhistory$/)
    const since = Date.now()
    await page.getByLabel('Email').fill(family.parent.email)
    await page.getByRole('button', { name: 'Email me a sign-in code' }).click()
    await page.getByLabel('Code').fill(await waitForCode(family.parent.email, since))
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/history$/)
  })

  test('a wrong code is rejected', async ({ page }) => {
    const family = await seedFamily()
    await page.goto('/login')
    await page.getByLabel('Email').fill(family.parent.email)
    await page.getByRole('button', { name: 'Email me a sign-in code' }).click()
    await page.getByLabel('Code').fill('000000')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(/not valid or has expired/)).toBeVisible()
  })

  test('email link needs a tap: opening it alone does not sign in (scanner-safe)', async ({
    page,
    request,
  }) => {
    const family = await seedFamily()
    const since = Date.now()
    await request.post(`${BASE_URL}/api/v1/auth/otp`, {
      data: { email: family.owner.email, next: '/history' },
      headers: { Origin: BASE_URL },
    })
    const link = new URL(await waitForLink(family.owner.email, since))
    const local = `${BASE_URL}${link.pathname}${link.search}`
    // A link scanner fetches the URL: nothing happens.
    const scanned = await request.get(local)
    expect(scanned.status()).toBe(200)
    await page.goto(local)
    await expect(page.getByRole('button', { name: 'Finish signing in' })).toBeVisible()
    await page.getByRole('button', { name: 'Finish signing in' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('a signed-in account without a family sees no data and is told why', async ({ page }) => {
    const email = uniqueEmail('lonely')
    await admin.auth.admin.createUser({ email, email_confirm: true })
    await signInViaUi(page, email)
    await expect(page).toHaveURL(/\/setup$/)
    await expect(page.getByRole('heading', { name: 'No family access yet' })).toBeVisible()
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/setup$/)
  })
})
