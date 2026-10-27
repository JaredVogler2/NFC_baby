import { z } from 'zod'
import { requireApiMember } from '@/lib/auth/member'
import { getTag } from '@/lib/db/tags'
import { tagOrigin } from '@/lib/env/origin'
import { ApiError } from '@/lib/http/errors'
import { apiRoute, NO_STORE_HEADERS } from '@/lib/http/server'
import { qrSvg } from '@/lib/nfc/qr'
import { tagUrl } from '@/lib/nfc/token'

/** QR fallback image (SVG) encoding the same URL as the sticker. */
export const GET = apiRoute<{ params: Promise<{ ref: string }> }>(
  '/api/v1/tags/:id/qr',
  async (_request, { params }) => {
    const { ref } = await params
    if (!z.uuid().safeParse(ref).success) throw new ApiError('NOT_FOUND')
    const { supabase } = await requireApiMember(['owner', 'parent'])
    const tag = await getTag(supabase, ref)
    if (!tag || tag.revokedAt) throw new ApiError('NOT_FOUND')
    const { origin } = await tagOrigin()
    return new Response(await qrSvg(tagUrl(origin, tag.token)), {
      headers: { ...NO_STORE_HEADERS, 'Content-Type': 'image/svg+xml; charset=utf-8' },
    })
  },
)
