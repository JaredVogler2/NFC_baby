/**
 * Event vocabulary shared by UI, API validation and SQL (the database repeats these as CHECK
 * constraints and enums).
 */

export const INTENTS = ['WET', 'POOP', 'BOTH', 'FEED'] as const
export type Intent = (typeof INTENTS)[number]

export const DIAPER_SUBTYPES = ['WET', 'POOP', 'BOTH'] as const
export type DiaperSubtype = (typeof DIAPER_SUBTYPES)[number]

export const FEED_METHODS = ['BOTTLE', 'NURSING'] as const
export type FeedMethod = (typeof FEED_METHODS)[number]

export type EventType = 'DIAPER' | 'FEED'
export type Subtype = DiaperSubtype | FeedMethod

export const MILK_TYPES = ['BREASTMILK', 'FORMULA', 'OTHER', 'UNKNOWN'] as const
export type MilkType = (typeof MILK_TYPES)[number]

export const NURSING_SIDES = ['LEFT', 'RIGHT', 'BOTH', 'UNKNOWN'] as const
export type NursingSide = (typeof NURSING_SIDES)[number]

export const SOURCE_TYPES = ['TAG', 'DASHBOARD', 'SHORTCUT', 'OFFLINE_SYNC'] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

export const EVENT_STATES = ['ACTIVE', 'VOID'] as const
export type EventState = (typeof EVENT_STATES)[number]

export const ROLES = ['owner', 'parent', 'caregiver', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export function isIntent(value: unknown): value is Intent {
  return typeof value === 'string' && (INTENTS as readonly string[]).includes(value)
}

export function intentFromSlug(slug: string): Intent | null {
  const upper = slug.toUpperCase()
  return isIntent(upper) ? upper : null
}

export function intentSlug(intent: Intent): string {
  return intent.toLowerCase()
}

export function eventTypeForIntent(intent: Intent): EventType {
  return intent === 'FEED' ? 'FEED' : 'DIAPER'
}

export function intentForSubtype(subtype: Subtype): Intent {
  return subtype === 'BOTTLE' || subtype === 'NURSING' ? 'FEED' : subtype
}

/** A tag's purpose fixes the intent; FEED tags allow either feeding method. */
export function subtypeAllowedForIntent(subtype: Subtype, intent: Intent): boolean {
  return intentForSubtype(subtype) === intent
}

export const INTENT_LABEL: Record<Intent, string> = {
  WET: 'Wet diaper',
  POOP: 'Poop diaper',
  BOTH: 'Wet + poop',
  FEED: 'Feeding',
}

export const INTENT_LOG_TITLE: Record<Intent, string> = {
  WET: 'Log wet diaper',
  POOP: 'Log poop diaper',
  BOTH: 'Log wet + poop diaper',
  FEED: 'Log feeding',
}

export const SUBTYPE_LABEL: Record<Subtype, string> = {
  WET: 'Wet diaper',
  POOP: 'Poop diaper',
  BOTH: 'Wet + poop',
  BOTTLE: 'Bottle',
  NURSING: 'Nursing',
}

export const MILK_LABEL: Record<MilkType, string> = {
  BREASTMILK: 'Breastmilk',
  FORMULA: 'Formula',
  OTHER: 'Other',
  UNKNOWN: 'Unknown milk',
}

export const SIDE_LABEL: Record<NursingSide, string> = {
  LEFT: 'Left',
  RIGHT: 'Right',
  BOTH: 'Both sides',
  UNKNOWN: 'Side not tracked',
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  parent: 'Parent',
  caregiver: 'Caregiver',
  viewer: 'Viewer',
}

/** Permission matrix (mirrors SQL helpers; SQL is authoritative). */
export const can = {
  log: (role: Role) => role !== 'viewer',
  editAny: (role: Role) => role === 'owner' || role === 'parent',
  editOwn: (role: Role) => role !== 'viewer',
  manageTags: (role: Role) => role === 'owner' || role === 'parent',
  manageMembers: (role: Role) => role === 'owner',
  manageHousehold: (role: Role) => role === 'owner',
  readAudit: (role: Role) => role === 'owner' || role === 'parent',
  export: (role: Role) => role === 'owner' || role === 'parent',
  receiveTexts: (role: Role) => role === 'owner' || role === 'parent',
}
