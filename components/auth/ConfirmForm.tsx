'use client'

import { useState } from 'react'
import { Button, LinkButton } from '@/components/ui/Button'
import { Banner } from '@/components/ui/primitives'
import { apiFetch } from '@/lib/http/client'

/** Finishing an email-link sign-in requires a tap, so link scanners cannot burn the token. */
export function ConfirmForm({ tokenHash }: { tokenHash: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function finish() {
    setBusy(true)
    setError(null)
    const result = await apiFetch<{ next: string }>('/api/v1/auth/confirm', {
      method: 'POST',
      body: { tokenHash, type: 'email' },
    })
    if (!result.ok) {
      setBusy(false)
      setError(
        result.kind === 'http'
          ? 'This sign-in link has expired or was already used. Request a new code.'
          : 'Could not reach the server. Check your connection and try again.',
      )
      return
    }
    window.location.assign(result.data.next)
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Banner tone="danger" role="alert" title="Not signed in">
          {error}
        </Banner>
      ) : null}
      <Button size="xl" block onClick={finish} disabled={busy}>
        {busy ? 'Signing in…' : 'Finish signing in'}
      </Button>
      {error ? (
        <LinkButton href="/login" block>
          Get a new code
        </LinkButton>
      ) : null}
    </div>
  )
}
