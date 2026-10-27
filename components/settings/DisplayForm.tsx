'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { MoonIcon, SunIcon } from '@/components/icons'
import { Segmented } from '@/components/ui/form'
import { THEME_COOKIE, UNIT_COOKIE, type ThemePref, type UnitPref } from '@/lib/theme'

function setCookie(name: string, value: string) {
  // Display preferences only (not sensitive); readable by the server for first render.
  document.cookie = `${name}=${value}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
}

/** Per-phone display preferences: units and day/night theme. */
export function DisplayForm({
  theme,
  unit,
  familyUnit,
}: {
  theme: ThemePref
  unit: UnitPref
  familyUnit: 'oz' | 'ml'
}) {
  const router = useRouter()
  const [t, setT] = useState(theme)
  const [u, setU] = useState(unit)
  return (
    <div className="flex flex-col gap-5">
      <Segmented
        legend="Theme on this phone"
        name="theme"
        value={t}
        size="md"
        options={[
          { value: 'system', label: 'Auto' },
          { value: 'light', label: 'Day', icon: <SunIcon size={18} /> },
          { value: 'dark', label: 'Night', icon: <MoonIcon size={18} /> },
        ]}
        onChange={(v) => {
          setT(v)
          setCookie(THEME_COOKIE, v)
          if (v === 'system') document.documentElement.removeAttribute('data-theme')
          else document.documentElement.setAttribute('data-theme', v)
        }}
      />
      <p className="-mt-3 text-sm text-muted">
        Auto follows the iPhone’s Light/Dark setting. Night is dim and warm for 2 AM.
      </p>
      <Segmented
        legend="Bottle amounts on this phone"
        name="unit"
        value={u}
        size="md"
        options={[
          { value: 'household', label: `Family (${familyUnit === 'oz' ? 'oz' : 'mL'})` },
          { value: 'oz', label: 'oz' },
          { value: 'ml', label: 'mL' },
        ]}
        onChange={(v) => {
          setU(v)
          setCookie(UNIT_COOKIE, v)
          router.refresh()
        }}
      />
      <p className="-mt-3 text-sm text-muted">
        Only changes how amounts are shown here; stored amounts never change.
      </p>
    </div>
  )
}
