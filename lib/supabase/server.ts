import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPublicEnv } from '@/lib/env/public'
import { ApiError } from '@/lib/http/errors'

/**
 * Per-request Supabase client bound to the signed-in user's cookies. Queries run as that user,
 * so Postgres Row Level Security is the enforcing layer for every read.
 */
export async function createSupabaseServerClient() {
  const env = getPublicEnv()
  if (!env) throw new ApiError('NOT_CONFIGURED')
  const cookieStore = await cookies()
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  })
}

export type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>
