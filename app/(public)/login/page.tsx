import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/LoginForm'
import { PublicShell } from '@/components/layout/AppShell'
import { NotConfigured } from '@/components/layout/NotConfigured'
import { safeNextPath } from '@/lib/auth/redirect'
import { getSessionUser } from '@/lib/auth/session'
import { isConfigured } from '@/lib/env/public'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const next = safeNextPath(params.next)
  if (!isConfigured()) return <NotConfigured />
  const user = await getSessionUser()
  if (user) redirect(next)
  const fromTag = next.startsWith('/t/')
  return (
    <PublicShell>
      <h1 className="font-display text-3xl font-bold">Sign in</h1>
      <p className="mb-6 mt-2 text-muted">
        {fromTag
          ? 'Sign in to continue to the sticker you scanned. Nothing has been recorded yet.'
          : 'Your family’s private baby-care log.'}
      </p>
      <LoginForm next={next} />
    </PublicShell>
  )
}
