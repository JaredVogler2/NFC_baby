# NFC Baby HTTP API (v1)

All endpoints live under `/api/v1`, return JSON, and send `Cache-Control: private, no-store`.
Schemas are the Zod definitions in `lib/domain/schemas.ts` (single source of truth); Postgres
functions re-validate everything (see `supabase/migrations`).

## Conventions
- **Auth**: Supabase session cookie (HttpOnly, SameSite=Lax). No bearer tokens in URLs.
- **Mutations** are `POST`/`PATCH` only and require `Content-Type: application/json`, a same-site
  `Origin` header (CSRF guard) and a body ≤ 16 KB. `GET` never changes data.
- **Errors**: `{ "error": { "code", "message", "fields"?, "details"? } }`

| code | HTTP | meaning |
|---|---|---|
| `VALIDATION` | 422 | input invalid; `fields` maps field → message. `details.confirmOld = true` means "time is > 24 h ago, resend with `confirmOld: true`" |
| `UNAUTHENTICATED` | 401 | sign in again (client keeps the form) |
| `FORBIDDEN` | 403 | not a member / role not allowed |
| `NOT_FOUND` | 404 | unknown **or not yours** (indistinguishable on purpose) |
| `GONE` | 410 | the NFC tag was revoked |
| `CONFLICT` | 409 | `details.reason`: `REVISION_CONFLICT` (with `currentRevision`) or `EVENT_VOID` |
| `IDEMPOTENCY_MISMATCH` | 409 | same `clientRequestId` reused with a different payload |
| `RATE_LIMITED` | 429 | too many requests (also > 60 events / 10 min per person) |
| `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` / `BAD_ORIGIN` | 413 / 415 / 403 | transport guards |
| `UNAVAILABLE` / `NOT_CONFIGURED` / `INTERNAL` | 503 / 503 / 500 | no internal detail is ever returned |

## Auth
| Endpoint | Body | Result |
|---|---|---|
| `POST /auth/otp` | `{ email, next? }` | `200 {ok:true}` for **any** email (no enumeration). Sends a code + link only to existing users. Remembers `next` in an HttpOnly cookie for the link flow. |
| `POST /auth/verify` | `{ email, code, next? }` | `200 { next }` and session cookie. `next` is allowlisted (`lib/auth/redirect.ts`); non-members get `/setup`. |
| `POST /auth/confirm` | `{ tokenHash, type: "email" }` | `200 { next }` — finishes an email-link sign-in from the `/auth/confirm` button. |
| `POST /auth/signout` | — | `200` |
| `POST /setup` | `{ householdName, timezone, childNickname, displayName }` | `201 { next }` — only for `BOOTSTRAP_OWNER_EMAIL` while no household exists. |
| `GET /me` | — | member context: membership, household, children, members |

## Invites
| Endpoint | Role | Body | Result |
|---|---|---|---|
| `POST /invites` | owner | `{ email, role, displayName? }` | `201 { id, url, expiresInHours }` — single-use link, 72 h; only the SHA-256 of the token is stored |
| `POST /invites/start` | public | `{ token, email }` | `200` — email must match the invite; creates the account if needed and emails a code |
| `POST /invites/accept` | signed in | `{ token, displayName }` | `200 { next }` — signed-in email must match |
| `POST /invites/:id/revoke` | owner | — | `200` |

## Care events
### `POST /events` — deliberate save (idempotent)
```json
{
  "clientRequestId": "uuid — one per save attempt, reused for retries",
  "intent": "WET | POOP | BOTH | FEED",
  "tagToken": "26-char token (when saved from a sticker) — fixes household, child and intent",
  "childId": "uuid (required without tagToken)",
  "occurredAt": "ISO-8601 instant, omitted = server now",
  "confirmOld": false,
  "notes": "≤ 500 chars, optional",
  "feeding": { "method": "BOTTLE", "milkType": "BREASTMILK|FORMULA|OTHER|UNKNOWN",
               "amountValue": 3.5, "amountUnit": "oz|ml", "amountUnknown": false }
             | { "method": "NURSING", "side": "LEFT|RIGHT|BOTH|UNKNOWN",
                 "durationSeconds": 720, "endedAt": "ISO instant" },
  "offlineSync": false
}
```
`201` = created now, `200` = this attempt was already saved (replay; same event returned).
Response: `{ event: CareEvent, replayed, notification: { mode, draftText, recipients[], previouslyNotified } }`.
A tag's purpose cannot be overridden: posting `FEED` through a WET tag → `422` (`fields.intent`).

### Other event endpoints
| Endpoint | Notes |
|---|---|
| `GET /events?childId&type=all\|diapers\|feeding&from=YYYY-MM-DD&to=YYYY-MM-DD&includeVoided=0\|1&cursor&limit` | newest **occurrence** first; dates are family-local days; `nextCursor` for paging |
| `GET /events/by-request/:clientRequestId` | did my uncertain save commit? `200 {event}` or `404` (safe to retry with the same key) |
| `GET /events/:id` | `{ event, audit (owner/parent only, else null), notification }` |
| `PATCH /events/:id` | `{ expectedRevision, confirmOld?, patch: { occurredAt?, notes?, subtype?, childId?, feeding? } }` → `{ event, changed, previouslyNotified, notification }`; stale revision → `409 REVISION_CONFLICT` |
| `POST /events/:id/void` | `{ expectedRevision, reason? }` → `{ event, alreadyVoid, canceledNotifications, previouslyNotified }` |
| `GET /dashboard?childId` | `{ child, dashboard: { lastFeed, lastDiaper, recent[5], today{…} } }` |

`CareEvent` (camelCase) is defined in `lib/domain/event.ts`: ids, `subtype`, `intent`,
`occurredAt`, `createdAt`, author names, `source`, `sourceTagLabel`, `notes`, `state`
(`ACTIVE|VOID`), void attribution, `revision`, `feeding` (canonical `amountMl` + entered
value/unit, `amountUnknown`, side, duration, end).

## NFC tags, notifications, export
Documented with their phases: tags (phase 04) in `docs/NFC_STICKER_SETUP.md`, notifications
(phase 08) in `docs/SMS_OPTIONS.md`, export (phase 07) in `docs/DATA_MANAGEMENT.md`.
