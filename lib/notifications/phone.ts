/**
 * Phone numbers are normalised to E.164 before encryption so the same number always produces the
 * same lookup HMAC. Only US/Canada (+1, NANP) mobile numbers are accepted: texts are sent through
 * a US A2P 10DLC registration, and refusing other country codes also stops verification codes
 * being pumped to international or premium-rate numbers.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim()
  const digits = trimmed.replace(/[^\d]/g, '')
  const nanp = /^[2-9]\d{2}[2-9]\d{6}$/
  if (trimmed.startsWith('+')) {
    return digits.length === 11 && digits.startsWith('1') && nanp.test(digits.slice(1))
      ? `+${digits}`
      : null
  }
  if (digits.length === 10 && nanp.test(digits)) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1') && nanp.test(digits.slice(1)))
    return `+${digits}`
  return null
}

export function last4(e164: string): string {
  return e164.slice(-4)
}

export function maskPhone(last: string | null | undefined): string {
  return last ? `•••• ${last}` : 'No number'
}
