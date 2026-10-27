'use client'

import { useMemo } from 'react'
import { ScanTestPanel } from '@/components/nfc/ScanTestPanel'
import type { FormState } from '@/lib/logging/attempt'
import { FeedFields, initialFeedForm, type FeedSuggestions } from './FeedFields'
import { LogForm, type LogFormProps } from './LogForm'

export type LogScreenProps = Omit<LogFormProps, 'renderFeeding' | 'topSlot' | 'initialFeeding'> & {
  scanTest?: { tagId: string; purposeLabel: string } | null
  feedSuggestions?: FeedSuggestions | null
  defaultFeedMethod?: 'BOTTLE' | 'NURSING' | null
  /** "Repeat last feed": values shown pre-filled and still require an explicit Save. */
  repeat?: Partial<FormState> | null
}

/** Client composition of the logging form with the feeding section. */
export function LogScreen({
  scanTest,
  feedSuggestions,
  defaultFeedMethod,
  repeat,
  ...props
}: LogScreenProps) {
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
          {scanTest ? (
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
