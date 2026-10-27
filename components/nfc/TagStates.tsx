import { PublicShell } from '@/components/layout/AppShell'
import { LinkButton } from '@/components/ui/Button'
import { NfcIcon } from '@/components/icons'
import { loginUrlFor } from '@/lib/auth/redirect'

/**
 * Shown to anyone not signed in. Identical for valid, unknown and revoked tokens: it reveals no
 * child, no purpose, no household, and not even whether the sticker is registered.
 */
export function TagGate({ token }: { token: string }) {
  return (
    <PublicShell>
      <div className="mb-4 text-muted">
        <NfcIcon size={40} />
      </div>
      <h1 className="font-display text-3xl font-bold">Private family log</h1>
      <p className="mb-6 mt-2 text-muted">
        This sticker opens a private family log. Sign in to continue.
      </p>
      <LinkButton href={loginUrlFor(`/t/${token}`)} variant="primary" size="xl" block>
        Sign in to continue
      </LinkButton>
      <p className="mt-4 text-sm text-muted">Nothing has been recorded.</p>
    </PublicShell>
  )
}

export function TagRetired({ canManage }: { canManage: boolean }) {
  return (
    <PublicShell>
      <h1 className="font-display text-3xl font-bold">Sticker retired</h1>
      <p className="mb-6 mt-2 text-muted">
        This sticker was turned off in Settings, so it can&apos;t log anything. Nothing was
        recorded. You can still log from Home.
      </p>
      <div className="flex flex-col gap-3">
        <LinkButton href="/dashboard" variant="primary" block>
          Go to Home
        </LinkButton>
        {canManage ? (
          <LinkButton href="/settings/tags" block>
            Manage stickers
          </LinkButton>
        ) : null}
      </div>
    </PublicShell>
  )
}

export function TagViewOnly() {
  return (
    <PublicShell>
      <h1 className="font-display text-3xl font-bold">View only</h1>
      <p className="mb-6 mt-2 text-muted">
        Your account can view the family log but can&apos;t add entries. Nothing was recorded.
      </p>
      <LinkButton href="/history" variant="primary" block>
        View history
      </LinkButton>
    </PublicShell>
  )
}
