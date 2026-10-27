'use client'

import { useEffect, useMemo } from 'react'
import { ScanTestPanel } from '@/components/nfc/ScanTestPanel'
import { PendingNotice } from '@/components/offline/PendingNotice'
import type { FormState } from '@/lib/logging/attempt'
import { rememberTag } from '@/lib/offline/drafts'
import { FeedFields, initialFeedForm, type FeedSuggestions } from './FeedFields'
import { LogForm, type LogFormProps } from './LogForm'

export type LogScreenProps = Omit<LogFormProps, 'renderFeeding' | 'topSlot' | 'initialFeeding'> & {
  scanTest?: { tagId: string; purposeLabel: string } | null
  feedSuggestions?: FeedSuggestions | null
  defaultFeedMethod?: 'BOTTLE' | 'NURSING' | null
  /** "Repeat last feed": values shown pre-filled and still require an explicit Save. */
  repeat?: Partial<FormState> | null
  /** Rendered from data cached on this phone because the network is unavailable. */
  offline?: boolean
}

/** Client composition of the logging form with the feeding section. */
export function LogScreen({
  scanTest,
  feedSuggestions,
  defaultFeedMethod,
  repeat,
  offline,
  ...props
}: LogScreenProps) {
  const { tagToken, tagLabel, userId, householdId, intent, child, timezone, volumeUnit } = props
  // Remember this sticker on this phone so a scan without signal can still show its form.
  useEffect(() => {
    if (!tagToken || offline) return
    rememberTag({
      token: tagToken,
      userId,
      householdId,
      intent,
      childId: child.id,
      childNickname: child.nickname,
      tagLabel,
      timezone,
      volumeUnit,
      defaultFeedMethod: defaultFeedMethod ?? null,
    }).catch(() => undefined)
  }, [
    tagToken,
    tagLabel,
    userId,
    householdId,
    intent,
    child.id,
    child.nickname,
    timezone,
    volumeUnit,
    defaultFeedMethod,
    offline,
  ])

  const initialFeeding = useMemo(
    () =>
      props.intent === 'FEED'
        ? {
            ...initialFeedForm(
              feedSuggestions ?? null,
              defaultFeedMethod ?? null,
              props.volumeUnit,
            ),
            ...repeat,
          }
        : undefined,
    [props.intent, props.volumeUnit, feedSuggestions, defaultFeedMethod, repeat],
  )
  const formKey = props.tagToken ? `tag:${props.tagToken}` : `log:${props.intent}:${props.child.id}`
  return (
    <LogForm
      {...props}
      initialFeeding={initialFeeding}
      topSlot={
        <>
          {offline ? (
            <p className="rounded-xl border border-border-strong bg-surface-2 px-3 py-2 text-[15px]">
              <strong>No connection.</strong> This form was kept on this phone. If you save, the
              entry stays pending here until you’re back online — nothing is shared or texted yet.
            </p>
          ) : null}
          {offline ? null : <PendingNotice userId={userId} householdId={householdId} />}
          {scanTest && !offline ? (
            <ScanTestPanel
              tagId={scanTest.tagId}
              purposeLabel={scanTest.purposeLabel}
              childName={props.child.nickname}
            />
          ) : null}
          {repeat ? (
            <p className="rounded-xl bg-feed-tint px-3 py-2 text-[15px] text-feed-ink">
              Filled in from the last feeding. Check the time and amount, then tap Save.
            </p>
          ) : null}
        </>
      }
      renderFeeding={(slot) => (
        <FeedFields
          {...slot}
          suggestions={feedSuggestions}
          timerKey={formKey}
          timezone={props.timezone}
        />
      )}
    />
  )
}
