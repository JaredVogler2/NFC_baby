import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { KIND } from '@/components/logging/kind'
import { PrintButton } from '@/components/settings/PrintButton'
import { LinkButton } from '@/components/ui/Button'
import { requirePageMember } from '@/lib/auth/member'
import { listTags } from '@/lib/db/tags'
import { can } from '@/lib/domain/intents'
import { tagOrigin } from '@/lib/env/origin'
import { qrSvg } from '@/lib/nfc/qr'
import { tagUrl } from '@/lib/nfc/token'

export const metadata: Metadata = { title: 'Print labels' }

const PRINT_WORD = { WET: 'WET', POOP: 'POOP', BOTH: 'BOTH', FEED: 'FEED' } as const

/** Printable labels: big pictogram + word + location + QR. No child name on purpose. */
export default async function PrintLabelsPage() {
  const { ctx, supabase } = await requirePageMember('/settings/tags/print')
  if (!can.manageTags(ctx.membership.role)) redirect('/settings')
  const { origin, warnings } = await tagOrigin()
  const tags = (await listTags(supabase, ctx.membership.householdId)).filter((t) => !t.revokedAt)
  const labels = await Promise.all(
    tags.map(async (t) => ({ tag: t, svg: await qrSvg(tagUrl(origin, t.token)) })),
  )

  return (
    <main id="main" className="mx-auto max-w-[800px] p-4">
      <div className="no-print mb-4 flex flex-col gap-3">
        <h1 className="font-display text-2xl font-bold">Print labels</h1>
        <p className="text-muted">
          Print, cut out and stick each label next to (or on top of) its NFC sticker. The QR code
          opens the same private link.
        </p>
        {warnings.map((w) => (
          <p key={w} className="rounded-xl bg-warning-tint p-3 text-sm">
            {w}
          </p>
        ))}
        <div className="flex gap-2">
          <PrintButton />
          <LinkButton href="/settings/tags">Back</LinkButton>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 print:gap-2">
        {labels.map(({ tag, svg }) => {
          const k = KIND[tag.purpose]
          return (
            <article
              key={tag.id}
              className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-border-strong bg-white p-3 text-black break-inside-avoid"
            >
              <div className="flex flex-1 flex-col gap-1">
                <span
                  className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${k.solid}`}
                  aria-hidden="true"
                >
                  <k.Icon size={30} />
                </span>
                <span className="font-display text-2xl font-black tracking-wide">
                  {PRINT_WORD[tag.purpose]}
                </span>
                <span className="text-sm">{tag.label}</span>
              </div>
              <div
                className="h-24 w-24 shrink-0"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </article>
          )
        })}
      </div>
    </main>
  )
}
