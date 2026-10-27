import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { AppShell } from '@/components/layout/AppShell'
import { DisplayForm } from '@/components/settings/DisplayForm'
import { ShortcutToggle } from '@/components/settings/ShortcutToggle'
import { Card, SectionTitle } from '@/components/ui/primitives'
import { requirePageMember } from '@/lib/auth/member'
import { THEME_COOKIE, UNIT_COOKIE, parseTheme, parseUnitPref } from '@/lib/theme'

export const metadata: Metadata = { title: 'This phone' }

export default async function DisplaySettingsPage() {
  const { ctx } = await requirePageMember('/settings/display')
  const store = await cookies()
  return (
    <AppShell title="This phone" back={{ href: '/settings', label: 'Back to settings' }}>
      <div className="flex flex-col gap-6">
        <Card className="p-4">
          <DisplayForm
            theme={parseTheme(store.get(THEME_COOKIE)?.value)}
            unit={parseUnitPref(store.get(UNIT_COOKIE)?.value)}
            familyUnit={ctx.household.defaultVolumeUnit}
          />
        </Card>
        <section className="flex flex-col gap-2" aria-labelledby="shortcut">
          <SectionTitle id="shortcut">iPhone Shortcut</SectionTitle>
          <Card className="p-4">
            <ShortcutToggle />
          </Card>
        </section>
      </div>
    </AppShell>
  )
}
