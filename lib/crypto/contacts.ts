import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { serverEnv } from '@/lib/env/server'
import { ApiError } from '@/lib/http/errors'
import {
  decryptWithKey,
  encryptWithKey,
  hmacWithKey,
  verificationHashWithKey,
} from './contact-crypto'

/**
 * Application-layer encryption for parent phone numbers (AES-256-GCM, HKDF-derived sub-keys).
 * The database only ever holds `v1:<iv>:<ciphertext>:<tag>` plus a keyed HMAC used to match
 * inbound STOP messages. The key comes from CONTACT_ENCRYPTION_KEY (server-only).
 */
function key(raw?: string): string {
  const value = raw ?? serverEnv().CONTACT_ENCRYPTION_KEY
  if (!value)
    throw new ApiError(
      'NOT_CONFIGURED',
      'Texting is not set up on this site (missing encryption key).',
    )
  return value
}

export function hasContactKey(): boolean {
  return Boolean(serverEnv().CONTACT_ENCRYPTION_KEY)
}

export const encryptPhone = (e164: string, raw?: string) => encryptWithKey(e164, key(raw))
export const decryptPhone = (payload: string, raw?: string) => decryptWithKey(payload, key(raw))
export const phoneHmac = (e164: string, raw?: string) => hmacWithKey(e164, key(raw))
export const hashVerificationCode = (code: string, phoneMac: string, raw?: string) =>
  verificationHashWithKey(code, phoneMac, key(raw))

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
