import type { CareEvent } from '@/lib/domain/event'

/** Encode/decode the history keyset cursor (occurred_at, created_at, id) as base64url. */
export function encodeCursor(e: Pick<CareEvent, 'occurredAt' | 'createdAt' | 'id'>): string {
  return Buffer.from(JSON.stringify([e.occurredAt, e.createdAt, e.id])).toString('base64url')
}

export function decodeCursor(
  cursor: string,
): { occurredAt: string; createdAt: string; id: string } | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (!Array.isArray(parsed) || parsed.length !== 3) return null
    const [occurredAt, createdAt, id] = parsed as unknown[]
    if (
      typeof occurredAt === 'string' &&
      typeof createdAt === 'string' &&
      typeof id === 'string' &&
      !Number.isNaN(Date.parse(occurredAt)) &&
      !Number.isNaN(Date.parse(createdAt)) &&
      /^[0-9a-f-]{36}$/.test(id)
    ) {
      return { occurredAt, createdAt, id }
    }
  } catch {
    // malformed cursor → treat as first page
  }
  return null
}
