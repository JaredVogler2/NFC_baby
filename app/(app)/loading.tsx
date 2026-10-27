import { Skeleton } from '@/components/ui/primitives'

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 px-4 pt-20" aria-busy="true">
      <span className="sr-only" role="status">
        Loading
      </span>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
      <Skeleton className="h-40" />
    </div>
  )
}
