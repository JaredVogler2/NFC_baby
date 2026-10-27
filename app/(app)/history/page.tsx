import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/AppShell'
import { NotConfigured } from '@/components/layout/NotConfigured'
import { EmptyState } from '@/components/ui/primitives'
import { requirePageMember } from '@/lib/auth/member'
import { isConfigured } from '@/lib/env/public'

export const metadata: Metadata = { title: 'History' }

export default async function HistoryPage() {
  if (!isConfigured()) return <NotConfigured />
  await requirePageMember('/history')
  return (
    <AppShell title="History">
      <EmptyState title="Nothing logged yet" />
    </AppShell>
  )
}
