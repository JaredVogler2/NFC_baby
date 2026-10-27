import 'server-only'
import { headers } from 'next/headers'
import { serverEnv } from './server'

/** Origin of the current request (what the browser is using right now). */
export async function requestOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto =
    h.get('x-forwarded-proto') ??
    (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}

export type TagOrigin = {
  /** Origin written onto NFC tags (APP_URL when configured). */
  origin: string
  /** Problems that make the URL unsafe to program onto a physical sticker. */
  warnings: string[]
}

/**
 * Tag URLs must be the stable production HTTPS origin. Warn loudly when APP_URL is missing, is
 * not HTTPS, or differs from the site being used (e.g. a preview deployment).
 */
export async function tagOrigin(): Promise<TagOrigin> {
  const current = await requestOrigin()
  const configured = serverEnv().APP_URL ? new URL(serverEnv().APP_URL!).origin : null
  const origin = configured ?? current
  const warnings: string[] = []
  if (!configured) {
    warnings.push(
      'APP_URL is not set, so this link uses the address you are browsing. Set APP_URL to your production address before writing stickers.',
    )
  }
  if (!origin.startsWith('https://')) {
    warnings.push(
      'This link is not HTTPS (development address). Do not write it to a physical sticker.',
    )
  }
  if (configured && configured !== current) {
    warnings.push(`You are on ${current}, but stickers will point to ${configured}.`)
  }
  return { origin, warnings }
}
