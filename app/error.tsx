'use client'

import { useEffect } from 'react'
import { PublicShell } from '@/components/layout/AppShell'
import { Button, LinkButton } from '@/components/ui/Button'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Intentionally not logging error.message: it can contain user data.
  }, [error])
  return (
    <PublicShell>
      <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-muted">
        The page couldn&apos;t load. Nothing was saved unless you saw &ldquo;Saved&rdquo;.
      </p>
      {error.digest ? <p className="mt-2 text-sm text-muted">Reference: {error.digest}</p> : null}
      <div className="mt-6 flex flex-col gap-3">
        <Button onClick={reset} block>
          Try again
        </Button>
        <LinkButton href="/dashboard" block>
          Go to home
        </LinkButton>
      </div>
    </PublicShell>
  )
}
