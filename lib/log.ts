/**
 * Privacy-preserving structured logger.
 *
 * Only allowlisted fields are written, and string values must look like codes/paths (no free
 * text). Request bodies, notes, names, emails and phone numbers can therefore never reach Vercel
 * logs through this module, even by mistake. Error objects are reduced to their class name and a
 * code-like `code` property; their messages (which may embed SQL values) are dropped.
 */

export type LogFields = {
  route?: string
  method?: string
  status?: number
  ms?: number
  code?: string
  event?: string
  count?: number
  attempt?: number
  state?: string
  provider?: string
}

const ALLOWED = new Set<keyof LogFields>([
  'route',
  'method',
  'status',
  'ms',
  'code',
  'event',
  'count',
  'attempt',
  'state',
  'provider',
])

const SAFE_STRING = /^[A-Za-z0-9_.:/\-[\]]{0,80}$/
// Opaque tag tokens and UUIDs in routes are redacted so logs cannot be joined to a household.
const TOKENISH = /\/(t|tags|events|invite|saved|history)\/[A-Za-z0-9-]{8,}/g

export function sanitizeFields(fields: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED.has(key as keyof LogFields)) continue
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof value === 'boolean') out[key] = value
    else if (typeof value === 'string') {
      const redacted = value.replace(TOKENISH, '/$1/:id')
      out[key] = SAFE_STRING.test(redacted) ? redacted : '[redacted]'
    }
  }
  return out
}

export function errorCode(err: unknown): string {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string' && SAFE_STRING.test(code)) return code
    const name = (err as { name?: unknown }).name
    if (typeof name === 'string' && SAFE_STRING.test(name)) return name
  }
  return 'UNKNOWN'
}

function write(level: 'info' | 'warn' | 'error', msg: string, fields?: LogFields) {
  if (process.env.NFC_BABY_SILENT_LOGS === '1') return
  const line = JSON.stringify({
    level,
    msg: SAFE_STRING.test(msg) ? msg : '[redacted]',
    ...sanitizeFields(fields),
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

export const log = {
  info: (msg: string, fields?: LogFields) => write('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => write('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => write('error', msg, fields),
}
