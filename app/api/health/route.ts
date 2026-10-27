import { isConfigured } from '@/lib/env/public'
import { jsonOk } from '@/lib/http/server'

/** Liveness probe. Reveals only whether the database is configured, never any data. */
export async function GET() {
  return jsonOk({ ok: true, configured: isConfigured() })
}
