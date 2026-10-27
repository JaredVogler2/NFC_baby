import { describe, expect, it } from 'vitest'
import { errorCode, sanitizeFields } from '@/lib/log'

describe('log sanitizer', () => {
  it('keeps only allowlisted, code-like fields', () => {
    const out = sanitizeFields({
      route: '/api/v1/events',
      status: 201,
      notes: 'baby spit up',
      phone: '+15555550100',
      email: 'mom@example.com',
      body: { notes: 'x' },
    })
    expect(out).toEqual({ route: '/api/v1/events', status: 201 })
  })

  it('redacts free text in allowed string fields', () => {
    expect(sanitizeFields({ code: 'Juniper had a rash' })).toEqual({ code: '[redacted]' })
  })

  it('redacts opaque ids in routes', () => {
    expect(sanitizeFields({ route: '/t/k3x9abcdefghjkmnpqrstvwxyz' })).toEqual({ route: '/t/:id' })
    expect(
      sanitizeFields({ route: '/api/v1/events/0b8e0d1c-6a49-4c1e-9d55-7f3b0a1d2e3f/void' }),
    ).toEqual({ route: '/api/v1/events/:id/void' })
  })

  it('reduces errors to a code, dropping messages', () => {
    expect(errorCode({ code: '23505', message: 'Key (notes)=(secret) already exists' })).toBe(
      '23505',
    )
    expect(errorCode(new TypeError('phone +1555 invalid'))).toBe('TypeError')
    expect(errorCode('oops')).toBe('UNKNOWN')
  })
})
