import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getPublicEnv } from '@/lib/env/public'
import { serverEnv } from '@/lib/env/server'
import { ApiError } from '@/lib/http/errors'
import { errorCode, log } from '@/lib/log'
import { createSupabaseAdminClient, hasAdminClient } from '@/lib/supabase/admin'
import { safeNextPath } from './redirect'

export const NEXT_COOKIE = 'nfcb_next'

export type SendResult = 'sent' | 'unknown_user' | 'rate_limited' | 'unavailable'

/**
 * Ask Supabase Auth to email a sign-in code + link. Never creates users (invite-only). Uses a
 * stateless client: the code/link is verified later by the session-bound server client.
 */
export async function sendSignInCode(email: string): Promise<SendResult> {
  const env = getPublicEnv()
  if (!env) throw new ApiError('NOT_CONFIGURED')
  const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'implicit',
    },
  })
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  if (!error) return 'sent'
  const code = (error as { code?: string }).code ?? ''
  if (error.status === 429 || code.startsWith('over_')) return 'rate_limited'
  if (
    code === 'otp_disabled' ||
    code === 'signup_disabled' ||
    code === 'user_not_found' ||
    error.status === 422 ||
    error.status === 400
  ) {
    return 'unknown_user'
  }
  log.warn('auth.otp_failed', { code: errorCode(error), status: error.status })
  return 'unavailable'
}

/**
 * One sign-in code request per address per cooldown, applied identically to members and unknown
 * addresses (the rate-limit response must not reveal who is a member). Fails open when the
 * database can't be asked: Supabase Auth's own limits still apply.
 */
export async function takeAuthCodeSlot(email: string): Promise<boolean> {
  if (!hasAdminClient()) return true
  const { data, error } = await createSupabaseAdminClient().rpc('take_auth_code_slot', {
    p_email_hash: hashToken(`otp:${email}`),
    p_cooldown_seconds: serverEnv().AUTH_CODE_COOLDOWN_SECONDS,
  })
  if (error) {
    log.warn('auth.otp_slot_failed', { code: errorCode(error) })
    return true
  }
  return data === true
}

/** First-owner bootstrap: create the auth user for BOOTSTRAP_OWNER_EMAIL while no family exists. */
export async function ensureBootstrapUser(email: string): Promise<void> {
  const configured = serverEnv().BOOTSTRAP_OWNER_EMAIL?.toLowerCase()
  if (!configured || configured !== email || !hasAdminClient()) return
  const admin = createSupabaseAdminClient()
  const { data: exists, error } = await admin.rpc('households_exist')
  if (error || exists) return
  const created = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (created.error && (created.error as { code?: string }).code !== 'email_exists') {
    log.warn('auth.bootstrap_user_failed', { code: errorCode(created.error) })
  }
}

/** Ensure an auth user exists for an invited email (created only once the invite is proven). */
export async function ensureInvitedUser(email: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  const created = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (created.error && (created.error as { code?: string }).code !== 'email_exists') {
    log.warn('auth.invite_user_failed', { code: errorCode(created.error) })
    throw new ApiError('UNAVAILABLE')
  }
}

export async function rememberNext(next: string | undefined) {
  const store = await cookies()
  store.set(NEXT_COOKIE, safeNextPath(next), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60,
  })
}

export async function consumeNext(): Promise<string> {
  const store = await cookies()
  const value = store.get(NEXT_COOKIE)?.value
  store.delete(NEXT_COOKIE)
  return safeNextPath(value)
}

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
