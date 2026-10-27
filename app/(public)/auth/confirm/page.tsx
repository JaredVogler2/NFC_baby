import type { Metadata } from 'next'
import { ConfirmForm } from '@/components/auth/ConfirmForm'
import { PublicShell } from '@/components/layout/AppShell'
import { LinkButton } from '@/components/ui/Button'

export const metadata: Metadata = { title: 'Finish signing in' }

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : null
  const valid = tokenHash !== null && /^[A-Za-z0-9_-]{10,200}$/.test(tokenHash)
  return (
    <PublicShell>
      <h1 className="font-display text-3xl font-bold">Sign in</h1>
      {valid ? (
        <>
          <p className="mb-6 mt-2 text-muted">
            Tap below to finish signing in to NFC Baby on this device.
          </p>
          <ConfirmForm tokenHash={tokenHash} />
        </>
      ) : (
        <>
          <p className="mb-6 mt-2 text-muted">
            This sign-in link is incomplete. Request a new code.
          </p>
          <LinkButton href="/login" variant="primary" block>
            Go to sign in
          </LinkButton>
        </>
      )}
    </PublicShell>
  )
}
