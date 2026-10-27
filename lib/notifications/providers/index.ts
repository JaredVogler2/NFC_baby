import 'server-only'
import { hasContactKey } from '@/lib/crypto/contacts'
import { serverEnv } from '@/lib/env/server'
import { mockProvider } from './mock'
import { twilioProvider } from './twilio'
import type { SmsProvider } from './types'

const disabled: SmsProvider = {
  name: 'off',
  configured: false,
  async send() {
    return { kind: 'rejected', code: 'PROVIDER_DISABLED', retryable: false }
  },
}

/** The configured provider. SMS_PROVIDER defaults to "off": nothing can be sent. */
export function smsProvider(): SmsProvider {
  const env = serverEnv()
  switch (env.SMS_PROVIDER) {
    case 'twilio':
      return twilioProvider({
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
        apiBase: env.TWILIO_API_BASE,
      })
    case 'mock':
      return mockProvider()
    default:
      return disabled
  }
}

/** Automatic texting is possible only with a configured provider AND the contact encryption key. */
export function smsAvailability(): {
  available: boolean
  reason: string | null
  provider: SmsProvider['name']
} {
  const p = smsProvider()
  if (p.name === 'off')
    return {
      available: false,
      reason: 'Automatic texting is turned off for this site (SMS_PROVIDER=off).',
      provider: p.name,
    }
  if (!p.configured)
    return {
      available: false,
      reason: 'The text provider is not fully configured.',
      provider: p.name,
    }
  if (!hasContactKey())
    return {
      available: false,
      reason: 'CONTACT_ENCRYPTION_KEY is not set, so phone numbers cannot be stored.',
      provider: p.name,
    }
  return { available: true, reason: null, provider: p.name }
}
