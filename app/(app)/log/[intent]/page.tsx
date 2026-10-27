import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { LogScreen } from '@/components/logging/LogScreen'
import { requirePageMember } from '@/lib/auth/member'
import { pickChild } from '@/lib/db/context'
import { can, intentFromSlug, intentSlug } from '@/lib/domain/intents'

export const metadata: Metadata = { title: 'Log entry' }

/** Logging without a sticker (Home quick actions). Same form, same idempotent save. */
export default async function LogPage({
  params,
  searchParams,
}: {
  params: Promise<{ intent: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { intent: slug } = await params
  const { child: requestedChild } = await searchParams
  const intent = intentFromSlug(slug)
  if (!intent) notFound()
  const { user, ctx } = await requirePageMember(`/log/${intentSlug(intent)}`)
  if (!can.log(ctx.membership.role)) redirect('/dashboard')
  const child = pickChild(ctx, requestedChild)
  if (!child) redirect('/settings')
  return (
    <LogScreen
      intent={intent}
      userId={user.id}
      child={{ id: child.id, nickname: child.nickname }}
      tagToken={null}
      tagLabel={null}
      timezone={ctx.household.timezone}
      volumeUnit={ctx.household.defaultVolumeUnit}
      returnPath={`/log/${intentSlug(intent)}${requestedChild ? `?child=${child.id}` : ''}`}
    />
  )
}
