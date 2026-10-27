import { DEFAULT_TIMEZONE } from './zoned'

/** IANA zones for pickers, with the default first. */
export function timezoneOptions(): string[] {
  let zones: string[] = []
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    zones = []
  }
  const preferred = [
    DEFAULT_TIMEZONE,
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
  ]
  return [
    ...preferred,
    ...zones.filter((z) => !preferred.includes(z)),
    ...(zones.includes('UTC') ? [] : ['UTC']),
  ]
}
