'use client'

import { useState } from 'react'
import { Button, type ButtonVariant } from '@/components/ui/Button'
import { clearAllDrafts } from '@/lib/offline/drafts'

export function SignOutButton({
  variant = 'secondary',
  label = 'Sign out',
}: {
  variant?: ButtonVariant
  label?: string
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant={variant}
      block
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        // Device-local drafts belong to this person: never leave them for the next user.
        await clearAllDrafts().catch(() => undefined)
        try {
          sessionStorage.clear()
        } catch {
          // ignore
        }
        await fetch('/api/v1/auth/signout', { method: 'POST', credentials: 'same-origin' }).catch(
          () => undefined,
        )
        // Full page load on purpose: drops every in-memory trace of the previous session.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/login')
      }}
    >
      {busy ? 'Signing out…' : label}
    </Button>
  )
}
