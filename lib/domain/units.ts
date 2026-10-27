/**
 * Bottle volume conventions (see ADR-007).
 * Canonical storage is millilitres; the entered value + unit are also stored so a 3.5 oz entry is
 * shown and edited as exactly 3.5 oz. 1 US fluid ounce = 29.5735295625 mL (exact by definition).
 */

export const ML_PER_US_FL_OZ = 29.5735295625
export const MAX_BOTTLE_ML = 500
export type VolumeUnit = 'oz' | 'ml'

export function ozToMl(oz: number): number {
  return Math.round(oz * ML_PER_US_FL_OZ * 10_000) / 10_000
}

export function mlToOz(ml: number): number {
  return ml / ML_PER_US_FL_OZ
}

export function toMl(value: number, unit: VolumeUnit): number {
  return unit === 'oz' ? ozToMl(value) : Math.round(value * 10_000) / 10_000
}

/** Display rounding: oz to 0.1 (trailing .0 dropped), mL to whole numbers. */
export function formatVolume(ml: number, unit: VolumeUnit): string {
  if (unit === 'oz') {
    const oz = Math.round(mlToOz(ml) * 10) / 10
    return `${Number.isInteger(oz) ? oz.toFixed(0) : oz.toFixed(1)} oz`
  }
  return `${Math.round(ml)} mL`
}

/**
 * How to show a stored bottle amount. If the viewer's unit matches what was entered, show the
 * entered value exactly; otherwise convert from canonical mL.
 */
export function displayAmount(
  amount: {
    ml: number | null
    enteredValue: number | null
    enteredUnit: VolumeUnit | null
    unknown: boolean
  },
  preferred: VolumeUnit,
): string {
  if (amount.unknown || amount.ml === null) return 'amount not measured'
  if (amount.enteredValue !== null && amount.enteredUnit === preferred) {
    const v = amount.enteredValue
    return `${Number.isInteger(v) ? v.toFixed(0) : String(Number(v.toFixed(2)))} ${preferred === 'oz' ? 'oz' : 'mL'}`
  }
  return formatVolume(amount.ml, preferred)
}

/** Parse a user-typed amount ("3.5", "3,5", " 120 "). Returns null for anything not a positive finite number. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.')
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

export const OZ_PRESETS = [1, 2, 3, 4, 5, 6] as const
export const ML_PRESETS = [30, 60, 90, 120, 150, 180] as const
