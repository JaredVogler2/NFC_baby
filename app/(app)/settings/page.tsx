import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { SignOutButton } from '@/components/auth/SignOutButton'
import {
  ChevronRightIcon,
  DownloadIcon,
  HomeIcon,
  LockIcon,
  MessageIcon,
  MoonIcon,
  NfcIcon,
  UsersIcon,
} from '@/components/icons'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/primitives'
import { requirePageMember } from '@/lib/auth/member'
import { can, ROLE_LABEL } from '@/lib/domain/intents'

export const metadata: Metadata = { title: 'Settings' }

type Item = { href: string; label: string; hint: string; icon: ReactNode }

export default async function SettingsPage() {
  const { user, ctx } = await requirePageMember('/settings')
  const role = ctx.membership.role
  const items: (Item | false)[] = [
    {
      href: '/settings/family',
      label: 'Family & baby',
      hint: 'Names, time zone, defaults',
      icon: <HomeIcon size={22} />,
    },
    can.manageMembers(role) && {
      href: '/settings/members',
      label: 'Members & invites',
      hint: 'Invite your partner, roles',
      icon: <UsersIcon size={22} />,
    },
    can.manageTags(role) && {
      href: '/settings/tags',
      label: 'NFC stickers',
      hint: 'Create, test, print, retire',
      icon: <NfcIcon size={22} />,
    },
    {
      href: '/settings/notifications',
      label: 'Texts & notifications',
      hint: 'Off, share a draft, or automatic texts',
      icon: <MessageIcon size={22} />,
    },
    {
      href: '/settings/display',
      label: 'This phone',
      hint: 'Night mode, units, Shortcut',
      icon: <MoonIcon size={22} />,
    },
    can.export(role) && {
      href: '/settings/privacy',
      label: 'Privacy & export',
      hint: 'Download records, data handling',
      icon: <DownloadIcon size={22} />,
    },
  ]
  return (
    <AppShell title="Settings">
      <div className="flex flex-col gap-5">
        <p className="flex items-center gap-2 text-muted">
          <LockIcon size={18} /> Signed in as{' '}
          <strong className="text-text">{ctx.displayName ?? user.email}</strong> ·{' '}
          {ROLE_LABEL[role]}
        </p>
        <Card className="divide-y divide-border">
          {items
            .filter((i): i is Item => Boolean(i))
            .map((item) => (
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
        <SignOutButton />
      </div>
    </AppShell>
  )
}
