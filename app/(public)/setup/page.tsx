import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SetupForm } from '@/components/auth/SetupForm'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { PublicShell } from '@/components/layout/AppShell'
import { NotConfigured } from '@/components/layout/NotConfigured'
import { canBootstrap } from '@/lib/auth/bootstrap'
import { requirePageUser } from '@/lib/auth/session'
import { loadMyContext } from '@/lib/db/context'
import { isConfigured } from '@/lib/env/public'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { timezoneOptions } from '@/lib/time/timezones'

export const metadata: Metadata = { title: 'Set up' }

export default async function SetupPage() {
  if (!isConfigured()) return <NotConfigured />
  const user = await requirePageUser('/setup')
  const ctx = await loadMyContext(await createSupabaseServerClient())
  if (ctx?.membership) redirect('/dashboard')

  if (await canBootstrap(user)) {
    return (
      <PublicShell>
        <h1 className="font-display text-3xl font-bold">Set up your family</h1>
        <p className="mb-6 mt-2 text-muted">
          You&apos;re the first person here, so you&apos;ll be the owner. You can invite your
          partner next.
        </p>
        <SetupForm timezones={timezoneOptions()} />
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <h1 className="font-display text-3xl font-bold">No family access yet</h1>
      <p className="mb-6 mt-2 text-muted">
        You&apos;re signed in as <strong className="text-text">{user.email}</strong>, but this
        account isn&apos;t part of a family log. Ask the family owner for an invite link, then open
        it on this phone.
      </p>
      <SignOutButton />
    </PublicShell>
  )
}
