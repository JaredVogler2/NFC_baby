import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { AppShell } from '@/components/layout/AppShell'
import { KIND, KindBadge } from '@/components/logging/kind'
import { CopyField, RevokeTagButton, TagEditForm } from '@/components/settings/TagForms'
import { LinkButton } from '@/components/ui/Button'
import { Banner, Card, SectionTitle } from '@/components/ui/primitives'
import { requirePageMember } from '@/lib/auth/member'
import { activeChildren } from '@/lib/db/context'
import { getTag } from '@/lib/db/tags'
import { can } from '@/lib/domain/intents'
import { tagOrigin } from '@/lib/env/origin'
import { qrSvg } from '@/lib/nfc/qr'
import { tagUrl } from '@/lib/nfc/token'
import { formatShortDate } from '@/lib/time/zoned'

export const metadata: Metadata = { title: 'Sticker' }

export default async function TagDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { id } = await params
  const { created } = await searchParams
  if (!z.uuid().safeParse(id).success) notFound()
  const { ctx, supabase } = await requirePageMember(`/settings/tags/${id}`)
  if (!can.manageTags(ctx.membership.role)) redirect('/settings')
  const tag = await getTag(supabase, id)
  if (!tag) notFound()
  const { origin, warnings } = await tagOrigin()
  const url = tagUrl(origin, tag.token)
  const svg = tag.revokedAt ? null : await qrSvg(url)
  const kind = KIND[tag.purpose]
  const tz = ctx.household.timezone
  const children = activeChildren(ctx)

  return (
    <AppShell title="Sticker" back={{ href: '/settings/tags', label: 'Back to stickers' }}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <KindBadge intent={tag.purpose} />
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-bold">{tag.label}</p>
            <p className="text-muted">
              {kind.title} · {ctx.children.find((c) => c.id === tag.childId)?.nickname}
            </p>
          </div>
        </div>

        {created ? (
          <Banner tone="success" role="status" title="Sticker link created">
            Nothing was logged. Write the link below to an NFC sticker, then scan it to test.
          </Banner>
        ) : null}

        {tag.revokedAt ? (
          <Banner tone="warning" title="Retired">
            Retired on {formatShortDate(new Date(tag.revokedAt), tz)}. Scanning it shows “Sticker
            retired” and logs nothing. Create a new sticker to replace it.
          </Banner>
        ) : (
          <>
            {warnings.map((w) => (
              <Banner key={w} tone="warning" title="Check before writing a sticker">
                {w}
              </Banner>
            ))}
            <Card className="flex flex-col gap-4 p-4">
              <CopyField label="Sticker link (write this to the NFC tag)" value={url} />
              <div className="flex items-center gap-4">
                <div
                  className="h-32 w-32 shrink-0 rounded-xl bg-white p-1"
                  role="img"
                  aria-label="QR code with the same link"
                  dangerouslySetInnerHTML={{ __html: svg ?? '' }}
                />
                <p className="text-sm text-muted">
                  QR fallback: same link, for phones without NFC or a flaky sticker. It is not a
                  password — scanning still requires signing in.
                </p>
              </div>
              <p className="text-sm">
                Status:{' '}
                <strong>
                  {tag.testedAt
                    ? `tested ${formatShortDate(new Date(tag.testedAt), tz)}`
                    : 'not tested yet'}
                </strong>
                {tag.lastUsedAt
                  ? ` · last used ${formatShortDate(new Date(tag.lastUsedAt), tz)} (${tag.useCount} entries)`
                  : ''}
              </p>
              <LinkButton href={`/t/${tag.token}`} variant="primary" block>
                Open test link
              </LinkButton>
            </Card>

            <section className="flex flex-col gap-2" aria-labelledby="program-steps">
              <SectionTitle id="program-steps">Write it to a sticker (iPhone)</SectionTitle>
              <Card className="p-4">
                <ol className="list-decimal space-y-2 pl-5 text-[15px]">
                  <li>
                    Tap <strong>Copy</strong> above.
                  </li>
                  <li>
                    Open an NFC writer app (for example NFC Tools) → <strong>Write</strong> →{' '}
                    <strong>Add a record</strong> → <strong>URL / URI</strong>.
                  </li>
                  <li>Paste the full link (it starts with https://) and confirm.</li>
                  <li>
                    Tap <strong>Write</strong> and hold the top of the iPhone to the sticker until
                    it confirms.
                  </li>
                  <li>
                    Use <strong>Read</strong> to check the link matches exactly.
                  </li>
                  <li>
                    Lock the screen, unlock, hold the phone near the sticker, tap the notification,
                    and check this screen opens “{kind.title}”. Then tap{' '}
                    <strong>Mark sticker as tested</strong> there.
                  </li>
                </ol>
                <p className="mt-3 text-sm text-muted">
                  Keep stickers out of reach of babies and toddlers (choking hazard). On metal, use
                  an anti-metal (ferrite) NFC tag. Full guide: docs/NFC_STICKER_SETUP.md.
                </p>
              </Card>
            </section>

            <section className="flex flex-col gap-2" aria-labelledby="edit-tag">
              <SectionTitle id="edit-tag">Edit</SectionTitle>
              <Card className="p-4">
                <TagEditForm
                  tag={{ id: tag.id, purpose: tag.purpose, label: tag.label, childId: tag.childId }}
                  childOptions={children.map((c) => ({ id: c.id, nickname: c.nickname }))}
                />
              </Card>
            </section>

            <section className="flex flex-col gap-2" aria-labelledby="retire-tag">
              <SectionTitle id="retire-tag">Lost or replaced?</SectionTitle>
              <RevokeTagButton tagId={tag.id} />
            </section>
          </>
        )}
      </div>
    </AppShell>
  )
}
