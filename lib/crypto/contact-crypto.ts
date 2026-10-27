import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto'

/**
 * Pure AES-256-GCM / HMAC primitives for phone numbers, parameterised by the base64 master key.
 * Server code uses the env-bound wrappers in ./contacts.ts.
 */
export function deriveKeys(rawBase64: string) {
  const master = Buffer.from(rawBase64, 'base64')
  return {
    enc: Buffer.from(
      hkdfSync('sha256', master, Buffer.alloc(0), 'nfc-baby/contact-encryption/v1', 32),
    ),
    mac: Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'nfc-baby/contact-lookup/v1', 32)),
  }
}

export function encryptWithKey(e164: string, rawBase64: string): string {
  const { enc } = deriveKeys(rawBase64)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', enc, iv)
  const ct = Buffer.concat([cipher.update(e164, 'utf8'), cipher.final()])
  return [
    'v1',
    iv.toString('base64url'),
    ct.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join(':')
}

export function decryptWithKey(payload: string, rawBase64: string): string {
  const [version, iv, ct, tag] = payload.split(':')
  if (version !== 'v1' || !iv || !ct || !tag) throw new Error('unsupported contact ciphertext')
  const { enc } = deriveKeys(rawBase64)
  const decipher = createDecipheriv('aes-256-gcm', enc, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString(
    'utf8',
  )
}

export function hmacWithKey(e164: string, rawBase64: string): string {
  return createHmac('sha256', deriveKeys(rawBase64).mac).update(e164).digest('hex')
}

export function verificationHashWithKey(code: string, phoneMac: string, rawBase64: string): string {
  return createHmac('sha256', deriveKeys(rawBase64).mac)
    .update(`verify:${phoneMac}:${code}`)
    .digest('hex')
}
