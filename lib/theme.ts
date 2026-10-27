export const THEME_COOKIE = 'nfcb_theme'
export const THEMES = ['system', 'light', 'dark'] as const
export type ThemePref = (typeof THEMES)[number]

export function parseTheme(value: string | undefined): ThemePref {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export const UNIT_COOKIE = 'nfcb_unit'
export type UnitPref = 'household' | 'oz' | 'ml'

export function parseUnitPref(value: string | undefined): UnitPref {
  return value === 'oz' || value === 'ml' ? value : 'household'
}
