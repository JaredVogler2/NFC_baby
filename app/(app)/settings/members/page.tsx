import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { MembersManager } from '@/components/settings/MembersManager'
import { Card } from '@/components/ui/primitives'
import { requirePageMember } from '@/lib/auth/member'
import { listOpenInvites } from '@/lib/db/invites'
import { can } from '@/lib/domain/intents'

export const metadata: Metadata = { title: 'Members' }

export default async function MembersPage() {
  const { user, ctx, supabase } = await requirePageMember('/settings/members')
  if (!can.manageMembers(ctx.membership.role)) redirect('/settings')
  const invites = await listOpenInvites(supabase, ctx.membership.householdId)
  return (
    <AppShell title="Members" back={{ href: '/settings', label: 'Back to settings' }}>
      <Card className="p-4">
        <MembersManager members={ctx.members} invites={invites} meId={user.id} />
      </Card>
    </AppShell>
  )
}
