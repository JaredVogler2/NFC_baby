import type { SendOutcome, SmsProvider } from './types'

const PERMANENT = new Set([
  '21211',
  '21212',
  '21214',
  '21217',
  '21219',
  '21401',
  '21407',
  '21408',
  '21421',
  '21601',
  '21602',
  '21603',
  '21604',
  '21605',
  '21606',
  '21608',
  '21612',
  '21614',
  '21617',
  '21619',
  '21620',
  '21621',
  '21705',
  '21703',
  '30007',
])

/** Network errors that mean the request never left this machine (safe to retry). */
const NOT_SENT = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'CERT_HAS_EXPIRED',
  'UND_ERR_CONNECT_TIMEOUT',
])

/**
 * Twilio Programmable Messaging over plain REST (no SDK). Separate request per recipient.
 * Classification is deliberately conservative: anything that might have been accepted is
 * reported as `unknown` and never retried automatically (no duplicate texts).
 */
export function twilioProvider(cfg: {
  accountSid?: string
  authToken?: string
  messagingServiceSid?: string
  apiBase?: string
  timeoutMs?: number
}): SmsProvider {
  const configured = Boolean(cfg.accountSid && cfg.authToken && cfg.messagingServiceSid)
  return {
    name: 'twilio',
    configured,
    async send({ to, body, statusCallbackUrl }): Promise<SendOutcome> {
      if (!configured)
        return { kind: 'rejected', code: 'PROVIDER_NOT_CONFIGURED', retryable: false }
      const base = (cfg.apiBase ?? 'https://api.twilio.com').replace(/\/$/, '')
      const form = new URLSearchParams({
        To: to,
        MessagingServiceSid: cfg.messagingServiceSid!,
        Body: body,
      })
      if (statusCallbackUrl) form.set('StatusCallback', statusCallbackUrl)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 10_000)
      let res: Response
      try {
        res = await fetch(`${base}/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form,
          signal: controller.signal,
        })
      } catch (err) {
        clearTimeout(timer)
        const code = (err as { cause?: { code?: string } })?.cause?.code ?? ''
        if (NOT_SENT.has(code)) return { kind: 'rejected', code: `NET_${code}`, retryable: true }
        return {
          kind: 'unknown',
          code: controller.signal.aborted ? 'TIMEOUT' : `NET_${code || 'ERROR'}`,
        }
      }
      let payload: Record<string, unknown> = {}
      try {
        // The timeout also covers reading the body (a stalled body must not outlive the lease).
        payload = (await res.json()) as Record<string, unknown>
      } catch {
        payload = {}
      } finally {
        clearTimeout(timer)
      }
      if (res.status === 201 || res.status === 200) {
        const sid = typeof payload.sid === 'string' ? payload.sid : null
        if (!sid) return { kind: 'unknown', code: 'NO_SID' }
        return { kind: 'accepted', messageId: sid, status: String(payload.status ?? 'queued') }
      }
      const code = payload.code !== undefined ? String(payload.code) : `HTTP_${res.status}`
      if (code === '21610') return { kind: 'rejected', code, retryable: false, optedOut: true }
      if (res.status === 429 || res.status === 503)
        return { kind: 'rejected', code, retryable: true }
      if (res.status >= 500) return { kind: 'unknown', code }
      if (res.status === 401 || res.status === 403)
        return { kind: 'rejected', code: `AUTH_${code}`, retryable: false }
      return { kind: 'rejected', code, retryable: !PERMANENT.has(code) && res.status !== 400 }
    },
  }
}
