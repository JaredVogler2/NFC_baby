import 'server-only'
import { cookies } from 'next/headers'
import type { VolumeUnit } from '@/lib/domain/units'
import { UNIT_COOKIE, parseUnitPref } from '@/lib/theme'

/** Per-device display unit override (Settings → Display); falls back to the family default. */
export async function unitPreference(householdDefault: VolumeUnit): Promise<VolumeUnit> {
  const pref = parseUnitPref((await cookies()).get(UNIT_COOKIE)?.value)
  return pref === 'household' ? householdDefault : pref
}
