import { FRIENDLY_MESSAGE, isApiErrorCode, type ApiErrorCode, type FieldIssues } from './errors'

/**
 * Browser-side API client. Every failure is classified so the UI can tell
 * "definitely not saved" (the server answered with an error) apart from "uncertain"
 * (network error or timeout after the request may have reached the server).
 */

export type ApiFailureKind =
  | 'http' // server answered with an error body
  | 'network' // request may or may not have reached the server
  | 'timeout' // same uncertainty as network
  | 'offline' // browser reported offline before sending; definitely not sent

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | {
      ok: false
      kind: ApiFailureKind
      status: number
      code: ApiErrorCode | 'NETWORK' | 'TIMEOUT' | 'OFFLINE'
      message: string
      fields?: FieldIssues
      details?: Record<string, unknown>
    }

export type ApiRequestInit = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<ApiResult<T>> {
  const method = init.method ?? 'GET'
  if (typeof navigator !== 'undefined' && navigator.onLine === false && method !== 'GET') {
    return {
      ok: false,
      kind: 'offline',
      status: 0,
      code: 'OFFLINE',
      message: "You're offline. Nothing was sent.",
    }
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('timeout'), init.timeoutMs ?? 15_000)
  init.signal?.addEventListener('abort', () => controller.abort(init.signal?.reason))
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    })
  } catch {
    const timedOut = controller.signal.aborted && controller.signal.reason === 'timeout'
    return {
      ok: false,
      kind: timedOut ? 'timeout' : 'network',
      status: 0,
      code: timedOut ? 'TIMEOUT' : 'NETWORK',
      message: timedOut ? 'The connection is slow.' : 'Connection problem.',
    }
  } finally {
    clearTimeout(timeout)
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (response.ok) return { ok: true, status: response.status, data: payload as T }

  const err = (payload as { error?: Record<string, unknown> } | null)?.error
  const code: ApiErrorCode = isApiErrorCode(err?.code)
    ? err.code
    : response.status === 401
      ? 'UNAUTHENTICATED'
      : response.status >= 500
        ? 'UNAVAILABLE'
        : 'INTERNAL'
  return {
    ok: false,
    kind: 'http',
    status: response.status,
    code,
    message: typeof err?.message === 'string' ? err.message : FRIENDLY_MESSAGE[code],
    fields: (err?.fields as FieldIssues | undefined) ?? undefined,
    details: (err?.details as Record<string, unknown> | undefined) ?? undefined,
  }
}

/** A 5xx from a proxy/CDN or a network failure leaves the outcome of a write uncertain. */
export function isUncertainWriteFailure(result: ApiResult<unknown>): boolean {
  if (result.ok) return false
  if (result.kind === 'network' || result.kind === 'timeout') return true
  return result.kind === 'http' && (result.status === 502 || result.status === 504)
}
