import 'server-only'
import { errorCode, log } from '@/lib/log'
import { ApiError } from '@/lib/http/errors'

type PgError = { code?: string; message?: string; details?: string | null; hint?: string | null }

/**
 * Translate a PostgREST/Postgres error from our SQL functions (custom NBxxx SQLSTATEs, see
 * migrations) into the public API error contract. Unknown errors become INTERNAL and are logged by
 * code only.
 */
export function toApiError(err: PgError, context: string): ApiError {
  const code = err.code ?? ''
  const message = err.message ?? ''
  switch (code) {
    case 'NB401':
    case 'PGRST301':
    case 'PGRST303':
      return new ApiError('UNAUTHENTICATED')
    case 'NB403':
    case '42501':
      return new ApiError('FORBIDDEN')
    case 'NB404':
      return new ApiError('NOT_FOUND')
    case 'NB410':
      return new ApiError('GONE')
    case 'NB409':
      if (message === 'IDEMPOTENCY_MISMATCH') return new ApiError('IDEMPOTENCY_MISMATCH')
      if (message === 'REVISION_CONFLICT') {
        return new ApiError('CONFLICT', undefined, {
          details: { reason: 'REVISION_CONFLICT', currentRevision: Number(err.details) || null },
        })
      }
      if (message === 'EVENT_VOID') {
        return new ApiError('CONFLICT', 'This entry was undone and cannot be edited.', {
          details: { reason: 'EVENT_VOID' },
        })
      }
      return new ApiError('CONFLICT', err.details || undefined, { details: { reason: message } })
    case 'NB422': {
      const field = err.hint || '_'
      const human = err.details || 'Please check this value.'
      if (message === 'CONFIRM_OLD') {
        return new ApiError('VALIDATION', human, {
          fields: { [field]: human },
          details: { confirmOld: true },
        })
      }
      return new ApiError('VALIDATION', human, { fields: { [field]: human } })
    }
    case 'NB429':
      return new ApiError('RATE_LIMITED')
    default:
      log.error('db.error', { event: context, code: errorCode(err) })
      return new ApiError('INTERNAL')
  }
}
