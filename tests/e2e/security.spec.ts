import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { generateTagToken } from '../../lib/nfc/token'
import {
  BASE_URL,
  admin,
  countEvents,
  seedFamily,
  signInContext,
  sql,
  type SeededFamily,
} from './support'

/**
 * Adversarial checks against the real HTTP routes (prompt 10 scenarios 2, 3, 4, 13, 15, 17).
 * Family A is the victim; Mallory is the OWNER of family B (the most privileged outsider).
 */

const headers = { Origin: BASE_URL }

test.describe('adversarial API', () => {
  let a: SeededFamily
  let b: SeededFamily
  let aTag: { id: string; token: string }
  let aEvent: { id: string; key: string }
  let alice: APIRequestContext // parent in family A
  let mallory: APIRequestContext // owner of family B

  test.beforeAll(async ({ playwright }) => {
    a = await seedFamily()
    b = await seedFamily()
    const token = generateTagToken()
    const tag = await admin
      .from('nfc_tags')
      .insert({
        token,
        household_id: a.householdId,
        child_id: a.childId,
        purpose: 'WET',
        label: 'A nursery',
        created_by: a.owner.id,
      })
      .select('id')
      .single()
    if (tag.error) throw tag.error
    aTag = { id: tag.data.id as string, token }

    alice = await playwright.request.newContext({ baseURL: BASE_URL })
    await signInContext(alice, a.parent.email)
    const key = randomUUID()
    const res = await alice.post('/api/v1/events', {
      headers,
      data: { clientRequestId: key, intent: 'WET', tagToken: token, notes: 'A private note' },
    })
    expect(res.status()).toBe(201)
    aEvent = { id: (await res.json()).event.id, key }

    mallory = await playwright.request.newContext({ baseURL: BASE_URL })
    await signInContext(mallory, b.owner.email)
  })

  test.afterAll(async () => {
    await alice.dispose()
    await mallory.dispose()
  })

  test('another family’s owner gets nothing back from any A-scoped endpoint and changes nothing', async () => {
    const secrets = [a.childName, a.childId, aEvent.id, aTag.id, aTag.token, 'A private note']
    const calls: [string, string, unknown?][] = [
      ['GET', `/api/v1/events/${aEvent.id}`],
      ['PATCH', `/api/v1/events/${aEvent.id}`, { expectedRevision: 1, patch: { notes: 'pwned' } }],
      ['POST', `/api/v1/events/${aEvent.id}/void`, { expectedRevision: 1 }],
      ['GET', `/api/v1/events/by-request/${aEvent.key}`],
      ['GET', `/api/v1/events?childId=${a.childId}`],
      ['GET', `/api/v1/dashboard?childId=${a.childId}`],
      [
        'POST',
        '/api/v1/events',
        { clientRequestId: randomUUID(), intent: 'WET', childId: a.childId },
      ],
      [
        'POST',
        '/api/v1/events',
        { clientRequestId: randomUUID(), intent: 'WET', tagToken: aTag.token },
      ],
      ['GET', `/api/v1/tags/${aTag.token}`],
      ['PATCH', `/api/v1/tags/${aTag.id}`, { childId: b.childId, purpose: 'WET', label: 'pwned' }],
      ['POST', `/api/v1/tags/${aTag.id}/revoke`, {}],
      ['POST', `/api/v1/tags/${aTag.id}/tested`, {}],
      ['GET', `/api/v1/tags/${aTag.id}/qr`],
      ['POST', '/api/v1/tags', { childId: a.childId, purpose: 'POOP', label: 'pwned' }],
      ['PATCH', `/api/v1/children/${a.childId}`, { nickname: 'pwned', archived: true }],
      ['PATCH', `/api/v1/members/${a.owner.id}`, { role: 'viewer' }],
      ['POST', '/api/v1/notifications/test', { userId: a.owner.id, confirm: true }],
      ['GET', '/api/v1/export?format=json'],
      ['GET', '/api/v1/export?format=csv'],
      ['GET', '/api/v1/me'],
      ['GET', '/api/v1/notifications/settings'],
    ]
    for (const [method, path, data] of calls) {
      const res = await mallory.fetch(path, { method, headers, data })
      const body = await res.text()
      // Reads of "my own" data may succeed; anything aimed at family A must be 403/404/422.
      const ownScoped = /^\/api\/v1\/(events\?|dashboard|export|me$|notifications\/settings)/.test(
        path,
      )
      if (!ownScoped) {
        expect([403, 404, 422], `${method} ${path} → ${res.status()}`).toContain(res.status())
      }
      for (const s of secrets) {
        expect(body.includes(s), `${method} ${path} leaked ${s}`).toBe(false)
      }
    }
    // Family A is unchanged.
    expect(countEvents(a.householdId)).toBe(1)
    expect(
      sql(
        `select revision || '|' || state || '|' || notes from public.care_events where id = '${aEvent.id}'`,
      ),
    ).toBe('1|ACTIVE|A private note')
    expect(
      sql(
        `select label || '|' || (revoked_at is null) || '|' || child_id from public.nfc_tags where id = '${aTag.id}'`,
      ),
    ).toBe(`A nursery|true|${a.childId}`)
    expect(sql(`select nickname from public.children where id = '${a.childId}'`)).toBe(a.childName)
    expect(
      sql(
        `select role from public.household_members where user_id = '${a.owner.id}' and household_id = '${a.householdId}'`,
      ),
    ).toBe('owner')
    expect(countEvents(b.householdId)).toBe(0)
  })

  test('signed-out requests get 401 and no data from every family endpoint', async ({
    playwright,
  }) => {
    const anon = await playwright.request.newContext({ baseURL: BASE_URL })
    for (const [method, path] of [
      ['GET', '/api/v1/me'],
      ['GET', '/api/v1/events'],
      ['GET', `/api/v1/events/${aEvent.id}`],
      ['GET', `/api/v1/events/by-request/${aEvent.key}`],
      ['GET', '/api/v1/dashboard'],
      ['GET', '/api/v1/export?format=json'],
      ['GET', '/api/v1/tags'],
      ['GET', `/api/v1/tags/${aTag.token}`],
      ['GET', '/api/v1/notifications/settings'],
      ['POST', '/api/v1/events'],
    ] as const) {
      const res = await anon.fetch(path, {
        method,
        headers,
        data:
          method === 'POST'
            ? { clientRequestId: randomUUID(), intent: 'WET', tagToken: aTag.token }
            : undefined,
      })
      expect(res.status(), `${method} ${path}`).toBe(401)
      const body = await res.text()
      expect(body).not.toContain(a.childName)
      expect(body).not.toContain('A private note')
    }
    expect(countEvents(a.householdId)).toBe(1)
    await anon.dispose()
  })

  test('forged fields in a save are ignored: author, family, source and state come from the server', async () => {
    const res = await alice.post('/api/v1/events', {
      headers,
      data: {
        clientRequestId: randomUUID(),
        intent: 'WET',
        tagToken: aTag.token,
        createdBy: b.owner.id,
        created_by: b.owner.id,
        householdId: b.householdId,
        household_id: b.householdId,
        source: 'SHORTCUT',
        state: 'VOID',
        revision: 99,
        subtype: 'POOP',
      },
    })
    expect(res.status()).toBe(201)
    const id = (await res.json()).event.id
    expect(
      sql(
        `select created_by || '|' || household_id || '|' || source || '|' || state || '|' || revision || '|' || subtype from public.care_events where id = '${id}'`,
      ),
    ).toBe(`${a.parent.id}|${a.householdId}|TAG|ACTIVE|1|WET`)
    // A WET sticker cannot be used to log a feeding, whatever the payload says.
    const forged = await alice.post('/api/v1/events', {
      headers,
      data: {
        clientRequestId: randomUUID(),
        intent: 'FEED',
        tagToken: aTag.token,
        feeding: { method: 'BOTTLE', milkType: 'FORMULA', amountValue: 3, amountUnit: 'oz' },
      },
    })
    expect(forged.status()).toBe(422)
  })

  test('cross-site and non-JSON writes are refused (CSRF), oversized bodies too', async () => {
    const before = countEvents(a.householdId)
    const body = { clientRequestId: randomUUID(), intent: 'WET', tagToken: aTag.token }
    const evil = await alice.post('/api/v1/events', {
      headers: { Origin: 'https://evil.example' },
      data: body,
    })
    expect(evil.status()).toBe(403)
    expect((await evil.json()).error.code).toBe('BAD_ORIGIN')
    const crossSite = await alice.post('/api/v1/events', {
      headers: { 'Sec-Fetch-Site': 'cross-site' },
      data: body,
    })
    expect(crossSite.status()).toBe(403)
    // A "simple" cross-site form post (text/plain) never reaches the handler's JSON parser.
    const textPlain = await alice.post('/api/v1/events', {
      headers: { ...headers, 'Content-Type': 'text/plain' },
      data: JSON.stringify(body),
    })
    expect(textPlain.status()).toBe(415)
    const huge = await alice.post('/api/v1/events', {
      headers,
      data: { ...body, notes: 'x'.repeat(40_000) },
    })
    expect(huge.status()).toBe(413)
    expect(countEvents(a.householdId)).toBe(before)
  })

  test('10 concurrent HTTP saves with one key → one event, every response points at it', async () => {
    const before = countEvents(a.householdId)
    const key = randomUUID()
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        alice.post('/api/v1/events', {
          headers,
          data: { clientRequestId: key, intent: 'WET', tagToken: aTag.token, notes: 'once' },
        }),
      ),
    )
    const statuses = responses.map((r) => r.status()).sort()
    expect(statuses.filter((s) => s === 201)).toHaveLength(1)
    expect(statuses.filter((s) => s === 200)).toHaveLength(9)
    const ids = new Set(await Promise.all(responses.map(async (r) => (await r.json()).event.id)))
    expect(ids.size).toBe(1)
    expect(countEvents(a.householdId)).toBe(before + 1)
  })

  test('script in a note is shown as text, never executed', async ({ browser }) => {
    const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>"'&`
    const res = await alice.post('/api/v1/events', {
      headers,
      data: { clientRequestId: randomUUID(), intent: 'WET', tagToken: aTag.token, notes: payload },
    })
    expect(res.status()).toBe(201)
    const id = (await res.json()).event.id
    const ctx = await browser.newContext()
    await signInContext(ctx, a.owner.email)
    const page = await ctx.newPage()
    for (const path of [`/history/${id}`, '/history', '/dashboard']) {
      await page.goto(path)
      await expect(page.getByText(payload).first()).toBeVisible()
      expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined()
      expect(await page.locator('main img[src="x"]').count()).toBe(0)
    }
    await ctx.close()
  })

  test('the production bundle has no source maps and no server secrets', async ({ page }) => {
    await page.goto('/login')
    const scripts = await page
      .locator('script[src]')
      .evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src))
    expect(scripts.length).toBeGreaterThan(0)
    const secretValues = [
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.CONTACT_ENCRYPTION_KEY,
      process.env.CRON_SECRET,
      'e2e-test-auth-token-not-real', // the E2E server's Twilio token
    ].filter((v): v is string => !!v && v.length > 8)
    for (const src of scripts) {
      const js = await (await page.request.get(src)).text()
      for (const secret of secretValues) expect(js.includes(secret), src).toBe(false)
      expect(js).not.toMatch(/sourceMappingURL=/)
      expect((await page.request.get(`${src}.map`)).status()).toBe(404)
    }
  })
})
