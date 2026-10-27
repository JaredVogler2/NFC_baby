import { existsSync, readFileSync } from 'node:fs'
import { vi } from 'vitest'

// Integration tests talk to the real local Supabase stack. Load .env.local (written by
// scripts/write-local-env.mjs) without overriding variables already set (CI sets them directly).
const file = process.env.NFC_BABY_ENV_FILE ?? '.env.local'
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && process.env[match[1]!] === undefined) process.env[match[1]!] = match[2]
  }
}
process.env.NFC_BABY_SILENT_LOGS = '1'
vi.mock('server-only', () => ({}))

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Integration tests need a running local Supabase: run `npm run db:start` then `node scripts/write-local-env.mjs`.',
  )
}
