import Link from 'next/link'
import { EntryIcon, KIND } from '@/components/logging/kind'
import { intentSlug, type Intent } from '@/lib/domain/intents'

/** Large logging shortcuts for when no sticker is nearby. Plain links (GET opens a form only). */
export function QuickLog({ childQuery }: { childQuery: string }) {
  const tile = (intent: Intent, wide = false) => {
    const k = KIND[intent]
    return (
      <Link
        key={intent}
        href={`/log/${intentSlug(intent)}${childQuery}`}
        prefetch={false}
        className={`flex min-h-20 items-center justify-center gap-2 rounded-2xl px-3 text-center font-semibold ${k.solid} ${wide ? 'col-span-3 min-h-16 text-lg' : 'flex-col'}`}
      >
        <EntryIcon intent={intent} size={wide ? 26 : 28} />
        <span>
          {intent === 'FEED' ? 'Feeding' : intent === 'BOTH' ? 'Wet + poop' : k.label.split(' ')[0]}
        </span>
      </Link>
    )
  }
  return (
    <section aria-labelledby="quick-log" className="flex flex-col gap-2">
      <h2 id="quick-log" className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">
        Log
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {tile('WET')}
        {tile('POOP')}
        {tile('BOTH')}
        {tile('FEED', true)}
      </div>
    </section>
  )
}
