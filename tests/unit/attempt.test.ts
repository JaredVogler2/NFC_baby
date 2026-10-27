import { describe, expect, it } from 'vitest'
import {
  ATTEMPT_TTL_MS,
  clearSnapshot,
  loadSnapshot,
  saveSnapshot,
  storageKey,
  type FormState,
} from '@/lib/logging/attempt'
import { presetValue, resolveWhen } from '@/components/logging/TimePicker'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  }
}

const form = { whenMode: 'now', notes: 'leak' } as FormState

describe('save-attempt snapshots', () => {
  it('round-trips for the same user and form', () => {
    const s = memoryStorage()
    saveSnapshot(
      s,
      { userId: 'u1', formKey: 'tag:abc', clientRequestId: 'k1', sent: true, form },
      1000,
    )
    expect(loadSnapshot(s, 'u1', 'tag:abc', 2000)).toMatchObject({
      clientRequestId: 'k1',
      sent: true,
      form,
    })
  })

  it('is never visible to a different signed-in user on the same phone', () => {
    const s = memoryStorage()
    saveSnapshot(
      s,
      { userId: 'mom', formKey: 'tag:abc', clientRequestId: 'k1', sent: true, form },
      1000,
    )
    expect(loadSnapshot(s, 'dad', 'tag:abc', 2000)).toBeNull()
    // Even if someone copies the storage key, the embedded user id must match.
    s.setItem(storageKey('dad', 'tag:abc'), s.getItem(storageKey('mom', 'tag:abc'))!)
    expect(loadSnapshot(s, 'dad', 'tag:abc', 2000)).toBeNull()
  })

  it('expires and can be cleared', () => {
    const s = memoryStorage()
    saveSnapshot(s, { userId: 'u1', formKey: 'f', clientRequestId: 'k1', sent: false, form }, 0)
    expect(loadSnapshot(s, 'u1', 'f', ATTEMPT_TTL_MS + 1)).toBeNull()
    saveSnapshot(s, { userId: 'u1', formKey: 'f', clientRequestId: 'k2', sent: false, form }, 0)
    clearSnapshot(s, 'u1', 'f')
    expect(loadSnapshot(s, 'u1', 'f', 1)).toBeNull()
  })

  it('tolerates missing or broken storage', () => {
    expect(loadSnapshot(null, 'u', 'f')).toBeNull()
    const s = memoryStorage()
    s.setItem(storageKey('u', 'f'), '{not json')
    expect(loadSnapshot(s, 'u', 'f')).toBeNull()
  })
})

describe('time picker resolution', () => {
  const NY = 'America/New_York'
  const now = Date.parse('2026-10-27T06:20:00Z') // 2:20 AM EDT

  it('"Now" leaves the time to the server', () => {
    expect(
      resolveWhen({ mode: 'now', date: '', time: '', ambiguityChoice: 0 }, NY, now),
    ).toMatchObject({ occurredAt: null, error: null })
  })

  it('presets resolve to the right instant', () => {
    const v = presetValue(15, NY, now)
    expect(v).toMatchObject({ mode: 'custom', date: '2026-10-27', time: '02:05' })
    expect(resolveWhen(v, NY, now).occurredAt).toBe('2026-10-27T06:05:00.000Z')
  })

  it('backdating across midnight lands on the previous family day', () => {
    const v = presetValue(30, NY, Date.parse('2026-10-27T04:10:00Z')) // 12:10 AM → 11:40 PM
    expect(v).toMatchObject({ date: '2026-10-26', time: '23:40' })
  })

  it('flags future, nonexistent and ambiguous times', () => {
    expect(
      resolveWhen(
        { mode: 'custom', date: '2026-10-27', time: '03:00', ambiguityChoice: 0 },
        NY,
        now,
      ).error,
    ).toMatch(/future/)
    expect(
      resolveWhen(
        { mode: 'custom', date: '2026-03-08', time: '02:30', ambiguityChoice: 0 },
        NY,
        now,
      ).error,
    ).toMatch(/didn’t exist/)
    const amb = resolveWhen(
      { mode: 'custom', date: '2026-11-01', time: '01:30', ambiguityChoice: 1 },
      NY,
      Date.parse('2026-11-02T00:00:00Z'),
    )
    expect(amb.candidates).toHaveLength(2)
    expect(amb.occurredAt).toBe('2026-11-01T06:30:00.000Z')
  })
})
