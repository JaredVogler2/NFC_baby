# Architecture decisions (ADR log)

Decisions are made once here and referenced from code and BUILD_STATUS. Each entry lists the
decision, the reason, and what would make us revisit it. Versions were verified against the npm
registry on 2026-10-27 before use.

## ADR-001 Package manager: npm
npm 10 (bundled with Node 22) with a committed `package-lock.json`. The repository had no
lockfile or other signal. CI uses `npm ci`.

## ADR-002 Runtime and framework
- **Node.js 22 LTS** locally and in CI; Vercel Node.js runtime (not Edge) for all route handlers.
- **Next.js 16.4 App Router**, React 19.3, TypeScript 6.0 in `strict` mode (TypeScript 7 is not
  yet supported by `typescript-eslint`, which requires `<6.1`).
- Next 16 renamed `middleware.ts` to `proxy.ts`; the proxy runs on the Node runtime. We use it only
  to refresh Supabase auth cookies and to set per-request security headers, never to authorize data
  (authorization is enforced again in every route handler and by Postgres RLS).
- Cache Components and experimental flags (`useOffline`, PPR) are **not** enabled: every page that
  reads family data is dynamic and `no-store`. Fewer moving parts beats marginal speed here.
- Data mutations go through **JSON route handlers under `/api/v1/*`**, not Server Actions, so the
  API contract (idempotency keys, explicit status codes, origin checks) is explicit and testable
  with plain HTTP.

## ADR-003 Persistence and auth: Supabase (Postgres + Auth + PostgREST)
- `@supabase/ssr` 0.12 + `@supabase/supabase-js` 2.118, cookie-based sessions (`getAll`/`setAll`).
- Server code authenticates with `supabase.auth.getClaims()` / `getUser()`; never trusts
  `getSession()` alone on the server.
- **Invite-only**: public sign-up is disabled in Supabase Auth. The very first owner is allowed
  through a one-time bootstrap gated by the private `BOOTSTRAP_OWNER_EMAIL` server variable and the
  condition "no household exists yet". Everyone else joins via an owner-created, hashed,
  single-use, expiring invite.
- Passwordless email: the email contains both a sign-in link and a 6-digit code. The code path is
  essential on iPhone because a home-screen web app has separate cookie storage from Safari, so a
  link opened from Mail would sign in Safari, not the installed app.
- The email link lands on `/auth/confirm`, which shows a "Finish signing in" button that POSTs the
  one-time token. Link scanners and prefetchers therefore cannot burn the token (no GET mutation,
  consistent with the tag rule).
- All family tables have **RLS enabled**. Reads use the signed-in user's JWT through PostgREST, so
  RLS is the enforcing layer. Multi-table writes (event + feeding details + audit + notification
  outbox) go through `SECURITY DEFINER` Postgres functions with `search_path = ''` that derive the
  actor from `auth.uid()` and the household from server-side rows (never from the request), then
  check role and child/tag ownership explicitly.
- The service-role (secret) key is used **only** in server code for: bootstrap, invite user
  creation, the notification dispatcher, and Twilio webhooks. Every such path performs its own
  authorization first. The key never reaches the browser (enforced with `import 'server-only'`).

## ADR-004 Local and CI database: the real Supabase stack
Integration and E2E tests run against a real local Supabase stack (`supabase start`: Postgres 17,
GoTrue, PostgREST, Mailpit) rather than mocked SQL. Security tests use real user JWTs from real
sign-ins. In this cloud sandbox the images are pulled from `ghcr.io` via
`SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io`; CI uses the default registry. The local demo keys are
the well-known public Supabase CLI defaults and are not secrets.

## ADR-005 Validation and types
- **Zod 4** schemas in `lib/domain` are the single source for API inputs; the same schemas validate
  on the client (for UX) and on the server (for trust). Postgres CHECK constraints repeat the
  critical invariants so a bug in TypeScript cannot store an impossible row.
- Database types are hand-authored in `lib/db/types.ts` and kept in sync with migrations by an
  integration test that checks columns exist (no network codegen dependency in CI).

## ADR-006 Time
- Store instants as `timestamptz` (UTC). The family has one IANA zone (default
  `America/New_York`); all display and all "local date/time" input is interpreted in that zone,
  regardless of the phone's zone.
- Conversion uses only `Intl.DateTimeFormat` (no date library). Converting a local wall time returns
  0, 1 or 2 candidate instants; 0 = the clocks skipped that time (spring forward) and the UI asks
  for another time; 2 = the time happened twice (fall back) and the UI asks which one (EDT/EST).
- Event time defaults to the server's `now()` at the moment of Save, not when the page opened.
  Future times beyond a 5-minute clock-skew allowance are rejected; times more than 24 hours old
  require an explicit confirmation flag; times more than 1 year old are rejected.

## ADR-007 Units
Canonical bottle volume is `amount_ml numeric(9,4)`. The entered value and unit
(`amount_entered_value`, `amount_entered_unit` = `oz` | `ml`) are also stored, so a 3.5 oz entry is
displayed and edited as exactly 3.5 oz with no rounding drift. 1 US fl oz = 29.5735295625 mL.
Bounds are data-integrity limits (0 < amount ≤ 500 mL ≈ 16.9 oz), not feeding advice. "Amount not
measured" is `amount_ml IS NULL AND amount_unknown = true`; never zero.

## ADR-008 Idempotency and duplicate protection
- Every deliberate Save attempt has a client-generated UUID `clientRequestId`, persisted in
  `sessionStorage` until the server confirms, and reused on every retry of that attempt.
- `care_events` has `UNIQUE (created_by, idempotency_key)`. The create function inserts with
  `ON CONFLICT DO NOTHING`, then returns the existing row (with `replayed: true`). A replay with a
  different payload under the same key returns 409 rather than silently returning a different
  event. Concurrent identical requests serialize on the unique index, so exactly one event and one
  set of outbox rows exists.
- Outbox rows are unique on `(event_id, member_id, channel, notification_revision)`.
- A successful save rotates the client key, so a second deliberate save is a new event.

## ADR-009 Notifications
- Three modes chosen by the owner per household: `OFF` (in-app only, default), `COMPOSE`
  (after save: Share sheet / Copy / Open Messages / optional per-phone Shortcut), `AUTOMATIC`
  (server SMS via a provider adapter, individually to each verified, consenting adult).
- Provider adapter interface in `lib/notifications`; implementations: `disabled` (default),
  `mock` (tests only; refuses to load in production), `twilio` (REST over `fetch`, no SDK).
  `SMS_PROVIDER=off` is the default and nothing is ever sent unless the provider is configured
  **and** the household is in `AUTOMATIC` mode **and** the recipient has a verified number,
  recorded consent, no opt-out, the category enabled and is outside quiet hours.
- Phone numbers are encrypted in the app with AES-256-GCM (`CONTACT_ENCRYPTION_KEY`) before they
  reach the database, stored in a table that has RLS enabled with **no** policies for browser
  roles, and shown only as `•••• 1234`. A keyed HMAC of the number supports STOP-webhook lookup.
- Durable outbox: rows are created in the same transaction as the event. Dispatch runs right after
  the response via `after()` and opportunistically on later requests, with a lease
  (`FOR UPDATE SKIP LOCKED`), jittered backoff and a staleness cutoff (events older than 30 minutes
  are never texted, so turning automatic mode on can never send a backlog). A provider timeout
  after the request was sent is recorded as `UNKNOWN` and never blindly re-sent. Vercel Hobby cron
  runs at most daily, so we do not rely on cron for timely sends; an optional protected
  `/api/v1/notifications/dispatch` endpoint (Bearer `CRON_SECRET`) supports any external scheduler.
- Message body is rendered at dispatch time from the current event (so an edit before sending
  sends corrected text) and is never stored or logged.

## ADR-010 Real-time sync between parents
Bounded polling instead of Supabase Realtime: refetch on window focus / `visibilitychange` /
`pageshow` (bfcache) and every 20 s while the page is visible, with a visible "Updated hh:mm"
stamp and a manual Refresh. iOS suspends background tabs and kills websockets, so focus-refresh is
the mechanism that matters on iPhone; this is honest and needs no extra service. Revisit if parents
keep both screens open side by side for long periods.

## ADR-011 NFC tags
Tag URL = `${APP_URL}/t/<token>`, token = 128 random bits encoded as 26 lowercase Crockford
base32 characters. The token maps server-side to household, child and purpose; it is not a
credential. GET `/t/<token>` is read-only for every caller (signed out: identical generic gate for
valid and invalid tokens; foreign household: generic not-found). `last_used_at` is updated only by
a deliberate Save. QR codes are generated server-side as SVG with `qrcode` 1.5.

## ADR-012 Styling
Tailwind CSS 4 with CSS-variable design tokens (light + night themes), system font stack (no remote
fonts), hand-drawn inline SVG pictograms (no icon dependency). No component library: the handful of
primitives (Button, Field, Segmented, Chip, Sheet) are written once with accessibility in mind.

## ADR-013 Testing
- Unit/component: Vitest 5 + Testing Library + jsdom.
- Integration: Vitest against local Supabase (real Auth, PostgREST, RLS) with separate users.
- E2E: Playwright 1.63 (pinned to the browser build preinstalled in this sandbox; CI installs its
  own Chromium) with iPhone-sized viewports, two independent browser contexts for two parents, real
  sign-in through Mailpit-delivered one-time codes.
- No real SMS from any automated test: tests use the `mock` adapter; the Twilio adapter is tested
  against a local fake HTTP server.

## ADR-014 Offline
**Service worker** (`public/sw.js`, ~100 lines, production only): caches hashed build assets
(`/_next/static/*`), icons, the manifest and one offline page (`/offline`) that it fetches
**without cookies** at install time, so it can never contain family data. It never caches HTML of
authenticated pages or any `/api/*` response; navigations are network-first (with navigation
preload) and fall back to `/offline` only when the network fails. Caches are versioned per build
(`/sw.js?v=<build id>`) and old ones are deleted on activation. Because the caches hold nothing
personal they are not cleared on sign-out.

**Pending drafts** (`lib/offline/*`, IndexedDB `nfc-baby`): created only when a parent has tapped
Save, the save could not be confirmed (offline, or "can't confirm"), and they then tap **Keep as
pending on this phone**. A draft stores the exact request body with the original `clientRequestId`
and the time pinned to the Save tap, plus the user id and household id. It is shown as "Pending on
this device — NOT yet in shared history; no text sent" and never counted as an event.
Sync runs when Home opens online or the `online` event fires (the Save intent was already confirmed
twice, so this is allowed by prompt 09), and also via "Sync now". Every sync first asks
`GET /events/by-request/{id}`, then POSTs the same body with `offlineSync: true`, and deletes the
draft only after the server confirms. Before uploading, `GET /me` must return the same user and
household that created the drafts; drafts of another person on the same phone are never shown or
uploaded (they can only be removed). Limits: 20 drafts per person, 7 days (expired drafts are
removed with a visible notice). Old times still require an explicit "Yes, save with that time".

**Remembered stickers / family basics**: when a sticker form or Home is opened online, the token,
child nickname, intent, time zone and units are stored so a scan with no signal can still show the
same form (offline screen). Sign-out wipes drafts, remembered stickers and family basics.

**Not used**: Background Sync (not supported by iOS Safari), push notifications, offline reads of
the shared history (the offline screen says it needs a connection instead of showing stale data as
current).

## ADR-015 Observability and privacy
No analytics, trackers or third-party telemetry. Server logs use a small structured logger that
accepts only an allowlist of fields (route, status, duration, error code); request bodies, notes,
names and phone numbers are never logged. `robots: noindex` on every page.

## ADR-016 Single household, multi-tenant-safe schema
Every family table carries `household_id`; RLS keys on membership. The UI assumes the user has one
active membership (the earliest); multiple children are supported with a selector.
