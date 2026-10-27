import type { Metadata } from 'next'
import Link from 'next/link'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { ChevronRightIcon, NfcIcon } from '@/components/icons'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/primitives'
import { requirePageMember } from '@/lib/auth/member'
import { can, ROLE_LABEL } from '@/lib/domain/intents'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const { user, ctx } = await requirePageMember('/settings')
  const role = ctx.membership.role
  const items = [
    can.manageTags(role)
      ? {
          href: '/settings/tags',
          label: 'NFC stickers',
          hint: 'Create, test, print, retire',
          icon: <NfcIcon size={22} />,
        }
      : null,
  ].filter(Boolean) as { href: string; label: string; hint: string; icon: React.ReactNode }[]

  return (
    <AppShell title="Settings">
      <div className="flex flex-col gap-5">
        <p className="text-muted">
          Signed in as <strong className="text-text">{ctx.displayName ?? user.email}</strong> ·{' '}
          {ROLE_LABEL[role]}
        </p>
        {items.length ? (
          <Card className="divide-y divide-border">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-16 items-center gap-3 px-4 py-3"
              >
                <span className="text-muted">{item.icon}</span>
                <span className="flex-1">
                  <span className="block font-semibold">{item.label}</span>
                  <span className="block text-sm text-muted">{item.hint}</span>
                </span>
                <ChevronRightIcon size={20} className="text-muted" />
              </Link>
            ))}
          </Card>
        ) : null}
        <SignOutButton />
      </div>
    </AppShell>
  )
}
