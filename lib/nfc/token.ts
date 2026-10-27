/**
 * Opaque NFC tag tokens: 128 bits from a CSPRNG, Crockford base32 (lowercase, no i/l/o/u so a
 * printed token can't be misread), 26 characters. A token is a pointer, not a credential.
 */
export const TOKEN_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
export const TOKEN_PATTERN = /^[0-9a-hjkmnp-tv-z]{26}$/

export function encodeBase32(bytes: Uint8Array): string {
  let out = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += TOKEN_ALPHABET[(buffer >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += TOKEN_ALPHABET[(buffer << (5 - bits)) & 31]
  return out
}

export function generateTagToken(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return encodeBase32(bytes)
}

export function isTagToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

export function tagUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/t/${token}`
}
