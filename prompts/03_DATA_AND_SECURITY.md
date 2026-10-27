# 03 — Database schema, Supabase authentication, isolation and API contracts

## Goal
A real persistent multi-device tracker with correct auditability and strong family privacy before NFC flows can write data.

## Schema (create explicit versioned SQL migrations)
- households: id UUID, display_name, timezone IANA, created_at.
- profiles: auth_user_id UUID primary key, display_name, created_at; no publicly readable user directory.
- household_members: household_id, auth_user_id, role (owner/parent/caregiver/viewer), joined_at, disabled_at, unique membership. Caregiver read/write scoping explicit; owner-only sensitive settings.
- children: id UUID, household_id, first_name_or_nickname, archived_at, created_at, optional date_of_birth privately stored if essential (default not required).
- nfc_tags: id opaque random 128-bit+ printable/base32 or UUIDv4, household_id, child_id, purpose (WET, POOP, BOTH, FEED, optional HUB), label, active, created_by, created_at, revoked_at, last_used_at optional. No bearer privileges.
- care_events: id UUID, household_id, child_id, event_type DIAPER or FEED, subtype WET/POOP/BOTH or BOTTLE/NURSING, occurred_at timestamptz NOT NULL, created_at server timestamptz, updated_at, created_by UUID, source_type (TAG, DASHBOARD, SHORTCUT), source_tag_id nullable, notes nullable bounded, state ACTIVE/VOID, voided_by/at/reason, revision integer, idempotency_key random bounded text unique scoped to identity and household.
- feeding_details: event_id FK unique, feed_method BOTTLE/NURSING, milk_type BREASTMILK/FORMULA/OTHER/UNKNOWN nullable for bottle, amount_ml decimal nullable, amount_unknown boolean, duration_seconds nullable, side LEFT/RIGHT/BOTH/UNKNOWN nullable nursing; end_at optional where meaningful; CHECKs enforce valid combinations and nonnegative sane limits.
- event_revisions or event_audit: append-only before/after serialized safe diff, event id, actor, server timestamp, action, no uncontrolled plaintext logging, RLS owner/parents read.
- notification_preferences: household, member, event types, mode OFF/DRAFT/MANAGED_SMS, quiet hours and timezone, enabled, consent_at and verification metadata, opt-out; do not expose destinations except own masked value where appropriate.
- notification_outbox: event_id, target member_id, channel, state (PENDING, PROCESSING, SENT_TO_PROVIDER, FAILED, CANCELED, UNKNOWN), retry_attempts, next_attempt_at, external_message_id, unique(event_id,target_member_id,channel,notification_revision), timestamps.
- tag_uses minimal diagnostic counters if privacy-preserving, not a detailed location history.
- optional invite table with hashed expiring single-use token, role, household association.

## Invariants and validations
- Reject impossible type/subtype combinations; wet+poop is one BOTH event, not two separate records.
- Do not silently invent bottle volume, child, notes, or time.
- Serialize amount_ml as canonical decimal precision, convert from oz at boundary with documented 1 U.S. fl oz = 29.5735295625 mL; display unit preference. For bottle volumes prevent negative/NaN and require explicit unknown state if not recorded. Set a sane validation limit with clear human-readable error rather than advice about appropriate feeding amounts.
- New record time defaults server-side now when omitted; explicit timestamp preserved after validation. Provide thoughtful guard on excessively future or old event without blocking valid backdating.
- Notes optional, plaintext at rest in secured DB, length <=500 chars, HTML escaped in UI, no note in URL or default SMS without user opt-in.
- Explicit UNIQUE idempotency key guarantee; atomic insert/outbox enqueue; edit revision optimistic concurrency to prevent overwriting another parent's changes.
- Do not physically delete events for an undo, mark void and retain audit; optional household data export/delete workflow for admin with explicit confirmation.
- Event changes should be queryable without exposing private household ids cross-tenant.
- Consent logs separate from care records.

## Auth + row-level security (RLS)
- Supabase Auth with invite-only adults; safe recovery/login; session cookies compatible with SSR.
- Build Postgres RLS policies on every family table. Check membership in household and appropriate role; child belongs to same household as record/tag; do not accept forged household_id from request.
- Write users can insert events with created_by=auth.uid() and only to their household; user cannot impersonate different writer or change historical author.
- Allow parent/owner to correct events, caregiver only if explicitly permitted. Viewer read only. Tag mutations owner/parent only.
- Private phone destinations/consent stored server-only, ideally encrypted at rest with restricted access; if service role required, never expose to browser, never use broad superuser route without own authorization.
- Protect functions behind server-side session authorization, CSRF/origin protection where applicable, rate limiting, body size caps, restricted error details. No public event GET or public notes.
- Never trust tag ID to authorize data mutations; tag merely chooses intent after auth.
- Security test an authenticated person outside the household querying, updating, or creating events with forged IDs.

## API contract tests
Define OpenAPI-like docs and Zod schemas for:
- POST /api/v1/events: childId, eventType, subtype, occurredAt, notes, tagId optional, feeding details optional, clientRequestId; server derives household + actor and validates tag intent.
- GET /api/v1/events?cursor=...&childId=...&types=... pagination newest-first.
- PATCH /api/v1/events/:id with expected revision and immutable audit record.
- POST /api/v1/events/:id/void with expected revision and reason optional.
- GET /api/v1/tags/:id resolves authenticated scoped tag; admin POST/PATCH/REVOKE endpoints.
- GET current family membership/children and parent notification preferences.
- Never place sensitive event details, phone numbers, or credentials in tag URL query params.

## Deliverables / exit
- Migrations, generated or authored TypeScript types, safe sample fixture without any real child data, auth flows, route handlers, secure DB access, audit and idempotency tests.
- Integration tests running against real test Postgres/Supabase (do not claim security is tested only with mocked SQL). Supply local test instructions and CI setup.
- RLS negative tests for cross-household access and privileges.
- Clearly documented DB backup/export and retention choices, migration rollback/recovery strategy.
- Run tests/build, update BUILD_STATUS, commit. Proceed to phase 04.