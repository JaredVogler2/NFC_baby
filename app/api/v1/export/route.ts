import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { activeChildren } from '@/lib/db/context'
import { listAllEvents } from '@/lib/db/events'
import type { CareEvent } from '@/lib/domain/event'
import { eventsToCsv } from '@/lib/export/events'
import { apiRoute, NO_STORE_HEADERS, parseQuery } from '@/lib/http/server'

/** Owner/parent export of every entry (including undone ones) as CSV or JSON. Never cached. */
export const GET = apiRoute('/api/v1/export', async (request) => {
  const { ctx, supabase } = await requireApiMember(['owner', 'parent'])
  const { format } = parseQuery(
    new URL(request.url),
    z.object({ format: z.enum(['csv', 'json']).default('csv') }),
  )
  const events: CareEvent[] = []
  for (const child of ctx.children) events.push(...(await listAllEvents(supabase, child.id)))
  const stamp = new Date().toISOString().slice(0, 10)
  const names = new Map(ctx.children.map((c) => [c.id, c.nickname]))
  const headers = { ...NO_STORE_HEADERS, 'X-Content-Type-Options': 'nosniff' }
  if (format === 'json') {
    const body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        timezone: ctx.household.timezone,
        children: activeChildren(ctx).map((c) => ({ id: c.id, nickname: c.nickname })),
        events,
      },
      null,
      2,
    )
    return new Response(body, {
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="nfc-baby-export-${stamp}.json"`,
      },
    })
  }
  return new Response(eventsToCsv(events, ctx.household.timezone, names), {
    headers: {
      ...headers,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nfc-baby-export-${stamp}.csv"`,
    },
  })
})
