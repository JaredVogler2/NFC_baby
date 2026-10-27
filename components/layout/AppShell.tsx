import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeftIcon } from '@/components/icons'
import { BottomNav } from './BottomNav'

/**
 * Standard signed-in page frame: sticky header, single 480px column, bottom navigation.
 * Logging screens use `FocusShell` instead (no bottom nav, single Cancel control).
 */
export function AppShell({
  title,
  back,
  actions,
  children,
  hideNav,
}: {
  title: ReactNode
  back?: { href: string; label: string }
  actions?: ReactNode
  children: ReactNode
  hideNav?: boolean
}) {
  return (
    <>
      <header className="pt-safe no-print sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
        <div className="mx-auto flex min-h-14 max-w-[480px] items-center gap-2 px-4">
          {back ? (
            <Link
              href={back.href}
              className="-ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:text-text"
            >
              <ChevronLeftIcon />
              <span className="sr-only">{back.label}</span>
            </Link>
          ) : null}
          <h1 className="min-w-0 flex-1 truncate font-display text-xl font-bold">{title}</h1>
          {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
        </div>
      </header>
      <main
        id="main"
        className={`mx-auto w-full max-w-[480px] px-4 pt-4 ${hideNav ? 'pb-safe' : 'pb-28'}`}
      >
        {children}
      </main>
      {hideNav ? null : <BottomNav />}
    </>
  )
}

/** Minimal frame for public pages (sign-in, tag gate, invite). */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main
      id="main"
      className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-[420px] flex-col px-5"
    >
      <div className="flex items-center gap-2 py-4">
        <BrandMark />
        <span className="font-display text-lg font-bold">NFC Baby</span>
      </div>
      <div className="flex flex-1 flex-col justify-center pb-10">{children}</div>
    </main>
  )
}

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path
        d="M11 12.5a5.5 5.5 0 0 1 0 7M14.5 10a9 9 0 0 1 0 12M18 7.5a12.5 12.5 0 0 1 0 17"
        fill="none"
        stroke="var(--primary-fg)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
