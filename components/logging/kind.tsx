import type { ComponentType, SVGProps } from 'react'
import { BothIcon, BottleIcon, NursingIcon, PoopIcon, WetIcon } from '@/components/icons'
import type { ButtonVariant } from '@/components/ui/Button'
import { INTENT_LABEL, INTENT_LOG_TITLE, type Intent, type Subtype } from '@/lib/domain/intents'

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>

/** Visual identity per entry kind: always icon + word + colour (never colour alone). */
export const KIND: Record<
  Intent,
  {
    label: string
    title: string
    Icon: Icon
    variant: ButtonVariant
    tint: string
    ink: string
    solid: string
    ring: string
  }
> = {
  WET: {
    label: INTENT_LABEL.WET,
    title: INTENT_LOG_TITLE.WET,
    Icon: WetIcon,
    variant: 'wet',
    tint: 'bg-wet-tint',
    ink: 'text-wet-ink',
    solid: 'bg-wet text-wet-fg',
    ring: 'border-wet',
  },
  POOP: {
    label: INTENT_LABEL.POOP,
    title: INTENT_LOG_TITLE.POOP,
    Icon: PoopIcon,
    variant: 'poop',
    tint: 'bg-poop-tint',
    ink: 'text-poop-ink',
    solid: 'bg-poop text-poop-fg',
    ring: 'border-poop',
  },
  BOTH: {
    label: INTENT_LABEL.BOTH,
    title: INTENT_LOG_TITLE.BOTH,
    Icon: BothIcon,
    variant: 'both',
    tint: 'bg-both-tint',
    ink: 'text-both-ink',
    solid: 'bg-both text-both-fg',
    ring: 'border-both',
  },
  FEED: {
    label: INTENT_LABEL.FEED,
    title: INTENT_LOG_TITLE.FEED,
    Icon: BottleIcon,
    variant: 'feed',
    tint: 'bg-feed-tint',
    ink: 'text-feed-ink',
    solid: 'bg-feed text-feed-fg',
    ring: 'border-feed',
  },
}

/** Pictogram for an entry (nursing has its own icon; bottle uses the feed icon). */
export function EntryIcon({
  intent,
  subtype,
  size = 24,
}: {
  intent: Intent
  subtype?: Subtype
  size?: number
}) {
  if (subtype === 'NURSING') return <NursingIcon size={size} />
  switch (intent) {
    case 'WET':
      return <WetIcon size={size} />
    case 'POOP':
      return <PoopIcon size={size} />
    case 'BOTH':
      return <BothIcon size={size} />
    case 'FEED':
      return <BottleIcon size={size} />
  }
}

export function KindBadge({
  intent,
  subtype,
  size = 'md',
}: {
  intent: Intent
  subtype?: Subtype
  size?: 'sm' | 'md' | 'lg'
}) {
  const k = KIND[intent]
  const box =
    size === 'lg'
      ? 'h-16 w-16 rounded-2xl'
      : size === 'sm'
        ? 'h-9 w-9 rounded-xl'
        : 'h-11 w-11 rounded-xl'
  const icon = size === 'lg' ? 34 : size === 'sm' ? 20 : 24
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${box} ${k.tint} ${k.ink}`}
      aria-hidden="true"
    >
      <EntryIcon intent={intent} subtype={subtype} size={icon} />
    </span>
  )
}
