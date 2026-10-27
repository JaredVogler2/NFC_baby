'use client'

import type { FormState } from '@/lib/logging/attempt'
import { LogForm, type LogFormProps } from './LogForm'
import { ScanTestPanel } from '@/components/nfc/ScanTestPanel'

export type LogScreenProps = Omit<LogFormProps, 'renderFeeding' | 'topSlot' | 'initialFeeding'> & {
  initialFeeding?: Partial<FormState>
  scanTest?: { tagId: string; purposeLabel: string } | null
}

/** Client composition of the logging form (feeding fields are plugged in here in phase 06). */
export function LogScreen({ scanTest, ...props }: LogScreenProps) {
  return (
    <LogForm
      {...props}
      topSlot={
        scanTest ? (
          <ScanTestPanel
            tagId={scanTest.tagId}
            purposeLabel={scanTest.purposeLabel}
            childName={props.child.nickname}
          />
        ) : null
      }
    />
  )
}
