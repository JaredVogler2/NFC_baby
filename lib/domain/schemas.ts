import { z } from 'zod'
import { DIAPER_SUBTYPES, FEED_METHODS, INTENTS, MILK_TYPES, NURSING_SIDES, ROLES } from './intents'
import { MAX_NOTE_LENGTH, normalizeNote } from './notes'
import { MAX_BOTTLE_ML, toMl } from './units'
import { TOKEN_PATTERN } from '@/lib/nfc/token'
import { isValidTimeZone } from '@/lib/time/zoned'

// No eval: Zod's JIT probe (`Function("")`) would trip the strict Content-Security-Policy in the
// browser. Validation of these small payloads is fast without it.
z.config({ jitless: true })

/**
 * API input schemas — the single source of truth for request validation. The browser uses them
 * for friendly inline errors; the server re-validates (and Postgres re-checks the invariants).
 */

const intent = z.enum(INTENTS)
const isoInstant = z.iso.datetime({ offset: true, message: 'Invalid time.' })

export const noteSchema = z
  .string()
  .max(MAX_NOTE_LENGTH * 2, `Notes can be at most ${MAX_NOTE_LENGTH} characters.`)
  .nullable()
  .optional()
  .transform((value) => normalizeNote(value))
  .refine((value) => value === null || value.length <= MAX_NOTE_LENGTH, {
    message: `Notes can be at most ${MAX_NOTE_LENGTH} characters.`,
  })

export const bottleSchema = z
  .object({
    method: z.literal('BOTTLE'),
    milkType: z.enum(MILK_TYPES, { message: 'Choose breastmilk, formula or unknown.' }),
    amountUnknown: z.boolean().default(false),
    amountValue: z
      .number({ message: 'Enter an amount like 3.5 (numbers only).' })
      .finite('Enter an amount like 3.5 (numbers only).')
      .positive('Amount must be more than zero.')
      .nullable()
      .optional(),
    amountUnit: z.enum(['oz', 'ml']).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.amountUnknown) {
      if (v.amountValue != null) {
        ctx.addIssue({
          code: 'custom',
          path: ['amountValue'],
          message: 'Clear the amount or untick "Amount not measured".',
        })
      }
      return
    }
    if (v.amountValue == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountValue'],
        message: 'Choose an amount or tick "Amount not measured".',
      })
      return
    }
    if (!v.amountUnit) {
      ctx.addIssue({ code: 'custom', path: ['amountUnit'], message: 'Choose oz or mL.' })
      return
    }
    if (toMl(v.amountValue, v.amountUnit) > MAX_BOTTLE_ML) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountValue'],
        message:
          'That amount is larger than this app can record (max 500 mL / 16.9 oz). Check the number.',
      })
    }
  })

export const nursingSchema = z
  .object({
    method: z.literal('NURSING'),
    side: z.enum(NURSING_SIDES).default('UNKNOWN'),
    durationSeconds: z
      .number()
      .int()
      .min(60, 'Duration must be at least 1 minute.')
      .max(4 * 3600, 'Duration must be at most 4 hours.')
      .nullable()
      .optional(),
    endedAt: isoInstant.nullable().optional(),
  })
  .refine((v) => !(v.durationSeconds != null && v.endedAt != null), {
    message: 'Enter a duration or an end time, not both.',
    path: ['durationSeconds'],
  })

export const feedingSchema = z.discriminatedUnion('method', [bottleSchema, nursingSchema])
export type FeedingInput = z.input<typeof feedingSchema>

export const createEventSchema = z
  .object({
    clientRequestId: z.uuid({ message: 'Missing request id.' }),
    intent,
    tagToken: z.string().regex(TOKEN_PATTERN).nullable().optional(),
    childId: z.uuid().nullable().optional(),
    occurredAt: isoInstant.nullable().optional(),
    confirmOld: z.boolean().optional(),
    notes: noteSchema,
    feeding: feedingSchema.nullable().optional(),
    offlineSync: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.tagToken && !v.childId) {
      ctx.addIssue({ code: 'custom', path: ['childId'], message: 'Choose a child.' })
    }
    if (v.intent === 'FEED' && !v.feeding) {
      ctx.addIssue({ code: 'custom', path: ['feeding'], message: 'Choose bottle or nursing.' })
    }
    if (v.intent !== 'FEED' && v.feeding) {
      ctx.addIssue({
        code: 'custom',
        path: ['feeding'],
        message: 'Diaper entries have no feeding details.',
      })
    }
  })
export type CreateEventInput = z.input<typeof createEventSchema>

export const updateEventSchema = z.object({
  expectedRevision: z.number().int().min(1),
  confirmOld: z.boolean().optional(),
  patch: z
    .object({
      occurredAt: isoInstant.optional(),
      notes: z
        .string()
        .max(MAX_NOTE_LENGTH * 2)
        .nullable()
        .optional()
        .transform((v) => (v === undefined ? undefined : normalizeNote(v)))
        .refine((v) => v == null || v.length <= MAX_NOTE_LENGTH, {
          message: `Notes can be at most ${MAX_NOTE_LENGTH} characters.`,
        }),
      subtype: z.enum([...DIAPER_SUBTYPES, ...FEED_METHODS]).optional(),
      childId: z.uuid().optional(),
      feeding: feedingSchema.optional(),
    })
    .refine((p) => Object.values(p).some((v) => v !== undefined), {
      message: 'Nothing to change.',
    }),
})
export type UpdateEventInput = z.input<typeof updateEventSchema>

export const voidEventSchema = z.object({
  expectedRevision: z.number().int().min(1),
  reason: z.string().trim().max(200).nullable().optional(),
})

const yyyyMmDd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')

export const listEventsQuerySchema = z.object({
  childId: z.uuid().optional(),
  type: z.enum(['all', 'diapers', 'feeding']).default('all'),
  from: yyyyMmDd.optional(),
  to: yyyyMmDd.optional(),
  includeVoided: z.enum(['0', '1']).default('0'),
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]{10,200}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address.' }).max(254))

export const otpRequestSchema = z.object({
  email: emailSchema,
  next: z.string().max(512).optional(),
})

export const otpVerifySchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6,10}$/, 'Enter the code from the email.'),
  next: z.string().max(512).optional(),
})

export const confirmSchema = z.object({
  tokenHash: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/),
  type: z.literal('email').default('email'),
})

const displayName = z.string().trim().min(1, 'Required.').max(40, 'Use at most 40 characters.')
const timezone = z
  .string()
  .max(64)
  .refine((tz) => isValidTimeZone(tz), 'Unknown time zone.')

export const setupSchema = z.object({
  householdName: z.string().trim().min(1, 'Required.').max(60),
  timezone,
  childNickname: z.string().trim().min(1, 'Required.').max(40),
  displayName,
})

export const householdSchema = z.object({
  displayName: z.string().trim().min(1, 'Required.').max(60),
  timezone,
  defaultFeedMethod: z.enum(FEED_METHODS).nullable(),
  defaultVolumeUnit: z.enum(['oz', 'ml']),
})

export const childSchema = z.object({
  nickname: z.string().trim().min(1, 'Required.').max(40),
  archived: z.boolean().default(false),
})

export const profileSchema = z.object({ displayName })

export const inviteCreateSchema = z.object({
  email: emailSchema,
  role: z.enum(ROLES),
  displayName: z.string().trim().max(40).optional(),
})

export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

export const inviteStartSchema = z.object({ token: inviteTokenSchema, email: emailSchema })
export const inviteAcceptSchema = z.object({ token: inviteTokenSchema, displayName })

export const memberUpdateSchema = z.object({
  role: z.enum(ROLES).optional(),
  disabled: z.boolean().optional(),
})

export const tagCreateSchema = z.object({
  childId: z.uuid(),
  purpose: intent,
  label: z.string().trim().min(1, 'Required.').max(60),
})

export const tagUpdateSchema = tagCreateSchema

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.')

export const notificationPrefsSchema = z.object({
  autoSmsEnabled: z.boolean(),
  categories: z.array(intent).max(4),
  includeOwnEntries: z.boolean(),
  quietHoursEnabled: z.boolean(),
  quietStart: hhmm,
  quietEnd: hhmm,
})

export const notificationModeSchema = z.object({ mode: z.enum(['OFF', 'COMPOSE', 'AUTOMATIC']) })
