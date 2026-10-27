import 'server-only'
import { randomInt } from 'node:crypto'
import { encryptPhone, hashVerificationCode, phoneHmac, decryptPhone } from '@/lib/crypto/contacts'
import type { MemberContext } from '@/lib/db/context'
import { toApiError } from '@/lib/db/errors'
import { can } from '@/lib/domain/intents'
import { ApiError } from '@/lib/http/errors'
import { errorCode, log } from '@/lib/log'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { CONSENT_TEXT_VERSION, TEST_SMS, VERIFICATION_SMS } from './consent'
import { last4, normalizePhone } from './phone'
import { smsAvailability, smsProvider } from './providers'

const OPTED_OUT_MESSAGE =
  'This number replied STOP to our texts. Reply START to that text first, then ask for a new code.'

/** Owners manage any adult's number; everyone else only their own. Only owners/parents get texts. */
function assertCanManage(ctx: MemberContext, targetUserId: string) {
  const target = ctx.members.find((m) => m.userId === targetUserId && !m.disabled)
  if (!target) throw new ApiError('NOT_FOUND')
  if (!can.receiveTexts(target.role)) {
    throw new ApiError('VALIDATION', 'Only owners and parents can receive automatic texts.')
  }
  if (targetUserId !== ctx.userId && ctx.membership.role !== 'owner')
    throw new ApiError('FORBIDDEN')
  return target
}

export async function setContact(ctx: MemberContext, targetUserId: string, rawPhone: string) {
  assertCanManage(ctx, targetUserId)
  const e164 = normalizePhone(rawPhone)
  if (!e164) {
    throw new ApiError('VALIDATION', 'Enter a US or Canadian mobile number, e.g. (555) 555-0123.', {
      fields: { phone: 'Enter a US or Canadian mobile number, e.g. (555) 555-0123.' },
    })
  }
  const { error } = await createSupabaseAdminClient().rpc('set_contact', {
    p_household_id: ctx.membership.householdId,
    p_user_id: targetUserId,
    p_ciphertext: encryptPhone(e164),
    p_hmac: phoneHmac(e164),
    p_last4: last4(e164),
    p_set_by: ctx.userId,
  })
  if (error) throw toApiError(error, 'set_contact')
  return { last4: last4(e164) }
}

async function loadContact(ctx: MemberContext, userId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from('notification_contacts')
    .select('phone_ciphertext, phone_hmac, verified_at, consent_at, opted_out_at')
    .eq('household_id', ctx.membership.householdId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw toApiError(error, 'load_contact')
  return data
}

/** Send a 6-digit code to the caller's own number after they ticked the consent box. */
export async function startVerification(ctx: MemberContext) {
  assertCanManage(ctx, ctx.userId)
  const availability = smsAvailability()
  if (!availability.available)
    throw new ApiError('NOT_CONFIGURED', availability.reason ?? undefined)
  const contact = await loadContact(ctx, ctx.userId)
  if (!contact) throw new ApiError('VALIDATION', 'Add your number first.')
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.rpc('begin_contact_verification', {
    p_household_id: ctx.membership.householdId,
    p_user_id: ctx.userId,
    p_code_hash: hashVerificationCode(code, contact.phone_hmac),
    p_ttl_seconds: 600,
  })
  if (error) throw toApiError(error, 'begin_contact_verification')
  if (data === 'too_soon')
    throw new ApiError(
      'RATE_LIMITED',
      'A code was just sent. Wait a minute before asking for another.',
    )
  if (data === 'daily_limit')
    throw new ApiError('RATE_LIMITED', 'Too many codes today. Try again tomorrow.')
  if (data === 'opted_out') throw new ApiError('VALIDATION', OPTED_OUT_MESSAGE)
  if (data !== 'ok') throw new ApiError('VALIDATION', 'Add your number first.')
  const outcome = await smsProvider().send({
    to: decryptPhone(contact.phone_ciphertext),
    body: VERIFICATION_SMS(code),
  })
  log.info('contact.verification_sent', { state: outcome.kind })
  if (outcome.kind === 'rejected') {
    if (outcome.optedOut) {
      await admin.rpc('record_opt_out', { p_phone_hmac: contact.phone_hmac })
      throw new ApiError('UNAVAILABLE', OPTED_OUT_MESSAGE)
    }
    throw new ApiError(
      'UNAVAILABLE',
      'The text provider could not send the code to this number. Check the number and try again.',
    )
  }
  return { sent: outcome.kind === 'accepted' ? 'accepted' : 'unconfirmed' }
}

export async function confirmVerification(ctx: MemberContext, code: string) {
  assertCanManage(ctx, ctx.userId)
  const contact = await loadContact(ctx, ctx.userId)
  if (!contact) throw new ApiError('VALIDATION', 'Add your number first.')
  const { data, error } = await createSupabaseAdminClient().rpc('confirm_contact_verification', {
    p_household_id: ctx.membership.householdId,
    p_user_id: ctx.userId,
    p_code_hash: hashVerificationCode(code, contact.phone_hmac),
    p_consent_version: CONSENT_TEXT_VERSION,
  })
  if (error) throw toApiError(error, 'confirm_contact_verification')
  const messages: Record<string, string> = {
    opted_out: OPTED_OUT_MESSAGE,
    no_code: 'Ask for a new code first.',
    expired: 'That code expired. Ask for a new one.',
    too_many_attempts: 'Too many wrong tries. Ask for a new code.',
    wrong_code: 'That code is not right. Check the text and try again.',
  }
  if (data !== 'ok')
    throw new ApiError('VALIDATION', messages[String(data)] ?? 'Could not verify.', {
      fields: { code: messages[String(data)] ?? 'Could not verify.' },
    })
}

export async function stopTexts(ctx: MemberContext, userId: string) {
  assertCanManage(ctx, userId)
  const { error } = await createSupabaseAdminClient().rpc('opt_out_contact', {
    p_household_id: ctx.membership.householdId,
    p_user_id: userId,
  })
  if (error) throw toApiError(error, 'opt_out_contact')
}

export async function removeContact(ctx: MemberContext, userId: string) {
  assertCanManage(ctx, userId)
  const admin = createSupabaseAdminClient()
  await admin.rpc('opt_out_contact', {
    p_household_id: ctx.membership.householdId,
    p_user_id: userId,
  })
  const { error } = await admin
    .from('notification_contacts')
    .delete()
    .eq('household_id', ctx.membership.householdId)
    .eq('user_id', userId)
  if (error) throw toApiError(error, 'remove_contact')
}

/**
 * Owner-only, explicitly confirmed, one message to one verified, consenting adult who has
 * automatic texts on, while the family is in automatic mode. At most 3 per family per hour,
 * reserved atomically before anything is sent.
 */
export async function sendTestText(ctx: MemberContext, userId: string) {
  if (ctx.membership.role !== 'owner') throw new ApiError('FORBIDDEN')
  const target = assertCanManage(ctx, userId)
  if (ctx.household.notificationMode !== 'AUTOMATIC') {
    throw new ApiError('VALIDATION', 'Turn on automatic texts for the family first.')
  }
  const availability = smsAvailability()
  if (!availability.available)
    throw new ApiError('NOT_CONFIGURED', availability.reason ?? undefined)
  const admin = createSupabaseAdminClient()
  const contact = await loadContact(ctx, userId)
  const { data: prefs } = await admin
    .from('notification_preferences')
    .select('auto_sms_enabled')
    .eq('household_id', ctx.membership.householdId)
    .eq('user_id', userId)
    .maybeSingle()
  if (
    !contact ||
    !contact.verified_at ||
    !contact.consent_at ||
    contact.opted_out_at ||
    !prefs?.auto_sms_enabled
  ) {
    throw new ApiError(
      'VALIDATION',
      `${target.displayName} needs a verified number with texts turned on first.`,
    )
  }
  const { data: testId, error: reserveError } = await admin.rpc('reserve_test_text', {
    p_household_id: ctx.membership.householdId,
    p_user_id: userId,
    p_requested_by: ctx.userId,
  })
  if (reserveError) throw toApiError(reserveError, 'reserve_test_text')
  if (!testId)
    throw new ApiError('RATE_LIMITED', 'Three test texts were sent in the last hour. Try later.')
  const outcome = await smsProvider().send({
    to: decryptPhone(contact.phone_ciphertext),
    body: TEST_SMS(target.displayName),
  })
  const state =
    outcome.kind === 'accepted'
      ? 'SENT_TO_PROVIDER'
      : outcome.kind === 'unknown'
        ? 'UNKNOWN'
        : 'FAILED_PERMANENT'
  const { error } = await admin
    .from('notification_tests')
    .update({
      state,
      provider_message_id: outcome.kind === 'accepted' ? outcome.messageId : null,
      provider_error_code: outcome.kind === 'accepted' ? null : outcome.code,
    })
    .eq('id', testId as string)
  if (error) log.warn('notification_test.log_failed', { code: errorCode(error) })
  if (outcome.kind === 'rejected' && outcome.optedOut) {
    await admin.rpc('record_opt_out', { p_phone_hmac: contact.phone_hmac })
  }
  return { state }
}
