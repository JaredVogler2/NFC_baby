'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HistoryIcon, HomeIcon, SettingsIcon } from '@/components/icons'

const ITEMS = [
  { href: '/dashboard', label: 'Home', Icon: HomeIcon },
  { href: '/history', label: 'History', Icon: HistoryIcon },
  { href: '/settings', label: 'Settings', Icon: SettingsIcon },
] as const

export function BottomNav() {
  const pathname = usePathname() ?? ''
  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-surface/85"
    >
      <ul className="mx-auto grid max-w-[480px] grid-cols-3">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                  active ? 'text-text' : 'text-muted'
                }`}
              >
                <Icon size={24} strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
