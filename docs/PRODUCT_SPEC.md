# NFC Baby — product specification, UX and component map

Status: Phase 01 deliverable. This is the implementable source of truth for scope, screens and
acceptance tests. Architecture choices live in `docs/ARCHITECTURE_DECISIONS.md`.

## 1. Mission and scope
A calm, fast, private log for two tired parents. A physical NFC sticker opens the one screen for
one job (wet / poop / both / feed); a single deliberate **Save** records it; both parents see it on
their own phones; texting each other is optional and always labelled honestly.

### In scope (v1)
- Four tag intents WET, POOP, BOTH, FEED; any number of physical tags per intent.
- Invite-only accounts (owner, parent, caregiver, viewer), passwordless email sign-in.
- Diaper and feeding (bottle + nursing) logging, backdating, notes, edits, void (undo), audit.
- Shared dashboard and history with filters, polling refresh, CSV/JSON export.
- Tag administration: create, label, assign child, QR fallback, printable labels, test, revoke.
- Notifications: OFF (default) / COMPOSE (share sheet, copy, Messages, optional Shortcut) /
  AUTOMATIC (provider SMS individually to each verified, consenting adult; disabled by default).
- iPhone-first PWA with honest offline drafts.

### Explicit exclusions (v1)
Sleep tracking, growth charts, medication, pumping inventory, reminders, AI/ML predictions,
feeding or medical advice, analytics/trackers, social sign-in, public sign-up, native app,
Web NFC writing, silent no-tap logging (see phase 13), correction texts, group-SMS threads.

## 2. Personas and realities
| Persona | Device | Needs | Constraints |
|---|---|---|---|
| Parent A ("Mom") — owner | Own iPhone, Safari and/or home-screen app | Log in ≤2 taps, see what partner logged, fix mistakes | One-handed, dark room, interrupted sleep |
| Parent B ("Dad") — parent | Own iPhone | Same; does not want to manage settings | May be signed out the first time he scans |
| Caregiver (later) | Own phone | Log and view; no access to numbers, members, tags, export | Must not see phone numbers or change recipients |
| Viewer (later) | Any | Read-only | Cannot write anything |
| Stranger | Any NFC phone | — | Must learn nothing: no name, no data, no confirmation the tag is valid |

Realities handled: late entries, flaky cellular, double taps, accidental scans, wrong sticker,
signed-out scan, expired session at Save, screen sleep mid-form, partner editing the same entry.

## 3. Entities (summary; full schema in phase 03 migrations)
- **Household** — display name, IANA timezone (default `America/New_York`), notification mode,
  default feed method, default volume unit.
- **Member** — auth user + role (owner/parent/caregiver/viewer) + display name ("Mom", "Dad").
- **Child** — nickname, optional archived; v1 normally one.
- **NFC tag** — opaque token, purpose (WET/POOP/BOTH/FEED), child, label, active/revoked, created by,
  last deliberate use.
- **Care event** — immutable id, type DIAPER/FEED, subtype WET/POOP/BOTH or BOTTLE/NURSING,
  `occurred_at` (when it happened), `created_at` (when recorded), author, source
  (TAG/DASHBOARD/SHORTCUT/OFFLINE_SYNC), source tag, notes, state ACTIVE/VOID, revision,
  idempotency key. Feeding details: milk type, amount (canonical mL + entered value/unit) or
  explicit unknown, nursing side, duration, end time.
- **Audit entry** — append-only CREATE/UPDATE/VOID with before/after diff, actor, time.
- **Notification preference / contact / outbox** — per adult: categories, quiet hours, encrypted
  phone, consent + verification, opt-out; outbox row per event × recipient × channel × revision.
- **Invite** — hashed single-use expiring token, email, role.

## 4. Routes and screens (component map)
Legend: (S) server component, (C) client component.

| Route | Screen | Main components | Auth |
|---|---|---|---|
| `/` | Redirect to `/dashboard` or `/login` | — | any |
| `/login?next=` | Sign in | `LoginForm` (C): email step → code step | public |
| `/auth/confirm?token_hash&type&next` | Finish sign-in from email link | `ConfirmForm` (C) POST | public |
| `/setup` | First-owner family setup | `SetupForm` (C) | signed in, no household, bootstrap email |
| `/invite/[token]` | Join family | `InviteAccept` (C) | public → signed in |
| `/t/[token]` | NFC tag landing → logging form | `TagGate` (S), `LogForm` (C) | public gate, member form |
| `/log/[intent]` | Same form, from dashboard (no tag) | `LogForm` (C) | member (writer) |
| `/saved/[eventId]` | Success | `SavedSummary`, `NotificationPanel`, `UndoButton` (C) | member |
| `/dashboard` | Home | `ChildHeader`, `SinceCards`, `QuickLog`, `RecentList`, `TodayTotals`, `LiveRefresh` (C), `PendingDrafts` (C) | member |
| `/history?type&from&to&voided` | Timeline | `HistoryFilters` (C), `EventList` (S + C pager), `DateHeading` | member |
| `/history/[eventId]` | Entry details | `EventDetail`, `EditEventForm` (C), `VoidButton` (C), `AuditTrail`, `NotificationStatusList` | member |
| `/settings` | Settings index | `SettingsNav` | member |
| `/settings/family` | Family name, timezone, child nickname(s), feed defaults, units | `FamilyForm`, `ChildForm` (C) | owner (edit), others read |
| `/settings/members` | Members, roles, invites | `MemberList`, `InviteForm` (C) | owner |
| `/settings/tags` | Tag manager | `TagList`, `TagCreateForm` (C) | owner/parent |
| `/settings/tags/[id]` | Tag detail: URL, QR, edit label/child/purpose, test, revoke | `TagDetail`, `QrCode`, `RevokeButton` (C) | owner/parent |
| `/settings/tags/print` | Printable labels | `PrintSheet` | owner/parent |
| `/settings/notifications` | Mode, my number + consent + verification, categories, quiet hours, this-phone Shortcut | `NotificationModeForm`, `ContactForm`, `PrefsForm` (C) | owner/parent (caregiver: info only) |
| `/settings/privacy` | Export, data retention, deletion steps | `ExportLinks` | owner/parent |
| `/settings/display` | Units, theme (System/Light/Night) | `DisplayForm` (C) | any member |
| `/offline` | Static offline fallback + local draft form | `OfflineDraft` (C) | none (no private data) |
| `/api/v1/*` | JSON API (see §8) | route handlers | per endpoint |

Bottom navigation (app shell): **Home · History · Settings**. Logging screens hide the bottom nav and
show a single "Cancel" (×) control to keep focus on Save.

## 5. Text wireframes (375 px)

### 5.1 Sign in
```
[logo]  NFC Baby
Sign in to your family log
Email  [______________]
[ Email me a sign-in code ]          ← primary, full width
"We'll email a link and a 6-digit code. Only invited family members can sign in."
— after send —
Check your email
Code  [ _ _ _ _ _ _ ]  (inputmode=numeric, autocomplete=one-time-code)
[ Sign in ]   · Use a different email · Resend in 30s
```
Unknown emails get the identical "Check your email" response (no account enumeration).

### 5.2 Tag landing, signed out (identical for valid, invalid and revoked tokens)
```
NFC Baby
This sticker opens a private family log.
[ Sign in to continue ]  → /login?next=/t/<token>
"Nothing has been recorded."
```
No child name, no tag purpose, no household name. `noindex`, `no-store`.

### 5.3 Logging form — Wet (POOP and BOTH identical apart from type, colour, pictogram)
```
×                                   ← Cancel (back to dashboard), no confirmation needed
[💧 pictogram, blue]  Log wet diaper
for  Juniper  ▾ (only if >1 child and not from tag)
When   ● Now (live clock 2:14 AM)   [Change time]
          └ expanded: [Now][5 min ago][15 min ago][30 min ago]
                      Date [2026-10-27]  Time [02:14]   "Event time vs recorded time shown on save"
Note (optional) [+ Add note]  → textarea 500 max, counter, chips: "Leak" "Rash concern"
[        Save wet diaper        ]   ← sticky bottom, 56 px, safe-area aware
```
One deliberate tap (Save) logs a wet diaper with time = server now.

### 5.4 Logging form — Feed
```
×
[🍼]  Log feeding     for Juniper
Method   [ Bottle | Nursing ]        ← segmented; preselected from household default or last used, visible
— Bottle —
Milk     [Breastmilk] [Formula] [Unknown]
Amount   [1] [2] [3] [4] [5] [6] oz   [Last: 3.5 oz]     unit toggle [oz | mL]
         Custom [ 3.5 ] oz      [ ] Amount not measured
— Nursing —
Side     [Left] [Right] [Both] [Not tracked]
Duration [+ Add duration]  → minutes field or Start/End times; optional timer (start/stop)
When / Note as above
[      Save bottle · 3.5 oz      ]    disabled until amount chosen or "not measured" ticked
```
Save label reflects what will be stored ("Save bottle · amount not measured").

### 5.5 Saved (success)
```
✓ Saved
Wet diaper · 2:14 AM (Tue Oct 27)      Logged by Dad · recorded 2:15 AM
[ Undo this entry ]  [ Edit ]
— Parent notification —   (separate panel)
OFF:       "Texts are off. Both parents see this in History."
COMPOSE:   "Text not sent. [Share update with Mom & Dad] [Copy] [Open Messages] ([Run Shortcut])"
AUTOMATIC: "Automatic texts: Mom — queued · Dad — not texted (quiet hours)"; updates to
           "sent to provider" / "delivered" / "failed" as reported.
[ Done ]  → dashboard
```
Never "Text sent" unless the provider confirmed it, and then per recipient.

### 5.6 Dashboard
```
Juniper ▾                           Updated 2:15 AM ⟳
┌ Last fed ──────────┐ ┌ Last diaper ─────────┐
│ 1 h 12 m ago        │ │ 14 m ago             │
│ Bottle 3.5 oz 1:03 │ │ Wet · 2:14 AM        │
└────────────────────┘ └──────────────────────┘
Log  [Wet] [Poop] [Both]
     [        Feed        ]
Recent
  2:14 AM  💧 Wet diaper        Dad
  1:03 AM  🍼 Bottle · 3.5 oz    Mom
  ...  (5)                       [See all history →]
▸ Today (since midnight): 4 wet · 2 poop · 3 bottles 10.5 oz   (collapsed by default)
```
Empty state: "No entries yet — scan a sticker or tap Log." Copy is informational: "1 h 12 m ago",
never "due".

### 5.7 History
```
History                         [All | Diapers | Feeding]   [Date ▾]  [ ] Show undone entries
Tuesday, Oct 27
  2:14 AM  💧 Wet diaper · Dad · "leak"                 ›
  1:03 AM  🍼 Bottle · Breastmilk · 3.5 oz · Mom   edited ›
Monday, Oct 26
  11:40 PM 🤱 Nursing · Left · 12 min · Mom             ›
  [ Load older ]
```
Voided entries hidden unless toggled; then struck through with "Undone by Mom".

### 5.8 Entry details
```
‹ History
Bottle · Breastmilk · 3.5 oz
Happened  Tue Oct 27, 1:03 AM     Recorded  Tue Oct 27, 1:20 AM (17 min later)
Logged by Mom via sticker "Bottle station"
Note: finished bottle
[ Edit ]  [ Undo this entry ]
Notifications: Dad — sent to provider 1:20 AM   ⚠ "Original text may already have been received."
History of changes (owner/parent): created by Mom 1:20 · amount 3 → 3.5 oz by Dad 1:25
```

### 5.9 Settings → NFC tags → New tag
```
Purpose  [Wet] [Poop] [Both] [Feed]       Child [Juniper]
Label    [Changing table — wet]
[ Create tag ]           (creates the mapping only; logs nothing)
→ Tag detail: URL https://…/t/k3x9… [Copy]  QR  [Open test link]  [Print label]
  Programming steps (NFC Tools → Write → Add record → URL → paste → Write → read back)
  Status: Not tested yet → Tested (after opening test link while signed in)
  [Revoke tag]  (confirm; permanent; create a new tag to replace)
```

### 5.10 Settings → Notifications
```
Family texting mode (owner)   ( ) Off — in-app only (default)
                              ( ) Draft — offer a text to share after saving
                              ( ) Automatic — provider SMS (unavailable: provider not configured)
My phone (for automatic texts)  •••• 1234  Verified ✓  Consent recorded Oct 27  [Change] [Stop texts]
Text me about  [x] Wet [x] Poop [x] Both [x] Feeding
Quiet hours    [ ] 10:00 PM – 6:00 AM  (no automatic texts to me in this window)
On this iPhone [ ] I installed the "NFC Baby Notify" Shortcut
Privacy note: SMS travels through the carrier and provider; it is not end-to-end encrypted.
Owner only: [Send test text…] (confirm dialog; one message to one verified number)
```

## 6. UX standards (applied in phase 02 tokens and components)
- 375–430 px primary; works at 320 px, landscape, tablet, desktop (centered 480 px column).
- Safe-area insets; ≥44 px tap targets (primary actions 56 px); inputs ≥16 px font; visible
  focus ring; contrast ≥ 4.5:1 for text in both themes; colour never the only signal (icon + word).
- Night theme: near-black warm surfaces, dimmed accents, no pure white; follows system or manual
  choice; no flashes or full-screen bright success states (success uses a small check + text).
- Sticky Save above the home indicator and above the keyboard (form scrolls; Save stays visible).
- `Enter` in a text field never submits; Save is a button, debounced while SAVING.
- Plain words: "Wet diaper", "Poop diaper", "Wet + poop", "Feeding", "Bottle", "Nursing".
- Event time vs recorded time both visible on details and on success when they differ by >2 min.
- Notes: optional everywhere; whitespace normalised; 500 char cap with counter; rendered as text.
- Status copy (exact strings): "Saved", "Saved. Text not sent — tap to share",
  "Saved. Automatic texts queued", "Not saved — check connection and try again",
  "Can't confirm the save yet — checking…", "Pending on this device — not yet in shared history;
  no text sent".

## 7. State machines
Form save: `IDLE → SAVING → SAVED | RETRYABLE_ERROR | UNCERTAIN | CONFLICT | AUTH_REQUIRED |
VALIDATION_ERROR`. `UNCERTAIN` (timeout/network error after send) triggers a status check by
`clientRequestId`; if found → `SAVED` (replayed), if not found → `RETRYABLE_ERROR` with the same key.
Notification (per recipient): `PENDING → PROCESSING → SENT_TO_PROVIDER → DELIVERED | FAILED_* |
UNKNOWN`, plus `SUPPRESSED` (quiet hours / rate ceiling / category off at enqueue time) and
`CANCELED` (event voided before send / stale).

## 8. API contract (summary; Zod schemas in `lib/domain/schemas.ts`)
| Method + path | Purpose | Notes |
|---|---|---|
| POST `/api/v1/events` | Create event | body: clientRequestId, tagToken?, childId?, intent, occurredAt?, confirmOld?, notes?, feeding?; 201 new / 200 replay / 409 key reuse with different payload |
| GET `/api/v1/events` | List | cursor, childId, types, from, to, includeVoided; newest occurred first |
| GET `/api/v1/events/by-request/:clientRequestId` | Status check for uncertain saves | own requests only |
| GET `/api/v1/events/:id` | Details + audit (role-filtered) + notification states | |
| PATCH `/api/v1/events/:id` | Edit | expectedRevision; 409 with current on conflict |
| POST `/api/v1/events/:id/void` | Undo | expectedRevision, reason? |
| GET `/api/v1/dashboard` | Summary for polling | childId? |
| GET `/api/v1/tags/:token` | Resolve tag (member only) | 404 for unknown/foreign |
| POST `/api/v1/tags`, PATCH `/api/v1/tags/:id`, POST `/api/v1/tags/:id/revoke` | Tag admin | owner/parent |
| GET `/api/v1/tags/:id/qr` | QR SVG | owner/parent |
| GET `/api/v1/me` | Membership, household, children, prefs | |
| PATCH `/api/v1/household`, POST/PATCH `/api/v1/children[/:id]` | Settings | owner |
| POST `/api/v1/invites`, POST `/api/v1/invites/:id/revoke`, POST `/api/v1/invites/accept` | Members | owner / invitee |
| PATCH `/api/v1/members/:userId` | Role / deactivate | owner |
| GET/PATCH `/api/v1/notifications/preferences` | Own prefs; owner sets household mode | |
| POST `/api/v1/notifications/contact`, `/verify/start`, `/verify/confirm`, `/opt-out` | Own number + consent | |
| POST `/api/v1/notifications/test` | Owner test send (confirm) | |
| POST `/api/v1/notifications/dispatch` | Process due outbox | Bearer CRON_SECRET |
| POST `/api/v1/notifications/twilio/status`, `/twilio/inbound` | Provider webhooks | signature-verified |
| GET `/api/v1/export?format=csv\|json` | Export | owner/parent |
| GET `/api/health` | Liveness | no data |

All mutating endpoints: POST/PATCH only, `Content-Type: application/json`, same-origin `Origin`
check, 16 KB body cap, `Cache-Control: no-store`, errors as `{ error: { code, message } }` with
codes `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `IDEMPOTENCY_MISMATCH`,
`RATE_LIMITED`, `UNAVAILABLE`, `INTERNAL`.

## 9. Edge cases (and the planned behaviour)
| Case | Behaviour |
|---|---|
| Repeat scan / refresh / back to form | GET only; no write. After save the form route is replaced by `/saved/:id`, so Back does not return to a filled form. |
| Double tap Save | Button disabled while SAVING; same clientRequestId; server unique index. |
| Lost response | Status check by clientRequestId, then same-key retry. |
| Session expired at Save | 401 → form state kept in sessionStorage → sign in → returns to same URL with fields restored → user taps Save again (same key). |
| Wrong sticker | Big type header + colour + pictogram; Cancel. If saved, Undo on success screen. |
| Tag revoked | Member sees "This sticker has been retired" + link to dashboard; stranger sees generic gate. |
| Tag of another household | Generic "This sticker isn't available" (same as unknown). |
| Future time | > now + 5 min rejected with message. |
| Very old time | > 24 h ago requires "Yes, it was more than a day ago" confirmation; > 1 year rejected. |
| DST gap/overlap | Nonexistent time → "Clocks skipped this time; choose another"; ambiguous → choose EDT/EST. |
| Bottle without amount | Save disabled until amount or "Amount not measured"; server enforces. |
| Edit after text sent | Warning: "Original text may already have been received"; no correction text. |
| Void before text sent | Pending outbox rows canceled. |
| Two parents edit same entry | Second save gets 409 + current values + "Reload and re-apply". |
| Offline | Banner; Save offers "Keep as pending on this device"; explicit sync later. |

## 10. Named acceptance tests (journeys A–I)
Implemented as Playwright specs in `tests/e2e/journeys.spec.ts` (names below are test titles).
| ID | Test name | Measurable outcome |
|---|---|---|
| J-A | `A: wet scan, save, partner sees it` | Parent A opens WET tag URL, 1 tap Save → exactly 1 WET event in DB; Parent B's dashboard (separate context) shows it after focus refresh ≤ 25 s. |
| J-B | `B: both with backdate and note` | BOTH tag → "15 min ago" + note → 1 event subtype BOTH, occurred_at = save time − 15 min (±60 s), note shown on success + history. |
| J-C | `C: 3.5 oz breastmilk bottle at 2:10 AM` | FEED → Bottle, Breastmilk, 3.5 oz, time 02:10 local → amount_ml = 103.5073 (±0.0001), occurred_at = 02:10 America/New_York → correct UTC; history shows "3.5 oz · 2:10 AM". |
| J-D | `D: repeat scan, refresh, back create nothing` | Visit tag 3×, reload, back/forward → event count unchanged. |
| J-E | `E: signed-out scan returns to tag after sign-in` | Signed out → gate (no child name in DOM) → sign in via emailed code → lands on same tag form; 0 events created. |
| J-F | `F: stranger and other household learn nothing` | Anonymous + foreign-household user: DOM/API contain no child name, no events; API 404/401. |
| J-G | `G: lost response is retried idempotently` | Route intercept aborts the first POST response after the server committed → UI shows "Can't confirm" → status check → "Saved"; DB count +1 only. |
| J-H | `H: edit after notification warns` | Event with outbox row SENT_TO_PROVIDER → edit amount → history shows new amount; detail shows "Original text may already have been received"; no new outbox rows. |
| J-I | `I: offline scan keeps an honest local draft` | Context offline → save → "Pending on this device…" and 0 server events → online → Sync → 1 event, draft cleared; re-sync creates nothing. |

## 11. Requirement → implementation mapping
| Requirement (source) | Route / component / mechanism |
|---|---|
| Four tag intents, not interchangeable (00, 04) | `nfc_tags.purpose`, server derives subtype from tag; `LogForm` intent header |
| GET never mutates (00, 04, A01) | `/t/[token]` server component read-only; writes only in POST handlers; tests J-D, A01 |
| Durable event with idempotency key (00, 03) | `log_care_event()` SQL function + unique index; ADR-008 |
| Roles and RLS (03) | migrations `…_rls.sql`; `can_write`/`is_admin` helpers; RLS tests |
| UTC storage, family zone display (00, 05) | `lib/time`; `households.timezone` |
| Backdate presets, DST handling (05) | `TimePicker` + `zonedLocalToUtcCandidates()` |
| Bottle amount or explicit unknown (06) | `FeedFields`, Zod refinement, SQL CHECK |
| oz/mL canonical storage (06) | ADR-007, `lib/domain/units.ts` |
| Undo = void + audit (00, 05) | `void_care_event()`; `care_event_audit` append-only |
| Edits with revision check (05, 07) | `update_care_event(expected_revision)` → 409 |
| Shared timeline across phones (07) | `/history`, `/dashboard`, `LiveRefresh` polling (ADR-010) |
| Tag admin, QR, print, revoke (04) | `/settings/tags/*`, `qrcode` SVG |
| Signed-out return to tag (01 E, 04) | `next` param allowlist `lib/auth/redirect.ts`; `/login` |
| Notification modes and honest states (08) | `households.notification_mode`, `NotificationPanel`, outbox |
| Phone privacy (00, 08) | encrypted `notification_contacts`, masked UI, no logs |
| Offline drafts (09) | IndexedDB `lib/offline/drafts.ts`, `/offline`, SW |
| Export with formula-injection safety (07) | `/api/v1/export`, `lib/export/csv.ts` |
| Invite-only membership (03, 07) | `household_invites`, `/invite/[token]`, `/settings/members` |
| No analytics/telemetry (00) | none installed; ADR-015 |

No contradictory flows remain: success is always a separate route reached by `replace`; logging
always requires a POST from an authenticated member with write role; notification state is always
rendered separately from the save result.

## 12. Decision log (defaults and deferrals)
| Decision | Default | Why |
|---|---|---|
| Notification mode | OFF | Works with zero accounts; texting is opt-in |
| Feed method suggestion | Last method used in this household, visibly selected | Speed without hidden assumptions |
| Bottle amount | No preselection; "Last: X" chip offered | Never store an amount the parent didn't choose |
| Volume unit | oz (household), per-device override in Display settings | US family default |
| Theme | System (light/night), manual override stored in a cookie | Correct at 2 AM without flash |
| Time presets | Now, 5, 15, 30 min ago | Covers late logging |
| Note templates | Diaper: "Leak", "Rash concern"; Feed: "Finished bottle", "Spit up" | Quick, non-diagnostic |
| Today totals | Collapsed | Avoid "assessment" feel |
| Refresh | Focus + 20 s polling | ADR-010 |
| Deferred | Realtime websockets, Shortcuts one-tap API logging, digests, reminders, pumping, charts | Phase 13 backlog |

## 13. Accessibility checklist (verified in phase 09/10)
Landmarks (`header`, `nav`, `main`), one `h1` per screen, labelled controls, `aria-live="polite"`
for save/notification status, errors linked with `aria-describedby`, segmented controls as radio
groups, buttons named by action ("Save wet diaper"), reduced-motion respected, 200 % zoom without
horizontal scroll, keyboard reachable sticky Save, axe checks with zero serious/critical issues.
