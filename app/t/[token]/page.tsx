import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { LogScreen } from '@/components/logging/LogScreen'
import { NotConfigured } from '@/components/layout/NotConfigured'
import { TagGate, TagRetired, TagViewOnly } from '@/components/nfc/TagStates'
import { getSessionUser } from '@/lib/auth/session'
import { loadMyContext } from '@/lib/db/context'
import { getFeedSuggestions } from '@/lib/db/events'
import { resolveTag } from '@/lib/db/tags'
import { INTENT_LOG_TITLE, can } from '@/lib/domain/intents'
import { isConfigured } from '@/lib/env/public'
import { isTagToken } from '@/lib/nfc/token'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// No child name or purpose in the document title (it shows in history/tab switchers).
export const metadata: Metadata = { title: 'Log entry' }

/**
 * NFC landing page. GET is strictly read-only for every visitor: no event, no "last used", no
 * notification — repeated scans, refreshes, link previews and prefetches change nothing.
 */
export default async function TagPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isConfigured()) return <NotConfigured />

  const user = await getSessionUser()
  // Signed out: one generic gate for valid, unknown and revoked tokens alike.
  if (!user) return <TagGate token={isTagToken(token) ? token : 'invalid'} />

  if (!isTagToken(token)) notFound()
  const supabase = await createSupabaseServerClient()
  const ctx = await loadMyContext(supabase)
  if (!ctx?.membership) redirect('/setup')

  const resolved = await resolveTag(supabase, token)
  // Unknown token and another family's token look exactly the same.
  if (!resolved) notFound()

  const role = resolved.role
  if (resolved.status === 'REVOKED') return <TagRetired canManage={can.manageTags(role)} />
  if (!can.log(role)) return <TagViewOnly />
  const feedSuggestions =
    resolved.tag.purpose === 'FEED' ? await getFeedSuggestions(supabase, resolved.child.id) : null

  return (
    <LogScreen
      intent={resolved.tag.purpose}
      userId={user.id}
      child={{ id: resolved.child.id, nickname: resolved.child.nickname }}
      tagToken={resolved.tag.token}
      tagLabel={resolved.tag.label}
      timezone={resolved.household.timezone}
      volumeUnit={resolved.household.defaultVolumeUnit}
      returnPath={`/t/${token}`}
      feedSuggestions={feedSuggestions}
      defaultFeedMethod={resolved.household.defaultFeedMethod}
      scanTest={
        can.manageTags(role) && !resolved.tag.testedAt
          ? { tagId: resolved.tag.id, purposeLabel: INTENT_LOG_TITLE[resolved.tag.purpose] }
          : null
      }
    />
  )
}
