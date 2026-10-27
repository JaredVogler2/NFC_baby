import 'server-only'
import { z } from 'zod'

/**
 * Server-only configuration. Nothing here may be imported by client components (enforced by
 * `server-only`). Values are validated once per process; invalid optional integrations are reported
 * as "not configured" rather than crashing the app, so logging keeps working without them.
 */

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded')

const schema = z.object({
  APP_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SMS_PROVIDER: z.enum(['off', 'twilio', 'mock']).default('off'),
  TWILIO_ACCOUNT_SID: z
    .string()
    .regex(/^AC[0-9a-f]{32}$/)
    .optional(),
  TWILIO_AUTH_TOKEN: z.string().min(16).optional(),
  TWILIO_MESSAGING_SERVICE_SID: z
    .string()
    .regex(/^MG[0-9a-f]{32}$/)
    .optional(),
  TWILIO_API_BASE: z.url().optional(),
  CRON_SECRET: z.string().min(32).optional(),
  CONTACT_ENCRYPTION_KEY: base64Key.optional(),
  BOOTSTRAP_OWNER_EMAIL: z.email().optional(),
  /** Seconds between sign-in code requests for one address (same for members and strangers). */
  AUTH_CODE_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
})

export type ServerEnv = z.infer<typeof schema>

let cached: { env: ServerEnv; problems: string[] } | null = null

function emptyToUndefined(record: Record<string, string | undefined>) {
  const out: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(record)) out[k] = v === '' ? undefined : v
  return out
}

export function loadServerEnv(): { env: ServerEnv; problems: string[] } {
  if (cached && process.env.NODE_ENV !== 'test') return cached
  const raw = emptyToUndefined({
    APP_URL: process.env.APP_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SMS_PROVIDER: process.env.SMS_PROVIDER,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID,
    TWILIO_API_BASE: process.env.TWILIO_API_BASE,
    CRON_SECRET: process.env.CRON_SECRET,
    CONTACT_ENCRYPTION_KEY: process.env.CONTACT_ENCRYPTION_KEY,
    BOOTSTRAP_OWNER_EMAIL: process.env.BOOTSTRAP_OWNER_EMAIL,
    AUTH_CODE_COOLDOWN_SECONDS: process.env.AUTH_CODE_COOLDOWN_SECONDS,
  })
  const problems: string[] = []
  const result = schema.safeParse(raw)
  let env: ServerEnv
  if (result.success) {
    env = result.data
  } else {
    // Drop only the invalid keys (names only, never values) and keep the rest.
    const bad = new Set(result.error.issues.map((i) => String(i.path[0])))
    for (const key of bad) problems.push(`${key} is invalid`)
    const cleaned = Object.fromEntries(Object.entries(raw).filter(([k]) => !bad.has(k)))
    env = schema.parse(cleaned)
  }
  cached = { env, problems }
  return cached
}

export function serverEnv(): ServerEnv {
  return loadServerEnv().env
}

/** Canonical origin used in tag URLs, email links and SMS links. */
export function appOrigin(requestUrl?: string): string {
  const configured = serverEnv().APP_URL
  if (configured) return new URL(configured).origin
  if (requestUrl) return new URL(requestUrl).origin
  return 'http://localhost:3000'
}
