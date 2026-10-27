#!/usr/bin/env node
// Fails if the repository or the browser build contains secrets or real-looking phone numbers.
//
//   node scripts/check-secrets.mjs           # git-tracked files + .next/static (if built)
//
// Checks
//   - git-tracked text files: private keys, Twilio SIDs/tokens, Supabase secret keys, service-role
//     JWTs, and phone numbers outside the fictional 555-01xx range
//   - .next/static (what browsers download): the same, plus the literal values of server-only
//     environment variables (from the environment or .env.local) and any source maps
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Values that look like phone numbers but are documented test vectors. */
const ALLOWED_NUMBERS = new Set([
  // Twilio's published request-signature example (tests/unit/notifications.test.ts must use the
  // exact parameters for the documented signature to match).
  '+12349013030',
  '+18005551212',
])

const PATTERNS = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  // All-zero SIDs are obvious placeholders used by the adapter tests.
  ['Twilio account SID', /\bAC(?!0{32}\b)[0-9a-f]{32}\b/],
  ['Twilio API key SID', /\bSK(?!0{32}\b)[0-9a-f]{32}\b/],
  ['Twilio auth token assignment', /TWILIO_AUTH_TOKEN\s*[=:]\s*['"]?[0-9a-f]{32}\b/],
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{16,}/],
]

const PHONE =
  /(?<![\w.])(\+1[\s.-]?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\(?[2-9]\d{2}\)[\s.-]?\d{3}[\s.-]\d{4})(?![\w.])/g

function fictional(raw) {
  const digits = raw.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  // NANP fictional range: 555-0100 … 555-0199 (any area code).
  return digits.slice(3, 6) === '555' && digits.slice(6, 8) === '01'
}

function jwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    return payload.role ?? null
  } catch {
    return null
  }
}

function scanText(label, text, problems, extraSecrets = []) {
  for (const [name, re] of PATTERNS) {
    if (re.test(text)) problems.push(`${label}: ${name}`)
  }
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    if (jwtRole(m[0]) === 'service_role') problems.push(`${label}: service-role JWT`)
  }
  for (const m of text.matchAll(PHONE)) {
    const raw = m[1].trim()
    const e164 = `+1${raw.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')}`
    if (!fictional(raw) && !ALLOWED_NUMBERS.has(e164))
      problems.push(`${label}: phone number ${raw}`)
  }
  for (const [name, value] of extraSecrets) {
    if (text.includes(value)) problems.push(`${label}: value of ${name}`)
  }
}

function localEnv() {
  const env = { ...process.env }
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && env[m[1]] === undefined) env[m[1]] = m[2]
    }
  }
  return env
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const problems = []
const BINARY = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|zip|pdf)$/i

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((f) => f && !BINARY.test(f) && f !== 'package-lock.json' && existsSync(f))
for (const file of tracked) scanText(file, readFileSync(file, 'utf8'), problems)

const SERVER_ONLY = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'CONTACT_ENCRYPTION_KEY',
  'CRON_SECRET',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_ACCOUNT_SID',
]
const env = localEnv()
const secrets = SERVER_ONLY.map((k) => [k, env[k]]).filter(([, v]) => v && v.length >= 8)
let built = 0
if (existsSync('.next/static')) {
  for (const file of walk('.next/static')) {
    if (file.endsWith('.map')) problems.push(`${file}: source map in browser build`)
    if (BINARY.test(file)) continue
    built++
    scanText(file, readFileSync(file, 'utf8'), problems, secrets)
  }
}

if (problems.length) {
  console.error(`Secret scan FAILED (${problems.length}):\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(
  `Secret scan passed: ${tracked.length} tracked files, ${built} browser build files, ` +
    `${secrets.length} server-only values checked.`,
)
