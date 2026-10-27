# Phase 12 — adversarial review report

**Date:** 2026-10-27. **Method:** three independent read-only reviewers attacked separate trust
boundaries. Each one traced code paths and ran read-only SQL against the local database.
- **Security:** auth, RLS, routes, invites, redirects.
- **Notifications:** SMS pipeline, consent, crypto, webhooks.
- **Client:** save state machine, offline drafts, service worker, wording, accessibility.

Every finding below was checked against the code before it was fixed. A regression test was added
where a test could prove the fix. Severity follows prompt 12:
- **P0:** data leak, wrongful SMS, wrong baby, unauthenticated mutation, data corruption.
- **P1:** duplicate logs, broken save or auth, false claim, wrong time or amount, inaccessible core button.
- **P2:** minor.

**Outcome:** 1 P0 and 15 P1 findings, **all fixed**. 23 P2 findings: 19 fixed, 4 accepted with a
reason (backlog below). No reviewer found cross-family data access, unauthenticated mutation, role
escalation, open redirect, a plaintext phone number, or a duplicate-SMS path.

Fix commit: the phase-12 commit (see `BUILD_STATUS.md`). Schema changes are in
`supabase/migrations/20261027000700_review_fixes.sql`, which replaces functions in place so grants
are kept.

## Findings and fixes

| # | Sev | Finding | Cause | Fix | Proof |
|---|---|---|---|---|---|
| 1 | **P0** | A sticker save could be filed under a different child than the form showed, if the sticker was moved to another child while the form was open or an offline draft was waiting. | The client sent only the tag token, so the server's child-mismatch check never ran. | The form, the offline draft and the sync now always send `childId`. The server refuses a mismatch (422) and the draft shows "needs attention". | `review-fixes.test.ts` (moved sticker → NB422, 0 events); `offline.spec.ts` (pending draft + sticker moved → refused, 0 events); `log-form.test.tsx` (body carries `childId`) |
| 2 | P1 | Export stopped after the 200 newest entries per child, even though it is documented as the backup. | The page size of 200 plus a look-ahead row hit the SQL cap of 200, so there was never a next cursor. | Pages are capped at 199. Export uses `listAllEvents`. | `review-fixes.test.ts` (450 entries → 450 unique) |
| 3 | P1 | Stickers of an archived child still logged, and those entries were invisible on Home and in History while texts still went out. | The tag path in `log_care_event` didn't check `archived_at`. | The server returns 410 (retired). The sticker page shows "Sticker retired". | `review-fixes.test.ts` (archived child → NB410) |
| 4 | P1 | Verification texts could be sent without limit to any number: remove the number, add it again, request again. International numbers were accepted. | The rate limits lived in the deletable contact row. | A per-person and per-number send log that survives removal (1/min, 5/day per person, 5/day per number). Only US/CA (+1) numbers are accepted. STOP is remembered per number in its own table, cleared only by START. | `review-fixes.test.ts` (5 remove+re-add loops → `daily_limit`; one number ≤ 5/day across people; STOP survives re-add and blocks old codes; START lifts it); `notifications.test.ts` (non-+1 numbers refused) |
| 5 | P1 | A server error after the entry was committed showed "Not saved". The parent re-logged it, creating a duplicate entry and duplicate texts. | Only 502/504 counted as uncertain. | Any 5xx on save triggers a status check with the same id. | `log-form.test.tsx` (500 → status check → saved, single POST) |
| 6 | P1 | If the confirmation page failed to load (signal dropped), the offline or error page said "Nothing was recorded" for an entry that was saved. | Success was shown only on the next page. | The form shows "Saved ✓" before navigating. The offline and error screens for `/saved/*` say it was saved. | `log-form.test.tsx` (Saved ✓ on the form) |
| 7 | P1 | The nursing timer outlived the save and filled the next feed with, for example, 150 minutes. | The timer's sessionStorage key was never cleared. | Cleared on save and on keep-pending. | `log-form.test.tsx` (timer key removed after save) |
| 8 | P1 | While the nursing timer ran, "Not saved" and other messages vanished instantly. | `update` changed identity with status, and the timer effect re-ran and reset the status. | `update` is now stable; timer updates are "quiet". | Covered by the stable-callback change; full E2E feeding suite green |
| 9 | P1 | On the night clocks go back, "5/15 min ago" and Start timer stored a time one hour early. This was live on Sun 2026-11-01. | The preset always picked the first of two candidate instants. | Picks the candidate within 60 s of the real instant. | `time.test.ts` (1:20 AM EST − 15 min → 06:05Z; EDT case → 05:05Z) |
| 10 | P1 | Retries after offline, 401 or a lost response stored the retry time, not the tap time. | "Now" was resolved by the server at each attempt. | The tap time of an unconfirmed attempt is pinned and reused, and restored with the snapshot. The banner says which time is kept. | `log-form.test.tsx` (offline → retry → occurredAt = tap ±1 s) |
| 11 | P1 | "Keep as pending" stored the first tap's values instead of the corrected ones on screen. | It used the last attempt's payload. | When offline (nothing sent), the payload is rebuilt from the current form and validated. After an unconfirmed send, the form stays locked and the original body is kept. | `log-form.test.tsx` (note typed after offline is in the draft) |
| 12 | P1 | An entry that may already have been saved was described as "NOT yet in shared history; no text sent". | Same wording for every draft. | Separate wording: "Kept on this phone — may already be saved" and "May already be saved — checked with the same id". | `log-form.test.tsx`, `uncertain.spec.ts` (no "no text sent" claim) |
| 13 | P1 | "Not saved" was shown right after a timeout while a slow request could still commit. | The status check ran immediately. | Checks are spaced 1, 2 and 3 s apart. The copy is "Not saved yet — trying again is safe". | `log-form.test.tsx`, `uncertain.spec.ts` |
| 14 | P1 | Pending entries only synced from Home. Stickers open in Safari, so Safari-side drafts could sit until they expired. | The sync was mounted only on the dashboard. | Sticker and log screens also sync drafts that existed when they opened. | `uncertain.spec.ts` (re-scan → "1 earlier entry … is now in the shared history") |
| 15 | P1 | The saved page said "Text not sent — tap to share" for an entry that was already texted, if the family later changed mode. | The page used the current mode. | Recipient states are shown whenever outbox rows exist. A draft is offered only when nothing was queued. | `notifications.spec.ts` suite green |
| 16 | P1 | A text could go out after the person turned texts off, replied STOP, the entry was undone, quiet hours began, or the mode changed, if it happened after the row was queued. | The dispatcher used the claim-time snapshot. | `outbox_send_check` re-checks everything immediately before each send. | `review-fixes.test.ts` (prefs off after queueing → `CANCELED:PREFS_OFF`, other parent sent) |
| 17 | P2 | Entries that happened hours ago (offline sync, backfill) were texted late. | Staleness used `created_at` only. | Not texted if the entry happened more than 60 minutes ago ("too late to be useful"). | `review-fixes.test.ts` (2 h-old entry → `CANCELED:STALE`) |
| 18 | P2 | Owner test texts ignored the family mode and the recipient's setting, and the 3/hour cap could be raced. | Count, then send, then insert. | Requires automatic mode and the recipient's texts on. The slot is reserved atomically (advisory lock). A 21610 result records an opt-out. | `review-fixes.test.ts` (6 concurrent → 3); `notifications.spec.ts` (3/hour) |
| 19 | P2 | A slow batch could outlive its lease, so a text that was sent was marked "unknown" and its SID lost. | 10-row claims with a 60 s lease; the body read had no timeout. | One row per claim; the timeout covers the body; a lease-expired row can still record SENT_TO_PROVIDER and its SID. | Dispatcher integration suite (concurrency, lease, unknown) green |
| 20 | P2 | Membership could be inferred from the sign-in endpoint (429 vs 200). | Supabase's per-user limit applies only to members. | Same app-side cooldown for every address before Supabase is called (60 s; 2 s in E2E). Supabase's own limit is answered like a success. | `review-fixes.test.ts` (slot taken once per cooldown) |
| 21 | P2 | A NULL expected revision skipped the conflict check (direct RPC only). | `revision <> NULL` evaluates to NULL. | NULL counts as a conflict (409). | `review-fixes.test.ts` |
| 22 | P2 | Former parents' encrypted numbers could not be deleted. | Contact management required an active owner or parent target. | A trigger deletes the contact, turns texts off and cancels queued texts when a member is disabled or demoted. | `review-fixes.test.ts` |
| 23 | P2 | A display name could put a link or phone number into every text. | Names were inserted verbatim. | Links, domains and long digit runs are stripped. | `template.test.ts` |
| 24 | P2 | A code requested before a STOP could undo the STOP within 10 minutes. | Confirmation cleared `opted_out_at`. | Confirmation is refused while the number is opted out; STOP clears pending codes. | `review-fixes.test.ts` |
| 25 | P2 | Settings overclaimed: "Code sent" when unconfirmed; "Nothing more will be sent" ignored an in-flight text. | — | Wording follows the provider result; the in-flight caveat is stated. | E2E notifications green |
| 26 | P2 | "A text was already sent" also covered unknown and processing states. | — | Now reads "may already have been sent". | `feeding.spec.ts` › H |
| 27 | P2 | "Will retry" implied a scheduled retry; the docs claimed retries on every save. | Retries only happen on a Home visit or the daily cron. | Status reads "tried again when someone opens Home (or within a day)"; docs corrected. | — |
| 28 | P2 | The saved page polled every 2 s indefinitely. | The effect depended on the recipients array. | Depends on the in-flight flag; at most 20 tries. | — |
| 29 | P2 | Back after sign-out could show the previous person's page from Safari's back/forward cache. | Safari bfcache. | Pages restored from bfcache are reloaded from the server. | — |
| 30 | P2 | Home refresh while offline replaced data with the offline page. | — | No refresh while the browser reports offline. | — |
| 31 | P2 | The Amount group had no accessible name; the edit form's "Now" chip did nothing; "Repeat last feed" forced oz. | — | Legend fixed, "Now" sets the current minute, falls back to the family unit. | axe suite green |

## Accepted / backlog (P2, with reason)

| Finding | Reason it is acceptable for launch | Mitigation / next step |
|---|---|---|
| Supabase per-IP auth limits are shared through Vercel's egress, so a remote attacker could slow down sign-in for the family (suspected, not reproduced) | Needs hosted infrastructure to verify. The impact is availability, not data. Sign-in is rare once a session exists (sessions refresh). | `docs/TROUBLESHOOTING.md` explains the symptom and how to raise the limits in Supabase. Next step: an app-side per-IP limiter. Supabase's built-in CAPTCHA can't be switched on as-is, because codes are requested server-side; it would need a client widget passing a token through. |
| The author also gets a text about their own entries by default | The brief asks for texts to "both" consenting adults. | Each parent can untick "include my own entries" in Settings. |
| A 10-digit number typed without "+" is read as a US number | US-only by design (A2P 10DLC). Texts start only after the number's owner types the code. | Show the full formatted number back before saving (UI). |
| An owner can call `set_notification_mode` directly and enable automatic mode with no provider | Owner-only self-harm. Every send then fails visibly as "not sent — failed". No data risk. | Move the mode change behind the service role. |
| 3 AM UX ideas: time on the Save button; automatic status check when a restored entry appears | Not defects. The current screens already state the time and that Save is safe to repeat. | Phase 13 candidates. |

## Prompt-12 review procedure: results

- **Taps:** a wet diaper is one deliberate tap after the sticker page opens (`diapers.spec.ts`).
- **Feeding:** the last method is preselected with an explanation, "Last: X" is offered as a chip, there is an explicit "Amount not measured" option, and nursing details are optional.
- **Night mode:** dark surfaces, muted Save, no full-screen flashes (screens at 320–430 px in day and night; axe 0 violations).
- **Wording:** every success message was audited. Saved ✓ is never shown before the server confirms. Texts state draft / queued / sent to provider / delivered exactly.
- **Migrations from zero:** apply cleanly; `db lint` reports 0 warnings and fails CI on any.
- **Failed migration:** a deliberately failing migration rolls back completely and isn't recorded, and the retry after removal applies cleanly (probe run 2026-10-27).
- **Cleanup:** no debug output, TODOs, placeholder links or mock persistence in production code. The mock SMS provider refuses to run on Vercel.

## Final acceptance demo (prompt 12): status

| Item | Status |
|---|---|
| Four NFC URLs work on an actual phone and persist only after Save | Automated: PASS (Chromium, iPhone viewport). **Real iPhone: NEEDS HUMAN DEVICE** |
| Wet and both diapers, edit note/time, void, author/audit | PASS (`diapers.spec.ts`) |
| 3.5 oz bottle + nursing, conversion/date | PASS (`feeding.spec.ts`) |
| Mom and Dad on separate sessions, shared timeline | PASS (two browser contexts). Two real phones: NEEDS HUMAN DEVICE |
| Outsider denied even with a valid tag URL | PASS (`tags.spec.ts`, `security.spec.ts`) |
| Duplicate/retry → one record and outbox jobs | PASS (`security.spec.ts`, `events.test.ts`, `uncertain.spec.ts`) |
| Notification mode demo | Compose: PASS. Automatic: PASS with the mock provider only. **Live Twilio to both phones: EXTERNAL SETUP** |
| Export privacy, auth, no-secret scan | PASS |
| Real deployment status | **Not deployed.** The Vercel connector may not create projects (403), and no hosted Supabase exists yet. Owner steps are in `docs/DEPLOYMENT.md`. |

## Evidence (this commit, local)

| Check | Result |
|---|---|
| `npm run db:reset` | 7 migrations applied from empty |
| `npm run db:lint` | 0 warnings |
| `npm run lint`, `npm run typecheck`, `npm run format:check` | clean |
| `npm test` | 12 files / 225 tests |
| `npm run test:integration` | 5 files / 107 tests, run twice to check repeatability |
| `npm run build` | OK |
| `npx playwright test` | 93/93 |
| `npm run check:secrets` | pass |
| `npm audit` | 0 vulnerabilities |
