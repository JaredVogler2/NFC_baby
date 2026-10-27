import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/AppShell'
import { NotConfigured } from '@/components/layout/NotConfigured'
import { EmptyState } from '@/components/ui/primitives'
import { requirePageUser } from '@/lib/auth/session'
import { isConfigured } from '@/lib/env/public'

export const metadata: Metadata = { title: 'History' }

export default async function HistoryPage() {
  if (!isConfigured()) return <NotConfigured />
  await requirePageUser('/history')
  return (
    <AppShell title="History">
      <EmptyState title="Nothing logged yet" />
    </AppShell>
  )
}
