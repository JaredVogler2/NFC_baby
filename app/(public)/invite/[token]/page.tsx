import type { Metadata } from 'next'
import { AcceptInviteForm } from '@/components/auth/AcceptInviteForm'
import { LoginForm } from '@/components/auth/LoginForm'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { PublicShell } from '@/components/layout/AppShell'
import { NotConfigured } from '@/components/layout/NotConfigured'
import { LinkButton } from '@/components/ui/Button'
import { lookupInvite } from '@/lib/auth/invites'
import { getSessionUser } from '@/lib/auth/session'
import { ROLE_LABEL, type Role } from '@/lib/domain/intents'
import { isConfigured } from '@/lib/env/public'
import { hasAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Join your family' }

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  if (!isConfigured() || !hasAdminClient()) return <NotConfigured />
  const { token } = await params
  const invite = /^[A-Za-z0-9_-]{43}$/.test(token)
    ? await lookupInvite(token)
    : { status: 'invalid' as const }

  if (invite.status !== 'valid') {
    return (
      <PublicShell>
        <h1 className="font-display text-3xl font-bold">Invite not valid</h1>
        <p className="mb-6 mt-2 text-muted">
          This invite link has expired, was already used, or was cancelled. Ask the family owner for
          a new one.
        </p>
        <LinkButton href="/login" block>
          Go to sign in
        </LinkButton>
      </PublicShell>
    )
  }

  const role = ROLE_LABEL[invite.role as Role] ?? 'Member'
  const user = await getSessionUser()

  if (!user) {
    return (
      <PublicShell>
        <h1 className="font-display text-3xl font-bold">You&apos;re invited</h1>
        <p className="mb-6 mt-2 text-muted">
          Join a family&apos;s private NFC Baby log as <strong className="text-text">{role}</strong>
          . Enter the email address this invite was sent to ({invite.emailHint}); we&apos;ll email
          you a sign-in code.
        </p>
        <LoginForm
          next={`/invite/${token}`}
          startPath="/api/v1/invites/start"
          startBody={{ token }}
        />
      </PublicShell>
    )
  }

  if (user.email?.toLowerCase() !== invite.email) {
    return (
      <PublicShell>
        <h1 className="font-display text-3xl font-bold">Different account</h1>
        <p className="mb-6 mt-2 text-muted">
          You&apos;re signed in as <strong className="text-text">{user.email}</strong>, but this
          invite is for {invite.emailHint}. Sign out, then open the invite link again.
        </p>
        <SignOutButton />
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <h1 className="font-display text-3xl font-bold">Join as {role}</h1>
      <p className="mb-6 mt-2 text-muted">One last step: how should your name appear on entries?</p>
      <AcceptInviteForm token={token} suggestedName={invite.displayName ?? ''} />
    </PublicShell>
  )
}
