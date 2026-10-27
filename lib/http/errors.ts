/**
 * Shared API error vocabulary (server and browser). Messages are written for a tired parent and
 * never include internal details.
 */

export const API_ERROR_CODES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'GONE',
  'CONFLICT',
  'IDEMPOTENCY_MISMATCH',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'BAD_ORIGIN',
  'UNAVAILABLE',
  'NOT_CONFIGURED',
  'INTERNAL',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export const STATUS_FOR_CODE: Record<ApiErrorCode, number> = {
  VALIDATION: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  GONE: 410,
  CONFLICT: 409,
  IDEMPOTENCY_MISMATCH: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  BAD_ORIGIN: 403,
  UNAVAILABLE: 503,
  NOT_CONFIGURED: 503,
  INTERNAL: 500,
}

export const FRIENDLY_MESSAGE: Record<ApiErrorCode, string> = {
  VALIDATION: 'Please check the highlighted fields.',
  UNAUTHENTICATED: 'Your sign-in expired. Sign in again — your entry is kept.',
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "That isn't available.",
  GONE: 'This sticker has been retired. Use another sticker or log from Home.',
  CONFLICT: 'Someone else changed this entry. Reload to see the latest version.',
  IDEMPOTENCY_MISMATCH: 'This save conflicts with an earlier attempt. Start a new entry.',
  RATE_LIMITED: 'Too many requests. Wait a moment and try again.',
  PAYLOAD_TOO_LARGE: 'That is too much text to save.',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported request.',
  BAD_ORIGIN: 'Request blocked for your security. Reload the page and try again.',
  UNAVAILABLE: 'The service is temporarily unavailable. Try again shortly.',
  NOT_CONFIGURED: 'This feature is not set up yet.',
  INTERNAL: 'Something went wrong on our side. Nothing was changed unless you see "Saved".',
}

export type FieldIssues = Record<string, string>

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode
    message: string
    fields?: FieldIssues
    /** Extra safe data, e.g. the current revision on a conflict. */
    details?: Record<string, unknown>
  }
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly fields?: FieldIssues
  readonly details?: Record<string, unknown>

  constructor(
    code: ApiErrorCode,
    message?: string,
    opts: { fields?: FieldIssues; details?: Record<string, unknown> } = {},
  ) {
    super(message ?? FRIENDLY_MESSAGE[code])
    this.name = 'ApiError'
    this.code = code
    this.status = STATUS_FOR_CODE[code]
    this.fields = opts.fields
    this.details = opts.details
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
        ...(this.details ? { details: this.details } : {}),
      },
    }
  }
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value)
}
