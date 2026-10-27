import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, assertSameOrigin, jsonOk, readJson } from '@/lib/http/server'
import { CONSENT_TEXT_VERSION } from '@/lib/notifications/consent'
import { startVerification } from '@/lib/notifications/contacts'

/** Only for your own number, only after ticking the consent box (exact wording version required). */
export const POST = apiRoute('/api/v1/notifications/contact/verify-start', async (request) => {
  assertSameOrigin(request)
  const { ctx } = await requireApiMember(['owner', 'parent'])
  const { consent, consentVersion } = await readJson(
    request,
    z.object({ consent: z.literal(true), consentVersion: z.string() }),
  )
  if (!consent || consentVersion !== CONSENT_TEXT_VERSION) {
    throw new ApiError('VALIDATION', 'Please read and accept the consent text.')
  }
  return jsonOk(await startVerification(ctx))
})
