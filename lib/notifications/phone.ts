/**
 * Phone numbers are normalised to E.164 before encryption so the same number always produces the
 * same lookup HMAC. US numbers may be typed without the country code.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim()
  const digits = trimmed.replace(/[^\d]/g, '')
  if (trimmed.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0')
      ? `+${digits}`
      : null
  }
  if (digits.length === 10 && /^[2-9]\d{2}[2-9]/.test(digits)) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1') && /^1[2-9]\d{2}[2-9]/.test(digits))
    return `+${digits}`
  return null
}

export function last4(e164: string): string {
  return e164.slice(-4)
}

export function maskPhone(last: string | null | undefined): string {
  return last ? `•••• ${last}` : 'No number'
}
