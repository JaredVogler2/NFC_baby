import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/AppShell'
import { NotificationSettings, type Recipient } from '@/components/settings/NotificationSettings'
import { requirePageMember } from '@/lib/auth/member'
import { hasContactKey } from '@/lib/crypto/contacts'
import { toApiError } from '@/lib/db/errors'
import { can } from '@/lib/domain/intents'
import { CONSENT_TEXT, CONSENT_TEXT_VERSION } from '@/lib/notifications/consent'
import { smsAvailability } from '@/lib/notifications/providers'

export const metadata: Metadata = { title: 'Texts & notifications' }

export default async function NotificationSettingsPage() {
  const { ctx, supabase } = await requirePageMember('/settings/notifications')
  const role = ctx.membership.role
  const { data, error } = await supabase.rpc('get_notification_overview', {
    p_household_id: ctx.membership.householdId,
  })
  if (error) throw toApiError(error, 'get_notification_overview')
  const overview = data as { mode: 'OFF' | 'COMPOSE' | 'AUTOMATIC'; recipients: Recipient[] }
  const availability = smsAvailability()
  return (
    <AppShell title="Texts & notifications" back={{ href: '/settings', label: 'Back to settings' }}>
      {can.receiveTexts(role) ? (
        <NotificationSettings
          mode={overview.mode}
          isOwner={role === 'owner'}
          canReceive
          recipients={overview.recipients}
          sms={{
            available: availability.available,
            reason: availability.reason,
            canStoreNumbers: hasContactKey(),
          }}
          consentText={CONSENT_TEXT}
          consentVersion={CONSENT_TEXT_VERSION}
        />
      ) : (
        <p className="text-muted">
          The family is in “
          {overview.mode === 'OFF'
            ? 'in-app only'
            : overview.mode === 'COMPOSE'
              ? 'draft a text'
              : 'automatic texts'}
          ” mode. Automatic texts go only to parents; entries you log show up on their phones either
          way.
        </p>
      )}
    </AppShell>
  )
}
