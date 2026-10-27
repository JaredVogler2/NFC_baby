'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/form'
import { Banner } from '@/components/ui/primitives'
import { apiFetch } from '@/lib/http/client'

export function AcceptInviteForm({
  token,
  suggestedName,
}: {
  token: string
  suggestedName: string
}) {
  const [displayName, setDisplayName] = useState(suggestedName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await apiFetch<{ next: string }>('/api/v1/invites/accept', {
      method: 'POST',
      body: { token, displayName },
    })
    if (!result.ok) {
      setBusy(false)
      setError(result.fields?.displayName ?? result.message)
      return
    }
    window.location.assign(result.data.next)
  }

  return (
    <form onSubmit={accept} className="flex flex-col gap-4" noValidate>
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
      <TextField
        label="Your name (as the family sees it)"
        hint="For example “Dad”. Shown next to entries you log."
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={40}
        autoComplete="nickname"
      />
      <Button type="submit" size="xl" block disabled={busy || !displayName.trim()}>
        {busy ? 'Joining…' : 'Join the family log'}
      </Button>
    </form>
  )
}
