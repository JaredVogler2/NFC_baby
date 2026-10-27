/**
 * Time-zone utilities built only on Intl (no date library).
 *
 * The family has one IANA zone. Everything a person reads or types ("2:10 AM", "Tue Oct 27") is in
 * that zone, independent of the phone's own zone. Instants are always UTC `Date`s / ISO strings.
 */

export const DEFAULT_TIMEZONE = 'America/New_York'

type Parts = {
  year: number
  month: number // 1-12
  day: number
  hour: number // 0-23
  minute: number
  second: number
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatters.set(tz, f)
  }
  return f
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function zonedParts(instant: Date, tz: string): Parts {
  const out: Record<string, number> = {}
  for (const p of partsFormatter(tz).formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour === 24 ? 0 : out.hour!,
    minute: out.minute!,
    second: out.second!,
  }
}

/** Offset of `tz` from UTC at `instant`, in minutes (e.g. -240 for EDT). */
export function offsetMinutes(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const truncated = Math.floor(instant.getTime() / 1000) * 1000
  return Math.round((asUtc - truncated) / 60_000)
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** 'YYYY-MM-DD' of the instant in the family zone. */
export function localDateKey(instant: Date, tz: string): string {
  const p = zonedParts(instant, tz)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** 'HH:MM' (24h) of the instant in the family zone — the value for <input type="time">. */
export function localTimeValue(instant: Date, tz: string): string {
  const p = zonedParts(instant, tz)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^(\d{2}):(\d{2})$/

/**
 * Every UTC instant whose wall-clock time in `tz` is `date` + `time`.
 *  - []      the time does not exist (clocks sprang forward over it)
 *  - [a]     the normal case
 *  - [a, b]  the time happened twice (clocks fell back); a = first (daylight), b = second
 */
export function localToUtcCandidates(date: string, time: string, tz: string): Date[] {
  const d = DATE_RE.exec(date)
  const t = TIME_RE.exec(time)
  if (!d || !t) return []
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])]
  const [h, mi] = [Number(t[1]), Number(t[2])]
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return []
  const wallAsUtc = Date.UTC(y, mo - 1, da, h, mi)
  // Real-world offsets lie within ±14h; collect the distinct offsets around this wall time.
  const offsets = new Set<number>()
  for (const probe of [-36, -24, -12, 0, 12, 24, 36]) {
    offsets.add(offsetMinutes(new Date(wallAsUtc + probe * 3_600_000), tz))
  }
  const results: number[] = []
  for (const off of offsets) {
    const candidate = wallAsUtc - off * 60_000
    const p = zonedParts(new Date(candidate), tz)
    if (p.year === y && p.month === mo && p.day === da && p.hour === h && p.minute === mi) {
      if (!results.includes(candidate)) results.push(candidate)
    }
  }
  return results.sort((a, b) => a - b).map((ms) => new Date(ms))
}

/** UTC instant of local midnight (or the first existing minute after it) on `date` in `tz`. */
export function startOfLocalDay(date: string, tz: string): Date {
  for (let minutes = 0; minutes < 180; minutes += 15) {
    const candidates = localToUtcCandidates(
      date,
      `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`,
      tz,
    )
    if (candidates.length) return candidates[0]!
  }
  throw new Error(`no valid start of day for ${date} in ${tz}`)
}

export function addDays(date: string, days: number): string {
  const d = DATE_RE.exec(date)
  if (!d) throw new Error('bad date')
  const ms = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]) + days)
  const x = new Date(ms)
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${tz}|${JSON.stringify(opts)}`
  let f = fmtCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts })
    fmtCache.set(key, f)
  }
  return f
}

/** "2:14 AM" */
export function formatTime(instant: Date, tz: string): string {
  return fmt(tz, { hour: 'numeric', minute: '2-digit' }).format(instant)
}

/** "Tue, Oct 27" */
export function formatShortDate(instant: Date, tz: string): string {
  return fmt(tz, { weekday: 'short', month: 'short', day: 'numeric' }).format(instant)
}

/** "Tuesday, October 27" (+ year when not the current year) */
export function formatLongDate(instant: Date, tz: string, now = new Date()): string {
  const sameYear = zonedParts(instant, tz).year === zonedParts(now, tz).year
  return fmt(tz, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(instant)
}

/** "EDT" / "EST" for disambiguating repeated times. */
export function tzAbbreviation(instant: Date, tz: string): string {
  const part = fmt(tz, { timeZoneName: 'short' })
    .formatToParts(instant)
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? tz
}

/** "Today", "Yesterday" or a long date — for timeline headings. */
export function dayHeading(dateKey: string, tz: string, now = new Date()): string {
  const today = localDateKey(now, tz)
  if (dateKey === today) return 'Today'
  if (dateKey === addDays(today, -1)) return 'Yesterday'
  return formatLongDate(startOfLocalDay(dateKey, tz), tz, now)
}

/** "2:14 AM" today, "Yesterday 11:40 PM", or "Tue, Oct 27 · 2:14 AM". */
export function formatWhen(instant: Date, tz: string, now = new Date()): string {
  const key = localDateKey(instant, tz)
  const today = localDateKey(now, tz)
  if (key === today) return formatTime(instant, tz)
  if (key === addDays(today, -1)) return `Yesterday ${formatTime(instant, tz)}`
  return `${formatShortDate(instant, tz)} · ${formatTime(instant, tz)}`
}

/** Informational elapsed time: "just now", "14 min ago", "1 h 12 min ago", "2 d 3 h ago". */
export function formatElapsed(fromMs: number, nowMs: number): string {
  const minutes = Math.floor((nowMs - fromMs) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rem = minutes % 60
    return rem ? `${hours} h ${rem} min ago` : `${hours} h ago`
  }
  const days = Math.floor(hours / 24)
  const remH = hours % 24
  return remH ? `${days} d ${remH} h ago` : `${days} d ago`
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${Math.max(1, minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
