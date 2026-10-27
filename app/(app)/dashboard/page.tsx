import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/AppShell'
import { NotConfigured } from '@/components/layout/NotConfigured'
import { EmptyState } from '@/components/ui/primitives'
import { NfcIcon } from '@/components/icons'
import { requirePageUser } from '@/lib/auth/session'
import { isConfigured } from '@/lib/env/public'

export const metadata: Metadata = { title: 'Home' }

export default async function DashboardPage() {
  if (!isConfigured()) return <NotConfigured />
  await requirePageUser('/dashboard')
  return (
    <AppShell title="Home">
      <EmptyState icon={<NfcIcon size={40} />} title="No entries yet">
        Scan a sticker or tap Log.
      </EmptyState>
    </AppShell>
  )
}
