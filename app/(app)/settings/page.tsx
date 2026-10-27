import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/AppShell'
import { NotConfigured } from '@/components/layout/NotConfigured'
import { requirePageUser } from '@/lib/auth/session'
import { isConfigured } from '@/lib/env/public'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  if (!isConfigured()) return <NotConfigured />
  await requirePageUser('/settings')
  return (
    <AppShell title="Settings">
      <p className="text-muted">Settings arrive in phase 07.</p>
    </AppShell>
  )
}
