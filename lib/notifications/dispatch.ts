import 'server-only'
import { decryptPhone, hasContactKey, phoneHmac } from '@/lib/crypto/contacts'
import { toCareEvent } from '@/lib/domain/event'
import { serverEnv } from '@/lib/env/server'
import { errorCode, log } from '@/lib/log'
import { createSupabaseAdminClient, hasAdminClient, type AdminSupabase } from '@/lib/supabase/admin'
import { smsProvider } from './providers'
import type { SmsProvider } from './providers/types'
import { renderUpdateText } from './template'

/** Events older than this are never texted (so enabling automatic mode can't send a backlog). */
export const STALE_AFTER_MS = 30 * 60 * 1000
export const MAX_ATTEMPTS = 4
const BACKOFF_SECONDS = [30, 120, 600]

export function backoffSeconds(attempt: number, random = Math.random): number {
  const base = BACKOFF_SECONDS[Math.min(attempt - 1, BACKOFF_SECONDS.length - 1)] ?? 600
  return Math.round(base * (1 + random() * 0.2))
}

type ClaimedRow = {
  id: string
  event_id: string
  user_id: string
  household_id: string
  attempts: number
  event_state: 'ACTIVE' | 'VOID'
  event_created_at: string
  household_mode: 'OFF' | 'COMPOSE' | 'AUTOMATIC'
  household_timezone: string
  household_unit: 'oz' | 'ml'
  phone_ciphertext: string | null
  contact_ok: boolean | null
  contact_opted_out: boolean | null
  member_active: boolean | null
}

export type DispatchSummary = {
  claimed: number
  sent: number
  failed: number
  unknown: number
  canceled: number
}

function statusCallbackUrl(provider: SmsProvider): string | null {
  const appUrl = serverEnv().APP_URL
  if (provider.name !== 'twilio' || !appUrl || !appUrl.startsWith('https://')) return null
  return `${new URL(appUrl).origin}/api/v1/notifications/twilio/status`
}

async function complete(
  admin: AdminSupabase,
  id: string,
  state: string,
  extra: {
    reason?: string
    provider?: string
    messageId?: string
    providerStatus?: string
    errorCode?: string
    nextAttemptAt?: string
  } = {},
) {
  const { error } = await admin.rpc('complete_outbox', {
    p_id: id,
    p_state: state,
    p_reason: extra.reason ?? null,
    p_provider: extra.provider ?? null,
    p_message_id: extra.messageId ?? null,
    p_provider_status: extra.providerStatus ?? null,
    p_error_code: extra.errorCode ?? null,
    p_next_attempt_at: extra.nextAttemptAt ?? null,
  })
  if (error) log.error('outbox.complete_failed', { code: errorCode(error), state })
}

async function processRow(
  admin: AdminSupabase,
  provider: SmsProvider,
  row: ClaimedRow,
  summary: DispatchSummary,
) {
  const cancel = (reason: string) => {
    summary.canceled++
    return complete(admin, row.id, 'CANCELED', { reason })
  }
  if (row.event_state === 'VOID') return cancel('EVENT_VOIDED')
  if (Date.now() - Date.parse(row.event_created_at) > STALE_AFTER_MS) return cancel('STALE')
  if (row.household_mode !== 'AUTOMATIC') return cancel('MODE_OFF')
  if (!row.member_active) return cancel('MEMBER_DISABLED')
  if (!row.phone_ciphertext || row.contact_opted_out) return cancel('OPTED_OUT')
  if (!row.contact_ok) return cancel('NOT_VERIFIED')
  if (!provider.configured || !hasContactKey()) {
    summary.failed++
    return complete(admin, row.id, 'FAILED_PERMANENT', { reason: 'PROVIDER_DISABLED' })
  }

  // The body is rendered now from the current entry (an edit before sending is reflected) and is
  // never stored or logged.
  const { data: eventRow, error } = await admin
    .from('care_event_list')
    .select('*')
    .eq('id', row.event_id)
    .single()
  if (error || !eventRow) return cancel('EVENT_MISSING')
  const body = renderUpdateText(toCareEvent(eventRow), {
    timezone: row.household_timezone,
    unit: row.household_unit,
  })

  let to: string
  try {
    to = decryptPhone(row.phone_ciphertext)
  } catch {
    summary.failed++
    return complete(admin, row.id, 'FAILED_PERMANENT', { reason: 'DECRYPT_FAILED' })
  }

  const outcome = await provider.send({ to, body, statusCallbackUrl: statusCallbackUrl(provider) })
  log.info('outbox.send', {
    provider: provider.name,
    state: outcome.kind,
    attempt: row.attempts,
    code: outcome.kind === 'accepted' ? undefined : outcome.code,
  })
  if (outcome.kind === 'accepted') {
    summary.sent++
    return complete(admin, row.id, 'SENT_TO_PROVIDER', {
      provider: provider.name,
      messageId: outcome.messageId,
      providerStatus: outcome.status,
    })
  }
  if (outcome.kind === 'unknown') {
    // Might have been accepted: never resend automatically (avoid duplicate texts).
    summary.unknown++
    return complete(admin, row.id, 'UNKNOWN', {
      reason: 'PROVIDER_UNCONFIRMED',
      provider: provider.name,
      errorCode: outcome.code,
    })
  }
  if (outcome.optedOut) {
    summary.failed++
    await complete(admin, row.id, 'FAILED_PERMANENT', {
      reason: 'OPTED_OUT',
      provider: provider.name,
      errorCode: outcome.code,
    })
    await admin.rpc('record_opt_out', { p_phone_hmac: phoneHmac(to) })
    return
  }
  if (outcome.retryable && row.attempts < MAX_ATTEMPTS) {
    summary.failed++
    return complete(admin, row.id, 'FAILED_RETRYABLE', {
      reason: 'PROVIDER_RETRY',
      provider: provider.name,
      errorCode: outcome.code,
      nextAttemptAt: new Date(Date.now() + backoffSeconds(row.attempts) * 1000).toISOString(),
    })
  }
  summary.failed++
  return complete(admin, row.id, 'FAILED_PERMANENT', {
    reason: outcome.retryable ? 'MAX_ATTEMPTS' : 'PROVIDER_REJECTED',
    provider: provider.name,
    errorCode: outcome.code,
  })
}

/**
 * Send due notifications. Safe to call concurrently (rows are leased with SKIP LOCKED) and safe to
 * call often (no due rows → no work). Never throws.
 */
export async function dispatchOutbox(
  opts: { eventId?: string | null; limit?: number } = {},
): Promise<DispatchSummary> {
  const summary: DispatchSummary = { claimed: 0, sent: 0, failed: 0, unknown: 0, canceled: 0 }
  if (!hasAdminClient()) return summary
  try {
    const admin = createSupabaseAdminClient()
    await admin.rpc('expire_outbox_leases')
    const { data, error } = await admin.rpc('claim_outbox', {
      p_event_id: opts.eventId ?? null,
      p_limit: opts.limit ?? 10,
      p_lease_seconds: 60,
    })
    if (error) {
      log.error('outbox.claim_failed', { code: errorCode(error) })
      return summary
    }
    const rows = (data ?? []) as ClaimedRow[]
    summary.claimed = rows.length
    const provider = smsProvider()
    for (const row of rows) {
      try {
        await processRow(admin, provider, row, summary)
      } catch (err) {
        // Leave the row leased; the lease expiry turns it into UNKNOWN (no blind resend).
        log.error('outbox.process_failed', { code: errorCode(err) })
      }
    }
  } catch (err) {
    log.error('outbox.dispatch_failed', { code: errorCode(err) })
  }
  return summary
}
