import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { DownloadIcon } from '@/components/icons'
import { AppShell } from '@/components/layout/AppShell'
import { Card, SectionTitle } from '@/components/ui/primitives'
import { requirePageMember } from '@/lib/auth/member'
import { can } from '@/lib/domain/intents'
import { EXPORT_COLUMNS_DOC } from '@/lib/export/events'

export const metadata: Metadata = { title: 'Privacy & export' }

export default async function PrivacyPage() {
  const { ctx } = await requirePageMember('/settings/privacy')
  if (!can.export(ctx.membership.role)) redirect('/settings')
  return (
    <AppShell title="Privacy & export" back={{ href: '/settings', label: 'Back to settings' }}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2" aria-labelledby="export">
          <SectionTitle id="export">Download your records</SectionTitle>
          <Card className="flex flex-col gap-3 p-4">
            <p className="text-[15px]">
              Every entry, including undone ones, with who logged it and when. Times are given in
              the family zone and in UTC.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <a
                href="/api/v1/export?format=csv"
                download
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-semibold text-primary-fg"
              >
                <DownloadIcon size={20} /> CSV
              </a>
              <a
                href="/api/v1/export?format=json"
                download
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border-strong px-4 font-semibold"
              >
                <DownloadIcon size={20} /> JSON
              </a>
            </div>
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer font-semibold">CSV columns</summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {EXPORT_COLUMNS_DOC.map(([col, desc]) => (
                  <div key={col} className="contents">
                    <dt className="font-mono">{col}</dt>
                    <dd className="text-muted">{desc}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-muted">
                Text that starts with =, +, - or @ is prefixed with &apos; so spreadsheets never run
                it as a formula.
              </p>
            </details>
            <p className="text-sm text-muted">
              The file contains your family’s records — store it privately.
            </p>
          </Card>
        </section>
        <section className="flex flex-col gap-2" aria-labelledby="privacy">
          <SectionTitle id="privacy">How your data is handled</SectionTitle>
          <Card className="p-4">
            <ul className="list-disc space-y-2 pl-5 text-[15px]">
              <li>
                Only invited family members can see entries. Sticker links reveal nothing without
                signing in.
              </li>
              <li>
                No ads, analytics or trackers. Server logs contain no names, notes or numbers.
              </li>
              <li>Phone numbers for texts are encrypted and shown only as the last four digits.</li>
              <li>Undo keeps a record in the history of changes; nothing is silently erased.</li>
              <li>
                To delete the whole family log, export it first, then ask the owner of the site’s
                database to run the documented purge (docs/DATA_MANAGEMENT.md).
              </li>
            </ul>
          </Card>
        </section>
      </div>
    </AppShell>
  )
}
