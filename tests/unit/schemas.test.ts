import { describe, expect, it } from 'vitest'
import { createEventSchema, notificationPrefsSchema, updateEventSchema } from '@/lib/domain/schemas'

const base = {
  clientRequestId: '6f1c3c62-0e7f-4e43-9a3b-6f1c3c620e7f',
  tagToken: '0123456789abcdefghjkmnpqrs',
}

describe('createEventSchema', () => {
  it('accepts a minimal wet diaper from a tag (no note, no time)', () => {
    const r = createEventSchema.safeParse({ ...base, intent: 'WET' })
    expect(r.success).toBe(true)
    expect(r.data!.notes).toBeNull()
  })

  it('accepts a 500-char note and rejects 501', () => {
    expect(
      createEventSchema.safeParse({ ...base, intent: 'WET', notes: 'a'.repeat(500) }).success,
    ).toBe(true)
    const r = createEventSchema.safeParse({ ...base, intent: 'WET', notes: 'a'.repeat(501) })
    expect(r.success).toBe(false)
    expect(r.error!.issues[0]!.message).toMatch(/500 characters/)
  })

  it('requires a feeding method for FEED and forbids it for diapers', () => {
    expect(createEventSchema.safeParse({ ...base, intent: 'FEED' }).success).toBe(false)
    expect(
      createEventSchema.safeParse({ ...base, intent: 'WET', feeding: { method: 'NURSING' } })
        .success,
    ).toBe(false)
  })

  it('bottle: amount or explicit unknown, never silent zero', () => {
    const feed = (feeding: object) =>
      createEventSchema.safeParse({ ...base, intent: 'FEED', feeding })
    expect(
      feed({ method: 'BOTTLE', milkType: 'BREASTMILK', amountValue: 3.5, amountUnit: 'oz' })
        .success,
    ).toBe(true)
    expect(feed({ method: 'BOTTLE', milkType: 'FORMULA', amountUnknown: true }).success).toBe(true)
    expect(feed({ method: 'BOTTLE', milkType: 'FORMULA' }).success).toBe(false)
    expect(
      feed({ method: 'BOTTLE', milkType: 'FORMULA', amountValue: 0, amountUnit: 'oz' }).success,
    ).toBe(false)
    expect(
      feed({ method: 'BOTTLE', milkType: 'FORMULA', amountValue: -1, amountUnit: 'oz' }).success,
    ).toBe(false)
    expect(
      feed({ method: 'BOTTLE', milkType: 'FORMULA', amountValue: Number.NaN, amountUnit: 'oz' })
        .success,
    ).toBe(false)
    expect(
      feed({ method: 'BOTTLE', milkType: 'FORMULA', amountValue: 17, amountUnit: 'oz' }).success,
    ).toBe(false)
    expect(feed({ method: 'BOTTLE', milkType: 'FORMULA', amountValue: 3 }).success).toBe(false)
    expect(
      feed({ method: 'BOTTLE', milkType: 'JUICE', amountValue: 3, amountUnit: 'oz' }).success,
    ).toBe(false)
  })

  it('nursing: optional side/duration; not both duration and end time', () => {
    const feed = (feeding: object) =>
      createEventSchema.safeParse({ ...base, intent: 'FEED', feeding })
    expect(feed({ method: 'NURSING' }).success).toBe(true)
    expect(feed({ method: 'NURSING', side: 'LEFT', durationSeconds: 720 }).success).toBe(true)
    expect(feed({ method: 'NURSING', durationSeconds: 30 }).success).toBe(false)
    expect(
      feed({ method: 'NURSING', durationSeconds: 600, endedAt: '2026-10-27T06:10:00Z' }).success,
    ).toBe(false)
  })

  it('requires a child when no tag is given, and validates ids', () => {
    expect(
      createEventSchema.safeParse({ clientRequestId: base.clientRequestId, intent: 'WET' }).success,
    ).toBe(false)
    expect(
      createEventSchema.safeParse({ ...base, intent: 'WET', clientRequestId: 'not-a-uuid' })
        .success,
    ).toBe(false)
    expect(createEventSchema.safeParse({ ...base, intent: 'WET', tagToken: '../x' }).success).toBe(
      false,
    )
    expect(createEventSchema.safeParse({ ...base, intent: 'PEE' }).success).toBe(false)
  })

  it('occurredAt must be an ISO instant with offset', () => {
    expect(
      createEventSchema.safeParse({ ...base, intent: 'WET', occurredAt: '2026-10-27T06:10:00Z' })
        .success,
    ).toBe(true)
    expect(
      createEventSchema.safeParse({ ...base, intent: 'WET', occurredAt: '2026-10-27 02:10' })
        .success,
    ).toBe(false)
  })
})

describe('updateEventSchema', () => {
  it('needs a revision and at least one change', () => {
    expect(
      updateEventSchema.safeParse({ expectedRevision: 1, patch: { notes: 'x' } }).success,
    ).toBe(true)
    expect(updateEventSchema.safeParse({ expectedRevision: 1, patch: {} }).success).toBe(false)
    expect(updateEventSchema.safeParse({ patch: { notes: 'x' } }).success).toBe(false)
  })

  it('allows clearing a note', () => {
    const r = updateEventSchema.safeParse({ expectedRevision: 2, patch: { notes: '' } })
    expect(r.success).toBe(true)
    expect(r.data!.patch.notes).toBeNull()
  })
})

describe('notificationPrefsSchema', () => {
  it('validates quiet hours format', () => {
    const ok = {
      autoSmsEnabled: true,
      categories: ['FEED'],
      includeOwnEntries: true,
      quietHoursEnabled: true,
      quietStart: '22:00',
      quietEnd: '06:30',
    }
    expect(notificationPrefsSchema.safeParse(ok).success).toBe(true)
    expect(notificationPrefsSchema.safeParse({ ...ok, quietStart: '24:00' }).success).toBe(false)
  })
})
