import { describe, expect, it } from 'vitest'
import { loginUrlFor, safeNextPath } from '@/lib/auth/redirect'

describe('safeNextPath', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/t/k3x9abcd', '/t/k3x9abcd'],
    ['/history?type=FEED', '/history?type=FEED'],
    ['/settings/tags/123', '/settings/tags/123'],
    ['/invite/abc', '/invite/abc'],
  ])('allows internal app path %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected)
  })

  it.each([
    'https://evil.example/t/x',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/%2F%2Fevil.example',
    'javascript:alert(1)',
    '/api/v1/events',
    '/t/',
    '/dashboardx',
    '/login',
    '',
    '/t/abc\n',
    'x'.repeat(600),
  ])('rejects %s', (input) => {
    expect(safeNextPath(input)).toBe('/dashboard')
  })

  it('rejects non-strings', () => {
    expect(safeNextPath(undefined)).toBe('/dashboard')
    expect(safeNextPath(['/t/a'])).toBe('/dashboard')
  })

  it('builds an encoded login URL', () => {
    expect(loginUrlFor('/t/abc123')).toBe('/login?next=%2Ft%2Fabc123')
  })
})
