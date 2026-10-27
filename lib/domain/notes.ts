export const MAX_NOTE_LENGTH = 500

/**
 * Normalise free-text notes: unify newlines, strip control characters, collapse runs of spaces and
 * blank lines, trim. Returns null for an empty note. Notes are stored and rendered as plain text
 * (React escapes them); never interpreted as HTML.
 */
export function normalizeNote(input: string | null | undefined): string | null {
  if (input == null) return null
  const text = input
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text.length ? text : null
}

export const DIAPER_NOTE_TEMPLATES = ['Leak', 'Rash concern', 'Blowout'] as const
export const FEED_NOTE_TEMPLATES = ['Finished bottle', 'Spit up', 'Fell asleep'] as const
