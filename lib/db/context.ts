import 'server-only'
import type { Role } from '@/lib/domain/intents'
import type { VolumeUnit } from '@/lib/domain/units'
import type { ServerSupabase } from '@/lib/supabase/server'
import { toApiError } from './errors'

export type NotificationMode = 'OFF' | 'COMPOSE' | 'AUTOMATIC'

export type MemberContext = {
  userId: string
  displayName: string | null
  membership: { householdId: string; role: Role }
  household: {
    id: string
    displayName: string
    timezone: string
    notificationMode: NotificationMode
    defaultFeedMethod: 'BOTTLE' | 'NURSING' | null
    defaultVolumeUnit: VolumeUnit
  }
  children: { id: string; nickname: string; archived: boolean }[]
  members: { userId: string; displayName: string; role: Role; disabled: boolean }[]
}

export type MyContext =
  MemberContext | { userId: string; displayName: string | null; membership: null }

export async function loadMyContext(supabase: ServerSupabase): Promise<MyContext | null> {
  const { data, error } = await supabase.rpc('get_my_context')
  if (error) throw toApiError(error, 'get_my_context')
  return (data as MyContext | null) ?? null
}

export function activeChildren(ctx: MemberContext) {
  return ctx.children.filter((c) => !c.archived)
}

/** The selected child: explicit id if it belongs to the family, else the first active child. */
export function pickChild(ctx: MemberContext, requested?: string | null) {
  const active = activeChildren(ctx)
  return active.find((c) => c.id === requested) ?? active[0] ?? null
}
