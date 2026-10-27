# Acceptance matrix — requirement to objective proof

Claude Code: maintain this with PASS / FAIL / BLOCKED (NEEDS DEVICE or ACCOUNT) and provide evidence/test commands and relevant SHA in BUILD_STATUS. Nothing is PASS merely because it exists in a prompt.

| ID | Priority | Requirement / exact verification | State | Evidence (2026-10-27, see BUILD_STATUS for SHA) |
|---|---|---|---|---|
| A01 | P0 | Public GET to each /t/opaque URL creates 0 DB events and 0 notifications | PASS | `tests/e2e/tags.spec.ts` › signed-out gate is identical…; D: repeat scans, reloads and back/forward create nothing (crawler UA + prefetch GETs, counts before/after = 0 events, 0 outbox rows) |
| A02 | P0 | WET sticker routes only to Wet form for authenticated member | PASS (automated) · physical scan NEEDS HUMAN DEVICE | `tests/e2e/diapers.spec.ts` › each sticker stores its own type…; `tests/e2e/tags.spec.ts` › owner registers all four stickers |
| A03 | P0 | POOP sticker routes only to Poop form | PASS (automated) · physical scan NEEDS HUMAN DEVICE | same tests as A02 (POOP row) |
| A04 | P0 | BOTH sticker creates one event subtype BOTH | PASS | `tests/e2e/diapers.spec.ts` › …BOTH is one row; `tests/integration/events.test.ts` › dashboard: BOTH counts as wet and poop |
| A05 | P0 | FEED sticker routes to amount/method form | PASS (automated) · physical scan NEEDS HUMAN DEVICE | `tests/e2e/tags.spec.ts` › FEED sticker opens the feeding screen; `tests/e2e/feeding.spec.ts` › C |
| A06 | P0 | Two separate parent accounts can log from same physical tag | PASS (automated, two browser contexts) · two real phones NEEDS HUMAN DEVICE | `tests/e2e/tags.spec.ts` › two parents use the same physical sticker on their own phones (2 events, both authors) |
| A07 | P0 | Anonymous viewer cannot read child data through tag ID | PASS | `tests/e2e/tags.spec.ts` › signed-out gate identical for valid/unknown/malformed, no child or purpose in HTML; `tests/e2e/security.spec.ts` › signed-out requests get 401 and no data; `tests/integration/rls.test.ts` › anon |
| A08 | P0 | Another household member cannot access/read/edit foreign events | PASS | `tests/e2e/security.spec.ts` › another family’s owner gets nothing back from any A-scoped endpoint (21 calls, 403/404/422, no ids/names/notes leaked, family A unchanged in DB); `tests/integration/rls.test.ts` (family B block); `tests/e2e/tags.spec.ts` › member of another family |
| A09 | P0 | Forged payload cannot change child/type/household/source intent | PASS | `tests/e2e/security.spec.ts` › forged fields in a save are ignored (createdBy/household/source/state/revision/subtype) + WET sticker → FEED 422; `tests/integration/events.test.ts` › forged intent / forged child id / mismatched subtype; `tests/integration/rls.test.ts` › event author is always the signed-in user |
| A10 | P0 | Same idempotency key concurrent POST produces one event | PASS | `tests/e2e/security.spec.ts` › 10 concurrent HTTP saves with one key → one 201 + nine 200, one id, +1 event; `tests/integration/events.test.ts` › 10 concurrent requests with one key |
| A11 | P0 | Same idempotency key produces only one logical notification per recipient | PASS | `tests/integration/events.test.ts` › 10 concurrent … exactly 1 outbox row per recipient; `tests/integration/notifications.test.ts` › no re-send on second pass, concurrent dispatchers never send the same row twice |
| A12 | P0 | Network retry after ambiguous commit returns original event | PASS | `tests/e2e/diapers.spec.ts` › G; `tests/e2e/uncertain.spec.ts` › response lost right after the server committed; `tests/unit/log-form.test.tsx` › lost response → status check with same key; `tests/integration/events.test.ts` › replay returns the original |
| A13 | P0 | Save failure never claims event saved or text sent | PASS | `tests/unit/log-form.test.tsx` (not saved / can’t confirm / offline / 401 / confirm-old states never navigate to success); `tests/e2e/uncertain.spec.ts` › slow server: success only after the answer; `tests/e2e/notifications.spec.ts` › a failing number…; `tests/e2e/offline.spec.ts` |
| A14 | P0 | Server SMS never runs without both provider setup AND recipient-specific consent | PASS | `tests/integration/notifications.test.ts` › opted-out, unverified, unconsented or category-disabled adults get no row; OFF/COMPOSE create no outbox rows; `tests/e2e/notifications.spec.ts` › default mode is off; `tests/unit/notifications.test.ts` › mock refuses on Vercel |
| A15 | P0 | Both opted-in parents get individual automatic sends with independent status | PASS (mock provider) · live Twilio EXTERNAL SETUP | `tests/e2e/notifications.spec.ts` › one save → two separate texts, statuses shown per parent; `tests/integration/notifications.test.ts` › both verified parents → two separate texts |
| A16 | P0 | Opted-out adult receives zero future automated messages | PASS (mock provider) | `tests/e2e/notifications.spec.ts` › Dad replies STOP; `tests/integration/notifications.test.ts` › STOP opts out…, provider “unsubscribed” error opts the number out everywhere |
| A17 | P0 | No real phones/secrets in public repo, logs, client JS, URL, CI fixtures | PASS | `npm run check:secrets` (scripts/check-secrets.mjs: git-tracked files + `.next/static`, private keys, Twilio SIDs/tokens, service-role JWTs, non-555-01xx numbers, literal server-only env values; negative-tested with a planted number/token) — runs in CI; `tests/e2e/security.spec.ts` › production bundle has no source maps and no server secrets; `tests/e2e/notifications.spec.ts` › pages and APIs never expose a full phone number; `tests/unit/log.test.ts` redaction. GitHub Advanced Security secret scanning is not enabled on the repo (tool refused) — limitation |
| A18 | P0 | Revoked NFC tag cannot authorize new entry workflow | PASS | `tests/e2e/tags.spec.ts` › relabelling keeps the URL; retiring stops the sticker for good (page + POST 410); `tests/integration/events.test.ts` › a revoked tag cannot be used to log; `tests/unit/offline.test.ts` › 410 during sync needs a decision |
| A19 | P0 | Undo is audited void, dashboard excludes voided row, previously sent SMS warning shown | PASS | `tests/e2e/diapers.spec.ts` › undo removes the entry from Home and totals; the audit keeps it; `tests/e2e/feeding.spec.ts` › H (undo after a sent text: dialog + result say it can’t be recalled, state VOID, no new outbox row); `tests/integration/events.test.ts` › void |
| A20 | P0 | Cross-parent edits use revision check and do not clobber silently | PASS | `tests/e2e/diapers.spec.ts` › two parents editing at once: the second save is refused; `tests/integration/events.test.ts` › rejects a stale revision |
| A21 | P1 | Manual occurred_at differs correctly from created_at and sorts by occurrence | PASS | `tests/integration/events.test.ts` › keeps an explicit backdated time distinct from created_at; `tests/e2e/timeline.spec.ts` › newest occurrence first |
| A22 | P1 | Time zone + DST/overnight tests pass for America/New_York | PASS | `tests/unit/time.test.ts` (gap/overlap/midnight); `tests/e2e/dst.spec.ts` (spring-forward refused with explanation; fall-back first/second 1:30 stored as 05:30Z/06:30Z; offset-less API time 422); `tests/e2e/diapers.spec.ts` › before midnight; `tests/e2e/timeline.spec.ts` › family zone change |
| A23 | P1 | Bottle 3.5 oz, 120 mL conversion correct, unknown not zero | PASS | `tests/e2e/feeding.spec.ts` › C, 120 mL, “Amount not measured”; `tests/integration/events.test.ts` › 3.5 oz canonical, DB CHECK refuses zero |
| A24 | P1 | Nursing optional duration + side without fabricated volume | PASS | `tests/e2e/feeding.spec.ts` › nursing; `tests/integration/events.test.ts` › nursing rows |
| A25 | P1 | Notes optional across all four intents; safely displayed, validated | PASS | `tests/unit/schemas.test.ts` (one note schema for every intent); `tests/e2e/diapers.spec.ts` › notes optional, 500 ok / 501 refused; `tests/e2e/security.spec.ts` › script in a note is shown as text; `tests/e2e/timeline.spec.ts` › `=1+1` rendered as text |
| A26 | P1 | Signed-out scan→login→correct tag route with no accidental event | PASS | `tests/e2e/tags.spec.ts` › E; `tests/e2e/auth.spec.ts` › signed-out visitors are sent to sign-in and come back |
| A27 | P1 | Parent A save appears to parent B on their own phone after expected refresh | PASS (automated, two browser contexts) · two real phones NEEDS HUMAN DEVICE | `tests/e2e/timeline.spec.ts` › A (focus refresh) and passive 20 s polling |
| A28 | P1 | iPhone compose message can be shared/copied; app doesn't mark as sent | PASS (automated: draft, Copy, sms: link, no “sent” wording) · iOS share sheet NEEDS HUMAN DEVICE | `tests/e2e/notifications.spec.ts` › compose mode |
| A29 | P1 | Optional Shortcuts handoff verified on real iPhone for BOTH recipients | NEEDS HUMAN DEVICE | Shortcut setup documented in docs/SMS_OPTIONS.md; not verifiable without an iPhone |
| A30 | P1 | Provider failure to one recipient doesn't undo event or affect other recipient | PASS (mock provider) | `tests/e2e/notifications.spec.ts` › a failing number does not affect the saved entry or the other parent; `tests/integration/notifications.test.ts` › failure isolation |
| A31 | P1 | No duplicate on double tap, browser back, refresh, offline sync | PASS | `tests/e2e/diapers.spec.ts` › rapid double tap; `tests/e2e/tags.spec.ts` › D (back/forward/reload); `tests/e2e/uncertain.spec.ts` › slow server taps; `tests/e2e/offline.spec.ts` › re-sync creates nothing; `tests/unit/log-form.test.tsx` › triple tap = 1 POST |
| A32 | P1 | Accessibility: VoiceOver labels, 44px targets, contrast, keyboard focus | PASS (automated) · VoiceOver NEEDS HUMAN DEVICE | `tests/e2e/a11y.spec.ts` (axe WCAG 2.2 A/AA, 0 violations on 15 signed-in screens + bottle form in day and night, 3 signed-out screens); `tests/unit/design-tokens.test.ts` (contrast of every token pair); `tests/e2e/screens.spec.ts` (primary actions ≥ 44 px, 16 px inputs, reduced motion); Lighthouse accessibility 1.00 (BUILD_STATUS phase 09) |
| A33 | P1 | Mobile 320–430px screenshots have no primary-action clipping/overflow | PASS | `tests/e2e/screens.spec.ts` › core screens at 320/375/430 px day + night; landscape and 200 % zoom (197 px) |
| A34 | P1 | Offline event drafts never masquerade as confirmed synchronized data | PASS | `tests/e2e/offline.spec.ts` (pending wording, 0 server events until sync, same key, OFFLINE_SYNC source, other user never uploads); `tests/unit/offline.test.ts`; `tests/unit/log-form.test.tsx` › keep pending |
| A35 | P1 | CSV/JSON export authorized, protected, formula injection safe | PASS | `tests/e2e/timeline.spec.ts` › export (no-store attachment, `'=1+1`, caregiver/viewer 403, other family empty); `tests/unit/csv.test.ts`; `tests/e2e/security.spec.ts` (other family’s export has none of A) |
| A36 | P1 | Parent/admin tag registration, QR fallback, revocation functional | PASS | `tests/e2e/tags.spec.ts` › owner registers all four stickers (QR + steps), relabel/retire, caregivers blocked |
| A37 | P1 | Default privacy/no SMS mode works with zero messaging credentials | PASS | `tests/e2e/notifications.spec.ts` › default mode is off; CI runs with `SMS_PROVIDER=off` and no Twilio secrets |
| A38 | P1 | Fresh DB migration, typecheck, lint, unit, integration, E2E, build all pass | PASS (local; CI result recorded in BUILD_STATUS) | `npm run db:reset` (6 migrations from empty), `npm run db:lint` (0 warnings, fails CI on any), `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test` (215), `npm run test:integration` (96), `npm run build`, `npm run test:e2e` (92), `npm run check:secrets`, `npm audit` (0 vulnerabilities) |
| A39 | P1 | Live deployed production HTTPS URL and true NFC iPhone scan verified | BLOCKED — NEEDS ACCOUNT SETUP + HUMAN DEVICE | Requires hosted Supabase + Vercel project (phase 11) and a real iPhone with programmed stickers |
| A40 | P2 | Event can be logged in 1 explicit tap after Wet tag page opens | PASS | `tests/e2e/diapers.spec.ts` › each sticker stores its own type at “now” with one explicit tap |
| A41 | P2 | Feeding has big amount controls, custom amount and fast confirm | PASS | `tests/e2e/feeding.spec.ts` (oz/mL chips, custom amount, Save label repeats the amount); `tests/e2e/screens.spec.ts` (feed form at 320 px, Save ≥ 44 px) |
| A42 | P2 | Settings simple; no charts/AI/autodosing clutter at launch | PASS (inspection) | package.json has no chart/AI dependencies; Settings = Family, Members, Stickers, Texts, Display, Privacy (screens audited in `a11y.spec.ts`) |

## Adversarial scenarios (prompt 10) → tests
| # | Scenario | Result | Where |
|---|---|---|---|
| 1 | Stranger scans a valid URL | PASS — generic gate, no name/events/phone, identical for unknown tokens | `tags.spec.ts`, `security.spec.ts` (401 sweep) |
| 2 | Other household scans / guesses ids / calls APIs | PASS — 403/404, nothing leaked, nothing changed | `security.spec.ts`, `rls.test.ts`, `tags.spec.ts` |
| 3 | Tampered tag payload, author, household, HTML in notes | PASS — server derives them; 422 on intent mismatch; notes rendered as text | `security.spec.ts`, `events.test.ts` |
| 4 | 10 concurrent POSTs, same key | PASS — 1 event, 1 outbox row per recipient | `security.spec.ts`, `events.test.ts` |
| 5 | Crawlers, link previews, prefetch, browsing without Save | PASS — 0 writes, 0 notifications | `tags.spec.ts` |
| 6 | Two distinct events, same time/type, different keys | PASS — both saved | `events.test.ts`, `diapers.spec.ts` |
| 7 | Network lost after commit; retry | PASS — original record, no duplicate | `diapers.spec.ts` › G, `uncertain.spec.ts` |
| 8 | Wrong/voided event excluded from last fed/diaper and totals | PASS | `events.test.ts` (dashboard), `diapers.spec.ts` (undo) |
| 9 | DST fall-back / spring-forward / midnight | PASS — explained, explicit choice, exact UTC | `time.test.ts`, `dst.spec.ts`, `diapers.spec.ts` |
| 10 | Simultaneous edits | PASS — second refused, nothing overwritten | `diapers.spec.ts`, `events.test.ts` |
| 11 | Save OK, provider fails | PASS (mock) — event stays, failed/unknown shown | `notifications.spec.ts`, `notifications.test.ts` |
| 12 | One parent opted out / both opted in | PASS (mock) — exactly 1 / 2 separate targets | `notifications.spec.ts`, `notifications.test.ts` |
| 13 | Privacy of bundle, source maps, logs, repo, URLs | PASS — see A17 | `check-secrets.mjs`, `security.spec.ts`, `log.test.ts` |
| 14 | Revoked/stale tag | PASS — safe view, 410 | `tags.spec.ts`, `events.test.ts` |
| 15 | Cron, callbacks, test-SMS protected and limited | PASS — bearer secret, Twilio signatures, owner-only test text ≤ 3/hour | `notifications.spec.ts` |
| 16 | Session expires at Save | PASS — entry kept, re-auth, one save; no cross-user drafts | `tags.spec.ts`, `offline.spec.ts` |
| 17 | Content injection / CSV formula injection | PASS | `security.spec.ts`, `timeline.spec.ts`, `csv.test.ts` |
| 18 | Repeated taps during slow responses | PASS — one request, success only after the answer | `uncertain.spec.ts`, `log-form.test.tsx` |
| 19 | Turning on automatic texts never sends a backlog | PASS | `notifications.test.ts` |
| 20 | No real SMS from tests/CI/staging by default | PASS — mock/off everywhere; mock refuses on Vercel; CI has no Twilio secrets | `notifications.test.ts`, `ci.yml` |

## Mandatory demonstrations
| # | Demonstration | Automated equivalent | Real device / account |
|---|---|---|---|
| 1 | Diaper speed: iPhone scan → Wet form → Save → success with exact event + notification state | PASS — `diapers.spec.ts` one-tap save, `notifications.spec.ts` states | NEEDS HUMAN DEVICE |
| 2 | Feeding accuracy: Feed → Bottle/3.5 oz/Breastmilk/time → Save → shared timeline | PASS — `feeding.spec.ts` › C | NEEDS HUMAN DEVICE |
| 3 | Two parents: B sees A's record in an independent browser/account | PASS — `timeline.spec.ts` › A | NEEDS HUMAN DEVICE (two phones) |
| 4 | Safety: valid tag in private browser, no login → no event, no child identity | PASS — `tags.spec.ts` signed-out gate (fresh context) | NEEDS HUMAN DEVICE |
| 5 | Text honesty: Compose shows a draft, no "sent" claim; auto mode only with provider + consent | PASS — `notifications.spec.ts` compose + automatic (mock) | Live Twilio EXTERNAL SETUP |
| 6 | Recovery: kill network after commit, replay same key, no duplicate | PASS — `diapers.spec.ts` › G, `uncertain.spec.ts` | — |

## Evidence format
For every PASS, add a short reference in BUILD_STATUS or test results:
- Date/time and commit SHA
- Automated command and actual outcome (or device/browser details for manual)
- Where proof lives (test filename, test log, limited non-sensitive screenshot)
- Blocking external requirement if device/provider unavailable

Never store baby names, actual notes or parent phone numbers in these evidence artifacts.
