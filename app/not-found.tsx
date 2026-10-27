import { PublicShell } from '@/components/layout/AppShell'
import { LinkButton } from '@/components/ui/Button'

export default function NotFound() {
  return (
    <PublicShell>
      <h1 className="font-display text-2xl font-bold">Not available</h1>
      <p className="mt-2 text-muted">
        This page doesn&apos;t exist or isn&apos;t available to you. Nothing was recorded.
      </p>
      <LinkButton href="/dashboard" variant="primary" className="mt-6" block>
        Go to home
      </LinkButton>
    </PublicShell>
  )
}
