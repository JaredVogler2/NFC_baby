'use client'

import { usePathname } from 'next/navigation'
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
  const pathname = usePathname()
  useEffect(() => {
    // Intentionally not logging error.message: it can contain user data.
  }, [error])
  // The confirmation page is only reached after the server confirmed the save.
  const afterSave = pathname?.startsWith('/saved/') ?? false
  return (
    <PublicShell>
      <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-muted">
        {afterSave
          ? 'Your entry was saved — only its details page couldn’t load. Check History; don’t log it again.'
          : 'The page couldn’t load. Nothing new was saved from this screen.'}
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
