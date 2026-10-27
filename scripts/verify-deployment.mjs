#!/usr/bin/env node
// Read-only checks of a deployed NFC Baby site. Creates nothing, logs in as nobody.
//
//   node scripts/verify-deployment.mjs https://your-domain.example
//
// Exit code 0 = every check passed. Prints only pass/fail lines (no response bodies).
const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/verify-deployment.mjs https://your-domain.example')
  process.exit(2)
}
const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)/.test(base)
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail })

async function get(path, init = {}) {
  return fetch(`${base}${path}`, { redirect: 'manual', ...init })
}

const fakeToken = '0000000000000000000000zzzz' // valid shape, never issued

try {
  const health = await get('/api/health')
  const body = await health.json().catch(() => ({}))
  check('health endpoint answers', health.status === 200 && body.ok === true)
  check('database configured (Supabase env vars present)', body.configured === true)
  check('health reveals nothing else', Object.keys(body).sort().join() === 'configured,ok')

  const login = await get('/login')
  const h = login.headers
  check('sign-in page loads', login.status === 200)
  check(
    'Content-Security-Policy with nonce',
    /script-src[^;]*'nonce-/.test(h.get('content-security-policy') ?? ''),
  )
  check('X-Frame-Options DENY', h.get('x-frame-options') === 'DENY')
  check('nosniff', h.get('x-content-type-options') === 'nosniff')
  check('Referrer-Policy same-origin', h.get('referrer-policy') === 'same-origin')
  check('noindex header', /noindex/.test(h.get('x-robots-tag') ?? ''))
  check('pages are not cached', /no-store/.test(h.get('cache-control') ?? ''))
  if (!isLocal) {
    check('HSTS', /max-age=\d+/.test(h.get('strict-transport-security') ?? ''))
    check('served over HTTPS', base.startsWith('https://'))
    const http = await fetch(base.replace('https://', 'http://') + '/login', { redirect: 'manual' })
    check('HTTP redirects to HTTPS', [301, 302, 307, 308].includes(http.status))
  }

  const tag = await get(`/t/${fakeToken}`)
  const tagHtml = await tag.text()
  check(
    'sticker URL shows the sign-in gate when signed out',
    tag.status === 200 && /Sign in/i.test(tagHtml),
  )
  check('sticker page is not cached', /no-store/.test(tag.headers.get('cache-control') ?? ''))

  const me = await get('/api/v1/me')
  check('family API requires sign-in', me.status === 401)
  const post = await get('/api/v1/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: '{}',
  })
  check('cross-site writes refused', post.status === 403)
  const cron = await get('/api/v1/notifications/dispatch')
  check(
    'text dispatcher not public (404 when unset, 401 without secret)',
    [401, 404].includes(cron.status),
  )

  const manifest = await get('/manifest.webmanifest')
  const m = await manifest.json().catch(() => ({}))
  check('web app manifest', manifest.status === 200 && m.name === 'NFC Baby')
  const sw = await get('/sw.js')
  check('service worker script', sw.status === 200 && /nfcb-static/.test(await sw.text()))
  check('icons', (await get('/icons/icon-192.png')).status === 200)
} catch (e) {
  check('site reachable', false, e instanceof Error ? e.message : String(e))
}

let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} checks passed for ${base}`)
process.exit(failed ? 1 : 0)
