'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Banner } from '@/components/ui/primitives'
import { apiFetch } from '@/lib/http/client'

/**
 * Shown to owners/parents on a sticker that hasn't been confirmed yet. Confirming routing is a
 * separate deliberate POST — it never logs a care event or sends anything.
 */
export function ScanTestPanel({
  tagId,
  purposeLabel,
  childName,
}: {
  tagId: string
  purposeLabel: string
  childName: string
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  if (state === 'done') {
    return (
      <Banner tone="success" role="status" title="Sticker marked as tested">
        You can log an entry below, or just close this screen.
      </Banner>
    )
  }
  return (
    <Banner
      tone="info"
      title="Sticker check"
      action={
        <Button
          size="md"
          variant="secondary"
          disabled={state === 'busy'}
          onClick={async () => {
            setState('busy')
            const res = await apiFetch(`/api/v1/tags/${tagId}/tested`, { method: 'POST', body: {} })
            setState(res.ok ? 'done' : 'error')
          }}
        >
          {state === 'busy' ? 'Saving…' : 'Mark sticker as tested'}
        </Button>
      }
    >
      This sticker opens <strong>{purposeLabel}</strong> for <strong>{childName}</strong>. If
      that&apos;s right, mark it as tested. Nothing has been logged.
      {state === 'error' ? ' Could not save — try again.' : ''}
    </Banner>
  )
}
