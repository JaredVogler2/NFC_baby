import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decryptPhone, encryptPhone, hashVerificationCode, phoneHmac } from '@/lib/crypto/contacts'
import { backoffSeconds } from '@/lib/notifications/dispatch'
import { last4, maskPhone, normalizePhone } from '@/lib/notifications/phone'
import { mockProvider } from '@/lib/notifications/providers/mock'
import { twilioProvider } from '@/lib/notifications/providers/twilio'
import { isValidTwilioSignature, twilioSignature } from '@/lib/notifications/twilio-signature'

const KEY_A = Buffer.alloc(32, 7).toString('base64')
const KEY_B = Buffer.alloc(32, 9).toString('base64')

describe('phone numbers', () => {
  it.each([
    ['(201) 555-0101', '+12015550101'],
    ['201.555.0101', '+12015550101'],
    ['1 201 555 0101', '+12015550101'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('normalises %s', (input, e164) => {
    expect(normalizePhone(input)).toBe(e164)
  })
  it.each(['555-0101', '123', '+0123456789', '011 555 555 5555', 'call me', '(055) 555-0101'])(
    'rejects %s',
    (input) => {
      expect(normalizePhone(input)).toBeNull()
    },
  )
  it('masks to the last four digits only', () => {
    expect(last4('+12015550101')).toBe('0101')
    expect(maskPhone('0101')).toBe('•••• 0101')
    expect(maskPhone(null)).toBe('No number')
  })
})

describe('contact encryption', () => {
  it('round-trips, uses a fresh IV each time, and never contains the number', () => {
    const a = encryptPhone('+12015550101', KEY_A)
    const b = encryptPhone('+12015550101', KEY_A)
    expect(a).not.toBe(b)
    expect(a).not.toContain('2015550101')
    expect(a).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/)
    expect(decryptPhone(a, KEY_A)).toBe('+12015550101')
  })
  it('detects tampering and wrong keys', () => {
    const c = encryptPhone('+12015550101', KEY_A)
    const parts = c.split(':')
    parts[2] = parts[2]!.slice(0, -2) + (parts[2]!.endsWith('A') ? 'B' : 'A') + parts[2]!.slice(-1)
    expect(() => decryptPhone(parts.join(':'), KEY_A)).toThrow()
    expect(() => decryptPhone(c, KEY_B)).toThrow()
  })
  it('lookup HMAC is stable per key and differs across keys; codes are bound to the number', () => {
    expect(phoneHmac('+12015550101', KEY_A)).toBe(phoneHmac('+12015550101', KEY_A))
    expect(phoneHmac('+12015550101', KEY_A)).not.toBe(phoneHmac('+12015550101', KEY_B))
    expect(phoneHmac('+12015550101', KEY_A)).toMatch(/^[0-9a-f]{64}$/)
    const mac = phoneHmac('+12015550101', KEY_A)
    expect(hashVerificationCode('123456', mac, KEY_A)).not.toBe(
      hashVerificationCode('123456', phoneHmac('+12015550102', KEY_A), KEY_A),
    )
  })
})

describe('Twilio webhook signatures', () => {
  const params = {
    CallSid: 'CA1234567890ABCDE',
    Caller: '+12349013030',
    Digits: '1234',
    From: '+12349013030',
    To: '+18005551212',
  }
  const url = 'https://mycompany.com/myapp.php?foo=1&bar=2'
  it('matches the published reference vector (cross-checked with Python hmac)', () => {
    expect(twilioSignature('12345', url, params)).toBe('0/KCTR6DLpKmkAf8muzZqo1nDgQ=')
    expect(isValidTwilioSignature('12345', url, params, '0/KCTR6DLpKmkAf8muzZqo1nDgQ=')).toBe(true)
  })
  it('rejects a missing, forged or replayed-to-another-URL signature', () => {
    expect(isValidTwilioSignature('12345', url, params, null)).toBe(false)
    expect(isValidTwilioSignature('12345', url, params, 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=')).toBe(false)
    expect(
      isValidTwilioSignature('12345', `${url}&x=1`, params, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='),
    ).toBe(false)
    expect(
      isValidTwilioSignature(
        '12345',
        url,
        { ...params, Digits: '9' },
        '0/KCTR6DLpKmkAf8muzZqo1nDgQ=',
      ),
    ).toBe(false)
  })
})

describe('retry backoff', () => {
  it('grows and is jittered within +20%', () => {
    expect(backoffSeconds(1, () => 0)).toBe(30)
    expect(backoffSeconds(2, () => 0)).toBe(120)
    expect(backoffSeconds(3, () => 0)).toBe(600)
    expect(backoffSeconds(9, () => 0)).toBe(600)
    expect(backoffSeconds(1, () => 1)).toBe(36)
  })
})

describe('mock provider (tests only)', () => {
  it('selects behaviour by fictional 555-01xx numbers and refuses on Vercel', async () => {
    const p = mockProvider()
    expect((await p.send({ to: '+12015550101', body: 'x' })).kind).toBe('accepted')
    expect(await p.send({ to: '+12015550199', body: 'x' })).toMatchObject({
      kind: 'rejected',
      retryable: false,
    })
    expect((await p.send({ to: '+12015550198', body: 'x' })).kind).toBe('unknown')
    expect(await p.send({ to: '+12015550197', body: 'x' })).toMatchObject({
      kind: 'rejected',
      retryable: true,
    })
    expect(await p.send({ to: '+12015550196', body: 'x' })).toMatchObject({ optedOut: true })
    process.env.VERCEL = '1'
    try {
      expect(mockProvider().configured).toBe(false)
    } finally {
      delete process.env.VERCEL
    }
  })
})

describe('Twilio adapter classification (against a local fake API)', () => {
  let server: Server
  let base = ''
  let next: { status: number; body?: unknown; hang?: boolean } = { status: 201 }
  const requests: { auth: string | undefined; form: URLSearchParams; path: string }[] = []

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        requests.push({
          auth: req.headers.authorization,
          form: new URLSearchParams(raw),
          path: req.url ?? '',
        })
        if (next.hang) return // never respond → client timeout
        res.writeHead(next.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(next.body ?? {}))
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => {
    server.closeAllConnections()
    server.close()
  })

  const provider = () =>
    twilioProvider({
      accountSid: 'AC00000000000000000000000000000000',
      authToken: 'test-token-not-real',
      messagingServiceSid: 'MG00000000000000000000000000000000',
      apiBase: base,
      timeoutMs: 300,
    })

  it('sends one form-encoded request with basic auth and status callback', async () => {
    next = { status: 201, body: { sid: 'SM123', status: 'queued' } }
    const out = await provider().send({
      to: '+12015550101',
      body: 'Baby update: x',
      statusCallbackUrl: 'https://app.example/cb',
    })
    expect(out).toEqual({ kind: 'accepted', messageId: 'SM123', status: 'queued' })
    const req = requests.at(-1)!
    expect(req.path).toBe('/2010-04-01/Accounts/AC00000000000000000000000000000000/Messages.json')
    expect(req.auth).toBe(
      `Basic ${Buffer.from('AC00000000000000000000000000000000:test-token-not-real').toString('base64')}`,
    )
    expect(Object.fromEntries(req.form)).toEqual({
      To: '+12015550101',
      MessagingServiceSid: 'MG00000000000000000000000000000000',
      Body: 'Baby update: x',
      StatusCallback: 'https://app.example/cb',
    })
  })

  it.each([
    [
      { status: 400, body: { code: 21211 } },
      { kind: 'rejected', retryable: false, code: '21211' },
    ],
    [
      { status: 400, body: { code: 21610 } },
      { kind: 'rejected', retryable: false, optedOut: true },
    ],
    [
      { status: 429, body: { code: 20429 } },
      { kind: 'rejected', retryable: true },
    ],
    [
      { status: 503, body: {} },
      { kind: 'rejected', retryable: true },
    ],
    [{ status: 500, body: {} }, { kind: 'unknown' }],
    [
      { status: 401, body: { code: 20003 } },
      { kind: 'rejected', retryable: false, code: 'AUTH_20003' },
    ],
    [
      { status: 201, body: {} },
      { kind: 'unknown', code: 'NO_SID' },
    ],
    [
      { status: 201, hang: true },
      { kind: 'unknown', code: 'TIMEOUT' },
    ],
  ])('%j → %j', async (response, expected) => {
    next = response
    expect(await provider().send({ to: '+12015550101', body: 'x' })).toMatchObject(expected)
  })

  it('a refused connection (never sent) is retryable', async () => {
    // A port that was just closed: the TCP connection is refused before anything is sent.
    const tmp = createServer()
    await new Promise<void>((r) => tmp.listen(0, '127.0.0.1', r))
    const port = (tmp.address() as AddressInfo).port
    await new Promise<void>((r) => tmp.close(() => r()))
    const p = twilioProvider({
      accountSid: 'AC00000000000000000000000000000000',
      authToken: 'test-token-not-real',
      messagingServiceSid: 'MG00000000000000000000000000000000',
      apiBase: `http://127.0.0.1:${port}`,
    })
    expect(await p.send({ to: '+12015550101', body: 'x' })).toMatchObject({
      kind: 'rejected',
      retryable: true,
    })
  })

  it('reports not configured without credentials', async () => {
    const p = twilioProvider({})
    expect(p.configured).toBe(false)
    expect(await p.send({ to: '+1', body: 'x' })).toMatchObject({
      kind: 'rejected',
      code: 'PROVIDER_NOT_CONFIGURED',
    })
  })
})
