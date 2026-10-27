import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getPublicEnv } from '@/lib/env/public'

/**
 * Refreshes the Supabase session cookie on navigation requests. This only keeps cookies fresh;
 * it does not authorize anything (pages and API handlers re-check the user, and RLS enforces).
 */
export async function refreshSession(request: NextRequest, requestHeaders: Headers) {
  let response = NextResponse.next({ request: { headers: requestHeaders } })
  const env = getPublicEnv()
  if (!env) return response

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request: { headers: requestHeaders } })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
      },
    },
  })

  try {
    // getClaims() validates the JWT and refreshes it when expired, writing cookies via setAll.
    await supabase.auth.getClaims()
  } catch {
    // Auth outage must not take the site down; pages will treat the user as signed out.
  }
  return response
}
