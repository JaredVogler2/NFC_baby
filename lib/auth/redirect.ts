/**
 * Allowlisted internal redirects for "return to where I was" after sign-in.
 * Anything that is not a same-origin path under a known app section falls back to the dashboard,
 * which prevents open redirects (`//evil.com`, `/\evil.com`, `https://…`, encoded tricks).
 */

const ALLOWED_PREFIXES = [
  '/dashboard',
  '/history',
  '/settings',
  '/t/',
  '/log/',
  '/saved/',
  '/invite/',
  '/setup',
] as const

const DUMMY_ORIGIN = 'https://nfc-baby.invalid'

export function safeNextPath(input: unknown, fallback = '/dashboard'): string {
  if (typeof input !== 'string') return fallback
  if (input.length === 0 || input.length > 512) return fallback
  if (!input.startsWith('/') || input.startsWith('//')) return fallback
  // Backslashes and control characters are normalised differently by browsers; reject them.
  if (/[\\\u0000-\u001f\u007f]/.test(input)) return fallback
  let url: URL
  try {
    url = new URL(input, DUMMY_ORIGIN)
  } catch {
    return fallback
  }
  if (url.origin !== DUMMY_ORIGIN) return fallback
  const path = url.pathname
  const allowed = ALLOWED_PREFIXES.some((prefix) =>
    prefix.endsWith('/')
      ? path.startsWith(prefix) && path.length > prefix.length
      : path === prefix || path.startsWith(`${prefix}/`),
  )
  if (!allowed) return fallback
  return `${url.pathname}${url.search}`
}

export function loginUrlFor(nextPath: string): string {
  return `/login?next=${encodeURIComponent(safeNextPath(nextPath))}`
}
