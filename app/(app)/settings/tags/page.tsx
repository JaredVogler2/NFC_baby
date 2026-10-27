import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronRightIcon, PrinterIcon } from '@/components/icons'
import { AppShell } from '@/components/layout/AppShell'
import { KindBadge } from '@/components/logging/kind'
import { TagCreateForm } from '@/components/settings/TagForms'
import { LinkButton } from '@/components/ui/Button'
import { Card, EmptyState, SectionTitle } from '@/components/ui/primitives'
import { requirePageMember } from '@/lib/auth/member'
import { activeChildren } from '@/lib/db/context'
import { listTags } from '@/lib/db/tags'
import { can } from '@/lib/domain/intents'
import { formatShortDate } from '@/lib/time/zoned'

export const metadata: Metadata = { title: 'NFC stickers' }

export default async function TagsPage() {
  const { ctx, supabase } = await requirePageMember('/settings/tags')
  if (!can.manageTags(ctx.membership.role)) redirect('/settings')
  const tags = await listTags(supabase, ctx.membership.householdId)
  const children = activeChildren(ctx)
  const names = new Map(ctx.children.map((c) => [c.id, c.nickname]))
  const active = tags.filter((t) => !t.revokedAt)
  const retired = tags.filter((t) => t.revokedAt)
  const tz = ctx.household.timezone

  return (
    <AppShell
      title="NFC stickers"
      back={{ href: '/settings', label: 'Back to settings' }}
      actions={
        active.length ? (
          <Link
            href="/settings/tags/print"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:text-text"
          >
            <PrinterIcon />
            <span className="sr-only">Print labels</span>
          </Link>
        ) : null
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2" aria-labelledby="active-tags">
          <SectionTitle id="active-tags">Active stickers</SectionTitle>
          {active.length === 0 ? (
            <EmptyState title="No stickers yet">
              Create one link per sticker below — Wet, Poop, Both and Feed — then write each link to
              a physical NFC sticker.
            </EmptyState>
          ) : (
            <Card className="divide-y divide-border">
              {active.map((t) => (
                <Link
                  key={t.id}
                  href={`/settings/tags/${t.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3"
                >
                  <KindBadge intent={t.purpose} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{t.label}</span>
                    <span className="block text-sm text-muted">
                      {children.length > 1 ? `${names.get(t.childId)} · ` : ''}
                      {t.testedAt ? 'Tested' : 'Not tested yet'}
                      {t.lastUsedAt
                        ? ` · last used ${formatShortDate(new Date(t.lastUsedAt), tz)}`
                        : ''}
                    </span>
                  </span>
                  <ChevronRightIcon size={20} className="text-muted" />
                </Link>
              ))}
            </Card>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="new-tag">
          <SectionTitle id="new-tag">New sticker</SectionTitle>
          <Card className="p-4">
            <TagCreateForm
              childOptions={children.map((c) => ({ id: c.id, nickname: c.nickname }))}
            />
          </Card>
          <LinkButton href="/settings/tags/print" variant="ghost" icon={<PrinterIcon size={20} />}>
            Print labels &amp; QR codes
          </LinkButton>
        </section>

        {retired.length ? (
          <section className="flex flex-col gap-2" aria-labelledby="retired-tags">
            <SectionTitle id="retired-tags">Retired</SectionTitle>
            <Card className="divide-y divide-border">
              {retired.map((t) => (
                <Link
                  key={t.id}
                  href={`/settings/tags/${t.id}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 text-muted"
                >
                  <KindBadge intent={t.purpose} size="sm" />
                  <span className="min-w-0 flex-1 truncate line-through">{t.label}</span>
                  <span className="text-sm">
                    retired {formatShortDate(new Date(t.revokedAt!), tz)}
                  </span>
                </Link>
              ))}
            </Card>
          </section>
        ) : null}
      </div>
    </AppShell>
  )
}
