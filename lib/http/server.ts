import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { errorCode, log } from '@/lib/log'
import { ApiError, type FieldIssues } from './errors'

export const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
} as const

export const MAX_JSON_BYTES = 16 * 1024

export function jsonOk<T>(data: T, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } })
}

export function jsonError(err: ApiError) {
  return NextResponse.json(err.toBody(), { status: err.status, headers: NO_STORE_HEADERS })
}

/**
 * Cross-site request forgery guard for cookie-authenticated mutations. Browsers always send
 * `Origin` on POST/PATCH fetches; requests whose Origin is not this site (or the configured
 * APP_URL) are rejected. Combined with SameSite=Lax cookies and JSON-only bodies.
 */
export function assertSameOrigin(request: Request, allowedOrigins: string[] = []) {
  const origin = request.headers.get('origin')
  const self = new URL(request.url).origin
  const allowed = new Set([self, ...allowedOrigins])
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  if (forwardedHost) allowed.add(`${forwardedProto}://${forwardedHost}`)
  if (origin) {
    if (!allowed.has(origin)) throw new ApiError('BAD_ORIGIN')
    return
  }
  const site = request.headers.get('sec-fetch-site')
  if (site === 'same-origin') return
  throw new ApiError('BAD_ORIGIN')
}

export function zodFieldIssues(error: z.ZodError): FieldIssues {
  const fields: FieldIssues = {}
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_'
    if (!fields[key]) fields[key] = issue.message
  }
  return fields
}

export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes = MAX_JSON_BYTES,
): Promise<z.infer<S>> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE')
  }
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > maxBytes) throw new ApiError('PAYLOAD_TOO_LARGE')
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new ApiError('PAYLOAD_TOO_LARGE')
  let raw: unknown
  try {
    raw = text.length ? JSON.parse(text) : {}
  } catch {
    throw new ApiError('VALIDATION', 'The request was not valid JSON.')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError('VALIDATION', undefined, { fields: zodFieldIssues(parsed.error) })
  }
  return parsed.data
}

export function parseQuery<S extends z.ZodType>(url: URL, schema: S): z.infer<S> {
  const raw: Record<string, string | string[]> = {}
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key)
    raw[key] = all.length > 1 ? all : (all[0] ?? '')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError('VALIDATION', undefined, { fields: zodFieldIssues(parsed.error) })
  }
  return parsed.data
}

type Handler<Ctx> = (request: Request, ctx: Ctx) => Promise<Response>

/**
 * Wraps a route handler: translates ApiError/ZodError into the JSON error contract, never leaks
 * internal messages, and logs only route/method/status/duration.
 */
export function apiRoute<Ctx = unknown>(routeName: string, handler: Handler<Ctx>): Handler<Ctx> {
  return async (request, ctx) => {
    const started = Date.now()
    let response: Response
    try {
      response = await handler(request, ctx)
    } catch (err) {
      if (err instanceof ApiError) {
        response = jsonError(err)
      } else if (err instanceof z.ZodError) {
        response = jsonError(new ApiError('VALIDATION', undefined, { fields: zodFieldIssues(err) }))
      } else {
        log.error('api.unhandled', {
          route: routeName,
          method: request.method,
          code: errorCode(err),
        })
        response = jsonError(new ApiError('INTERNAL'))
      }
    }
    log.info('api', {
      route: routeName,
      method: request.method,
      status: response.status,
      ms: Date.now() - started,
    })
    return response
  }
}
