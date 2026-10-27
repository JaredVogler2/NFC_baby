/**
 * Public (browser-safe) configuration. The Supabase anon/publishable key is designed to be public;
 * Row Level Security is what protects data. These must be referenced literally so Next.js can
 * inline them at build time.
 */
export type PublicEnv = {
  supabaseUrl: string
  supabaseAnonKey: string
}

export function getPublicEnv(): PublicEnv | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null
  return { supabaseUrl, supabaseAnonKey }
}

export function isConfigured(): boolean {
  return getPublicEnv() !== null
}
