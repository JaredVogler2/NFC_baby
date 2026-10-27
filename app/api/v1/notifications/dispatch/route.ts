import { timingSafeEqual } from 'node:crypto'
import { serverEnv } from '@/lib/env/server'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, jsonOk } from '@/lib/http/server'
import { dispatchOutbox } from '@/lib/notifications/dispatch'

/**
 * Process due/retryable texts. For Vercel Cron or any external scheduler:
 * `Authorization: Bearer $CRON_SECRET`. Disabled (404) when CRON_SECRET is not configured.
 */
async function handle(request: Request) {
  const secret = serverEnv().CRON_SECRET
  if (!secret) throw new ApiError('NOT_FOUND')
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    throw new ApiError('UNAUTHENTICATED')
  return jsonOk(await dispatchOutbox({ limit: 25 }))
}

export const GET = apiRoute('/api/v1/notifications/dispatch', handle)
export const POST = apiRoute('/api/v1/notifications/dispatch', handle)
