# BUILD_STATUS

Evidence log for the phased build defined in `prompts/00`–`13`. A phase is PASS only when its
gate's automated checks ran and passed; anything that needs a human, a device or an account is
marked **EXTERNAL SETUP** / **NEEDS HUMAN DEVICE/ACCOUNT SETUP** instead.

## NEXT_ACTION
Phase 05 — diaper workflows: dashboard quick actions (`/log/[intent]`), history detail with edit +
void (`/history/[id]`), audit view, diaper-specific tests (BOTH = one row, 500-char note, DST/
midnight backdating, concurrent parents, void excluded from totals).

## Phase table
| Phase | Status | Commit | Evidence (commands / results) | Open questions / external setup |
|---|---|---|---|---|
| 00 Operating rules | PASS | f9e26af | Toolchain verified: Node 22.22.0, npm 10.9.4, Docker 29 daemon, local Supabase stack started from `ghcr.io` images (Postgres 17, GoTrue, PostgREST, Mailpit). Package versions checked on npm registry 2026-10-27. ADRs in `docs/ARCHITECTURE_DECISIONS.md`. | Hosted Supabase project, Vercel project, domain, Twilio are owner accounts → EXTERNAL SETUP |
| 01 Product + UX | PASS | 32257b7 | `docs/PRODUCT_SPEC.md`: entities, personas, exclusions, 13 route/component map, 10 text wireframes, state machines, API contract, 14 edge cases, journeys J-A…J-I as named Playwright tests with measurable outcomes, requirement→route mapping, decision log. Docs-only phase; no code to test. | None blocking |
| 02 App foundation | PASS | d09cbbc | `npm run lint` ✔ 0 problems; `npm run typecheck` ✔; `npm test` ✔ 3 files / 105 tests (redirect allowlist incl. open-redirect vectors, log redaction, WCAG contrast of every token pair in day + night themes — caught and fixed 4 failing border pairs); `npm run build` ✔ (Next 16.4.3 Turbopack, all routes dynamic, Proxy active); `npx playwright test tests/e2e/smoke.spec.ts` ✔ 4/4 (no overflow at 320 px, CSP nonce + noindex + no-store + nosniff + same-origin referrer, health endpoint reveals nothing, safe 404). Screenshots of day/night shell reviewed. CI workflow `.github/workflows/ci.yml` added (not yet run on GitHub). | Demo/mock mode deliberately not built (local Supabase used instead). Vercel preview not yet created (phase 11). |
| 03 Data + security | PASS | fe8aa5b + 6a79611 | Migrations `supabase/migrations/2026102700010…400` apply cleanly to a fresh DB (`supabase db reset`). `npm run test:integration` ✔ 3 files / 82 tests against real local GoTrue + PostgREST + Postgres 17 with real user JWTs: anon gets 42501 on every table; foreign-household reads return [] and writes/edits/voids/tag use return NB404; direct INSERT/UPDATE/DELETE denied; contacts table unreadable even by owner; role matrix (viewer/caregiver/parent/owner); 10 concurrent same-key POSTs → 1 event + exactly 2 outbox rows; key reuse with other payload → 409; tag intent/child forgery → 422; revoked tag → 410; time guards; 3.5 oz → 103.5074 mL; unknown ≠ 0; DB CHECK blocks zero amount even for service role; revision conflicts; no-op edits; void cancels pending texts; events/audit undeletable; dashboard by occurrence; enqueue rules (mode, consent, verification, opt-out, category, quiet hours, own entries, caregivers never recipients); invites (hash only, single use, email match, expiry, revoke); every table has RLS; no SECURITY DEFINER fn executable by anon. `npm test` ✔ 7 files / 144 unit tests (DST gap/overlap, units, notes, schemas, template, tokens). `npx playwright test tests/e2e/auth.spec.ts` ✔ 8/8 (bootstrap via emailed code, no sign-up for strangers, invite join on second context incl. wrong-email refusal and single use, sign-in return path, wrong code, scanner-safe email link, non-member lockout). Manual curl: 201/200 replay/409/401/415/confirmOld verified. Docs: `docs/API.md`, `docs/DATA_MANAGEMENT.md`, `docs/DEVELOPMENT.md`. CI `database` job added. | Hosted Supabase: email templates + "disable sign-ups" must be configured in the dashboard (phase 11 doc). Default Supabase SMTP is rate-limited → custom SMTP recommended (EXTERNAL SETUP). |
| 04 NFC tag system | PASS (automated) · real-iPhone scan NEEDS HUMAN DEVICE | (this commit) | `npx playwright test tests/e2e/tags.spec.ts` ✔ 12/12: owner registers WET/POOP/BOTH/FEED via Settings UI (0 events; URL `/t/<26-char token>`; QR + iPhone writing steps; non-HTTPS warning); print sheet has no child name; caregiver blocked (UI redirect + API 403); signed-out gate byte-identical for valid/unknown/malformed tokens, no child/purpose in HTML, `no-store`; crawler UA + prefetch GETs → 0 events/0 outbox; journey E (scan → sign in → same form, 0 events); journey D (3 scans, reload, back/forward → 0 writes; 1 Save → 1 event; Back after save doesn't return to a form); two parents on one sticker → 2 events with both authors; FEED sticker → feeding screen; other family → 404 page + API 404 + POST 404; viewer → "View only"; scan-test panel marks tested; relabel keeps URL; retire → "Sticker retired" + POST 410; session expiry → entry kept in sessionStorage → re-auth → restored → 1 save. `npm test` ✔ 9 files / 158 (snapshot user scoping/expiry, time-picker presets/midnight/DST, LogForm: no send on render, triple tap = 1 POST with one key, lost response → status check with same key, confirmed-not-saved retry reuses key, 401 keeps entry + sign-in link, confirm-old prompt). `npm run lint` ✔ `npm run typecheck` ✔ `npm run build` ✔. | Actual NFC write + scan on iPhone, Safari banner behaviour, anti-metal placement: NEEDS HUMAN DEVICE (steps in tag detail page + docs/NFC_STICKER_SETUP.md). Production HTTPS URL pending deployment (phase 11). |
| 05 Diaper workflows | NOT STARTED | | | |
| 06 Feeding workflows | NOT STARTED | | | |
| 07 Timeline + settings | NOT STARTED | | | |
| 08 Parent notifications | NOT STARTED | | | |
| 09 PWA, offline, a11y | NOT STARTED | | | |
| 10 Testing + security | NOT STARTED | | | |
| 11 Deployment + onboarding | NOT STARTED | | | |
| 12 Adversarial review | NOT STARTED | | | |
| 13 Optional enhancements | NOT STARTED (gated on 00–12) | | | |

## Environment facts (for resuming sessions)
- Start Docker if needed: `dockerd > /tmp/dockerd.log 2>&1 &`
- Local Supabase in this sandbox: `SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io npx supabase start`
  (Docker Hub / ECR pulls are rate-limited here; GHCR works).
- Playwright: Chromium 1243 preinstalled at `/opt/pw-browsers`, matching `@playwright/test` 1.63.
