import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/AppShell'
import { ChildrenManager, FamilyForm, ProfileForm } from '@/components/settings/FamilyForms'
import { Card, SectionTitle } from '@/components/ui/primitives'
import { requirePageMember } from '@/lib/auth/member'
import { can } from '@/lib/domain/intents'
import { timezoneOptions } from '@/lib/time/timezones'

export const metadata: Metadata = { title: 'Family & baby' }

export default async function FamilySettingsPage() {
  const { ctx } = await requirePageMember('/settings/family')
  const owner = can.manageHousehold(ctx.membership.role)
  const h = ctx.household
  return (
    <AppShell title="Family & baby" back={{ href: '/settings', label: 'Back to settings' }}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2" aria-labelledby="family">
          <SectionTitle id="family">Family</SectionTitle>
          <Card className="p-4">
            <FamilyForm
              canEdit={owner}
              timezones={timezoneOptions()}
              initial={{
                displayName: h.displayName,
                timezone: h.timezone,
                defaultFeedMethod: h.defaultFeedMethod,
                defaultVolumeUnit: h.defaultVolumeUnit,
              }}
            />
          </Card>
        </section>
        <section className="flex flex-col gap-2" aria-labelledby="children">
          <SectionTitle id="children">Children</SectionTitle>
          <Card className="p-4">
            <ChildrenManager items={ctx.children} canEdit={owner} />
          </Card>
          <p className="px-1 text-sm text-muted">
            Only a nickname is needed. No birth date or medical details are collected.
          </p>
        </section>
        <section className="flex flex-col gap-2" aria-labelledby="me">
          <SectionTitle id="me">You</SectionTitle>
          <Card className="p-4">
            <ProfileForm initial={ctx.displayName ?? ''} />
          </Card>
        </section>
      </div>
    </AppShell>
  )
}
