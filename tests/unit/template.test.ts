import { describe, expect, it } from 'vitest'
import type { CareEvent } from '@/lib/domain/event'
import { eventSummary } from '@/lib/domain/event'
import { renderUpdateText } from '@/lib/notifications/template'

const NY = 'America/New_York'
const now = new Date('2026-10-27T12:00:00Z')

function ev(
  partial: Partial<CareEvent>,
): Pick<CareEvent, 'subtype' | 'feeding' | 'occurredAt' | 'createdByName'> {
  return {
    subtype: 'WET',
    feeding: null,
    occurredAt: '2026-10-27T06:14:00Z',
    createdByName: 'Dad',
    ...partial,
  }
}

const bottle = (o: Partial<NonNullable<CareEvent['feeding']>>): CareEvent['feeding'] => ({
  milkType: 'BREASTMILK',
  amountMl: 103.5074,
  amountUnknown: false,
  amountEnteredValue: 3.5,
  amountEnteredUnit: 'oz',
  side: null,
  durationSeconds: null,
  endedAt: null,
  ...o,
})

describe('parent update text', () => {
  it.each([
    [ev({ subtype: 'WET' }), 'Baby update: Wet diaper at 2:14 AM (logged by Dad).'],
    [
      ev({ subtype: 'POOP', occurredAt: '2026-10-27T12:40:00Z', createdByName: 'Mom' }),
      'Baby update: Poop diaper at 8:40 AM (logged by Mom).',
    ],
    [ev({ subtype: 'BOTH' }), 'Baby update: Wet + poop at 2:14 AM (logged by Dad).'],
    [
      ev({
        subtype: 'BOTTLE',
        feeding: bottle({}),
        occurredAt: '2026-10-27T07:20:00Z',
        createdByName: 'Mom',
      }),
      'Baby update: Bottle, 3.5 oz breastmilk at 3:20 AM (logged by Mom).',
    ],
    [
      ev({
        subtype: 'BOTTLE',
        feeding: bottle({
          milkType: 'FORMULA',
          amountUnknown: true,
          amountMl: null,
          amountEnteredValue: null,
          amountEnteredUnit: null,
        }),
      }),
      'Baby update: Bottle (amount not measured), formula at 2:14 AM (logged by Dad).',
    ],
    [
      ev({
        subtype: 'NURSING',
        feeding: bottle({
          milkType: null,
          amountMl: null,
          amountEnteredValue: null,
          amountEnteredUnit: null,
          side: 'LEFT',
          durationSeconds: 720,
        }),
        occurredAt: '2026-10-27T08:10:00Z',
        createdByName: 'Mom',
      }),
      'Baby update: Nursing at 4:10 AM (logged by Mom).',
    ],
  ])('%#', (event, expected) => {
    expect(renderUpdateText(event, { timezone: NY, unit: 'oz', now })).toBe(expected)
  })

  it('adds the date when the event was not today', () => {
    expect(
      renderUpdateText(ev({ occurredAt: '2026-10-26T03:50:00Z' }), {
        timezone: NY,
        unit: 'oz',
        now,
      }),
    ).toBe('Baby update: Wet diaper at Sun, Oct 25 11:50 PM (logged by Dad).')
  })

  it('never includes notes and keeps names single-line', () => {
    const text = renderUpdateText(
      { ...ev({ createdByName: 'Dad\nCall +1 555 0100' }), ...{ notes: 'secret' } } as never,
      { timezone: NY, unit: 'oz', now },
    )
    expect(text).not.toContain('secret')
    expect(text).not.toContain('\n')
  })
})

describe('event summary', () => {
  it('formats bottle and nursing details', () => {
    expect(eventSummary({ subtype: 'BOTTLE', feeding: bottle({}) }, 'oz')).toBe(
      'Bottle · Breastmilk · 3.5 oz',
    )
    expect(eventSummary({ subtype: 'BOTTLE', feeding: bottle({}) }, 'ml')).toBe(
      'Bottle · Breastmilk · 104 mL',
    )
    expect(
      eventSummary(
        {
          subtype: 'NURSING',
          feeding: bottle({ milkType: null, side: 'LEFT', durationSeconds: 720 }),
        },
        'oz',
      ),
    ).toBe('Nursing · Left · 12 min')
    expect(eventSummary({ subtype: 'BOTH', feeding: null }, 'oz')).toBe('Wet + poop')
  })
})

describe('display names in texts', () => {
  it('strips links and phone numbers a member could put in their name', async () => {
    const { sanitizeName } = await import('@/lib/notifications/template')
    expect(sanitizeName('Dad')).toBe('Dad')
    expect(sanitizeName("Jo-Ann O'Neil")).toBe("Jo-Ann O'Neil")
    expect(sanitizeName('bit.ly/xyz call 900-555-0199')).toBe('call')
    expect(sanitizeName('Visit https://evil.example/now')).toBe('Visit')
    expect(sanitizeName('www.evil.com')).toBe('a parent')
    expect(sanitizeName('Mom\nSecond line')).toBe('Mom Second line')
  })
})
