import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { LogScreen } from '@/components/logging/LogScreen'
import { requirePageMember } from '@/lib/auth/member'
import { pickChild } from '@/lib/db/context'
import { getFeedSuggestions, lastFeedAsForm } from '@/lib/db/events'
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
  const { child: requestedChild, repeat } = await searchParams
  const intent = intentFromSlug(slug)
  if (!intent) notFound()
  const { user, ctx, supabase } = await requirePageMember(`/log/${intentSlug(intent)}`)
  if (!can.log(ctx.membership.role)) redirect('/dashboard')
  const child = pickChild(ctx, requestedChild)
  if (!child) redirect('/settings')
  const feedSuggestions = intent === 'FEED' ? await getFeedSuggestions(supabase, child.id) : null
  const repeatValues =
    intent === 'FEED' && repeat === '1' ? await lastFeedAsForm(supabase, child.id) : null
  return (
    <LogScreen
      intent={intent}
      userId={user.id}
      householdId={ctx.membership.householdId}
      child={{ id: child.id, nickname: child.nickname }}
      tagToken={null}
      tagLabel={null}
      timezone={ctx.household.timezone}
      volumeUnit={ctx.household.defaultVolumeUnit}
      returnPath={`/log/${intentSlug(intent)}${requestedChild ? `?child=${child.id}` : ''}`}
      feedSuggestions={feedSuggestions}
      defaultFeedMethod={ctx.household.defaultFeedMethod}
      repeat={repeatValues}
    />
  )
}
