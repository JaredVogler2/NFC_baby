import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/AppShell'
import { NotConfigured } from '@/components/layout/NotConfigured'
import { requirePageMember } from '@/lib/auth/member'
import { isConfigured } from '@/lib/env/public'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  if (!isConfigured()) return <NotConfigured />
  await requirePageMember('/settings')
  return (
    <AppShell title="Settings">
      <p className="text-muted">Settings arrive in phase 07.</p>
    </AppShell>
  )
}
