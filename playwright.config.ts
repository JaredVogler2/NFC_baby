import { defineConfig, devices } from '@playwright/test'

/**
 * E2E runs against a production build (`next start`) wired to the local Supabase stack
 * (see tests/e2e/README.md). Chromium with iPhone viewport/touch emulation is used because it is
 * what CI and this sandbox provide; it is NOT a substitute for real iPhone Safari testing, which is
 * tracked separately in docs/ACCEPTANCE_MATRIX.md.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100)

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'America/New_York',
    locale: 'en-US',
    // page.route() can't see requests a service worker handles; specs that test the worker
    // itself opt in with test.use({ serviceWorkers: 'allow' }).
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'iphone',
      use: { ...devices['iPhone 15'], browserName: 'chromium' },
    },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NFC_BABY_SILENT_LOGS: '1',
      APP_URL: `http://localhost:${PORT}`,
      SMS_PROVIDER: 'mock',
      MOCK_SMS_LOG_FILE: `${process.cwd()}/test-results/e2e-mock-sms.jsonl`,
      // Test-only token so signed-webhook handling can be exercised; never a real credential.
      TWILIO_AUTH_TOKEN: 'e2e-test-auth-token-not-real',
    },
  },
})
