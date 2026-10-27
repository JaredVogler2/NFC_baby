import { describe, expect, it } from 'vitest'
import { displayAmount, formatVolume, mlToOz, ozToMl, parseAmount, toMl } from '@/lib/domain/units'
import { normalizeNote } from '@/lib/domain/notes'
import { encodeBase32, generateTagToken, isTagToken, TOKEN_PATTERN } from '@/lib/nfc/token'

describe('volume units', () => {
  it('converts with the exact US fl oz definition', () => {
    expect(ozToMl(1)).toBe(29.5735)
    expect(ozToMl(3.5)).toBe(103.5074)
    expect(toMl(120, 'ml')).toBe(120)
    expect(mlToOz(ozToMl(3.5))).toBeCloseTo(3.5, 4)
  })

  it('round-trips oz → mL → oz display without drift', () => {
    for (const oz of [0.5, 1, 2.5, 3.5, 4, 6.5, 8]) {
      expect(formatVolume(ozToMl(oz), 'oz')).toBe(`${Number.isInteger(oz) ? oz : oz.toFixed(1)} oz`)
    }
    expect(formatVolume(120, 'oz')).toBe('4.1 oz')
    expect(formatVolume(103.5074, 'ml')).toBe('104 mL')
  })

  it('shows the entered value exactly when units match, converts otherwise', () => {
    const a = { ml: 103.5074, enteredValue: 3.5, enteredUnit: 'oz' as const, unknown: false }
    expect(displayAmount(a, 'oz')).toBe('3.5 oz')
    expect(displayAmount(a, 'ml')).toBe('104 mL')
    expect(
      displayAmount({ ml: null, enteredValue: null, enteredUnit: null, unknown: true }, 'oz'),
    ).toBe('amount not measured')
  })

  it('parses typed amounts strictly', () => {
    expect(parseAmount('3.5')).toBe(3.5)
    expect(parseAmount(' 3,5 ')).toBe(3.5)
    expect(parseAmount('120')).toBe(120)
    for (const bad of ['', '0', '-1', 'abc', '1e3', '123456789', 'NaN', '3.555']) {
      expect(parseAmount(bad)).toBeNull()
    }
  })
})

describe('notes', () => {
  it('normalises whitespace and strips control characters', () => {
    expect(normalizeNote('  leak \t at   side  ')).toBe('leak at side')
    expect(normalizeNote('a\r\n\r\n\r\n\r\nb')).toBe('a\n\nb')
    expect(normalizeNote('x\u0000y​z')).toBe('xyz')
    expect(normalizeNote('   ')).toBeNull()
    expect(normalizeNote(null)).toBeNull()
  })

  it('does not interpret HTML (kept as text; React escapes on render)', () => {
    expect(normalizeNote('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('tag tokens', () => {
  it('are 26 chars of Crockford base32 with 128 bits of entropy', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const t = generateTagToken()
      expect(t).toMatch(TOKEN_PATTERN)
      seen.add(t)
    }
    expect(seen.size).toBe(2000)
  })

  it('encodes deterministically and never uses ambiguous letters', () => {
    expect(encodeBase32(new Uint8Array(16))).toBe('0'.repeat(26))
    expect(encodeBase32(new Uint8Array(16).fill(255))).toBe('zzzzzzzzzzzzzzzzzzzzzzzzzw')
    expect(isTagToken('ilou'.repeat(6) + 'ab')).toBe(false)
    expect(isTagToken('../../etc/passwd')).toBe(false)
  })
})
