import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayHeading,
  formatElapsed,
  formatTime,
  formatWhen,
  localDateKey,
  localTimeValue,
  localToUtcCandidates,
  offsetMinutes,
  startOfLocalDay,
  tzAbbreviation,
} from '@/lib/time/zoned'

const NY = 'America/New_York'

describe('local wall time → UTC (America/New_York)', () => {
  it('normal winter time (EST, UTC−5)', () => {
    const r = localToUtcCandidates('2026-01-15', '02:10', NY)
    expect(r.map((d) => d.toISOString())).toEqual(['2026-01-15T07:10:00.000Z'])
  })

  it('normal summer time (EDT, UTC−4)', () => {
    const r = localToUtcCandidates('2026-07-04', '02:10', NY)
    expect(r.map((d) => d.toISOString())).toEqual(['2026-07-04T06:10:00.000Z'])
  })

  it('spring forward: 2:30 AM on 2026-03-08 does not exist', () => {
    expect(localToUtcCandidates('2026-03-08', '02:30', NY)).toEqual([])
    expect(localToUtcCandidates('2026-03-08', '01:59', NY).map((d) => d.toISOString())).toEqual([
      '2026-03-08T06:59:00.000Z',
    ])
    expect(localToUtcCandidates('2026-03-08', '03:00', NY).map((d) => d.toISOString())).toEqual([
      '2026-03-08T07:00:00.000Z',
    ])
  })

  it('fall back: 1:30 AM on 2026-11-01 happens twice (EDT then EST)', () => {
    const r = localToUtcCandidates('2026-11-01', '01:30', NY)
    expect(r.map((d) => d.toISOString())).toEqual([
      '2026-11-01T05:30:00.000Z',
      '2026-11-01T06:30:00.000Z',
    ])
    expect(r.map((d) => tzAbbreviation(d, NY))).toEqual(['EDT', 'EST'])
  })

  it('crossing midnight: 11:50 PM local is the next UTC day', () => {
    const [d] = localToUtcCandidates('2026-10-26', '23:50', NY)
    expect(d!.toISOString()).toBe('2026-10-27T03:50:00.000Z')
    expect(localDateKey(d!, NY)).toBe('2026-10-26')
  })

  it('rejects malformed input', () => {
    expect(localToUtcCandidates('2026-13-01', '01:00', NY)).toEqual([])
    expect(localToUtcCandidates('2026-01-01', '25:00', NY)).toEqual([])
    expect(localToUtcCandidates('yesterday', '01:00', NY)).toEqual([])
  })

  it('works for other zones too', () => {
    expect(
      localToUtcCandidates('2026-06-01', '09:00', 'Europe/London').map((d) => d.toISOString()),
    ).toEqual(['2026-06-01T08:00:00.000Z'])
    expect(localToUtcCandidates('2026-06-01', '09:00', 'UTC').map((d) => d.toISOString())).toEqual([
      '2026-06-01T09:00:00.000Z',
    ])
  })
})

describe('UTC → family display', () => {
  const at = new Date('2026-10-27T06:14:00Z')
  it('formats in the family zone regardless of the device zone', () => {
    expect(formatTime(at, NY)).toBe('2:14 AM')
    expect(localDateKey(at, NY)).toBe('2026-10-27')
    expect(localTimeValue(at, NY)).toBe('02:14')
    expect(offsetMinutes(at, NY)).toBe(-240)
  })

  it('start of day is local midnight', () => {
    expect(startOfLocalDay('2026-10-27', NY).toISOString()).toBe('2026-10-27T04:00:00.000Z')
    expect(startOfLocalDay('2026-12-01', NY).toISOString()).toBe('2026-12-01T05:00:00.000Z')
  })

  it('day headings and "when" strings', () => {
    const now = new Date('2026-10-27T15:00:00Z')
    expect(dayHeading('2026-10-27', NY, now)).toBe('Today')
    expect(dayHeading('2026-10-26', NY, now)).toBe('Yesterday')
    expect(dayHeading('2026-10-20', NY, now)).toBe('Tuesday, October 20')
    expect(formatWhen(new Date('2026-10-27T03:50:00Z'), NY, now)).toBe('Yesterday 11:50 PM')
    expect(formatWhen(new Date('2026-10-20T16:00:00Z'), NY, now)).toBe('Tue, Oct 20 · 12:00 PM')
  })

  it('addDays handles month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('elapsed time is informational text', () => {
    const now = Date.parse('2026-10-27T10:00:00Z')
    expect(formatElapsed(now - 30_000, now)).toBe('just now')
    expect(formatElapsed(now - 14 * 60_000, now)).toBe('14 min ago')
    expect(formatElapsed(now - 72 * 60_000, now)).toBe('1 h 12 min ago')
    expect(formatElapsed(now - 120 * 60_000, now)).toBe('2 h ago')
    expect(formatElapsed(now - 51 * 3_600_000, now)).toBe('2 d 3 h ago')
  })
})
