import { expect, test } from '@playwright/test'

test.describe('app shell smoke', () => {
  test('sign-in page renders without horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    const response = await page.goto('/login')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('pages send privacy and security headers', async ({ page }) => {
    const response = await page.goto('/login')
    const headers = response!.headers()
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-/)
    expect(headers['x-robots-tag']).toContain('noindex')
    expect(headers['referrer-policy']).toBe('same-origin')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['cache-control']).toContain('no-store')
    expect(headers['x-powered-by']).toBeUndefined()
  })

  test('health endpoint reveals no data', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    expect(Object.keys(await res.json()).sort()).toEqual(['configured', 'ok'])
  })

  test('unknown routes show a safe not-found page', async ({ page }) => {
    const response = await page.goto('/definitely-not-here')
    expect(response?.status()).toBe(404)
    await expect(page.getByText('Not available')).toBeVisible()
  })
})
