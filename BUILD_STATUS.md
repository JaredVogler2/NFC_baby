# BUILD_STATUS

Evidence log for the phased build defined in `prompts/00`–`13`. A phase is PASS only when its
gate's automated checks ran and passed; anything that needs a human, a device or an account is
marked **EXTERNAL SETUP** / **NEEDS HUMAN DEVICE/ACCOUNT SETUP** instead.

## NEXT_ACTION
Phase 03 — Supabase migrations (schema, RLS, SQL functions), auth flows (OTP send/verify, confirm,
bootstrap, invites), `/api/v1` event routes, integration tests against local Supabase.

## Phase table
| Phase | Status | Commit | Evidence (commands / results) | Open questions / external setup |
|---|---|---|---|---|
| 00 Operating rules | PASS | f9e26af | Toolchain verified: Node 22.22.0, npm 10.9.4, Docker 29 daemon, local Supabase stack started from `ghcr.io` images (Postgres 17, GoTrue, PostgREST, Mailpit). Package versions checked on npm registry 2026-10-27. ADRs in `docs/ARCHITECTURE_DECISIONS.md`. | Hosted Supabase project, Vercel project, domain, Twilio are owner accounts → EXTERNAL SETUP |
| 01 Product + UX | PASS | 32257b7 | `docs/PRODUCT_SPEC.md`: entities, personas, exclusions, 13 route/component map, 10 text wireframes, state machines, API contract, 14 edge cases, journeys J-A…J-I as named Playwright tests with measurable outcomes, requirement→route mapping, decision log. Docs-only phase; no code to test. | None blocking |
| 02 App foundation | PASS | (this commit) | `npm run lint` ✔ 0 problems; `npm run typecheck` ✔; `npm test` ✔ 3 files / 105 tests (redirect allowlist incl. open-redirect vectors, log redaction, WCAG contrast of every token pair in day + night themes — caught and fixed 4 failing border pairs); `npm run build` ✔ (Next 16.4.3 Turbopack, all routes dynamic, Proxy active); `npx playwright test tests/e2e/smoke.spec.ts` ✔ 4/4 (no overflow at 320 px, CSP nonce + noindex + no-store + nosniff + same-origin referrer, health endpoint reveals nothing, safe 404). Screenshots of day/night shell reviewed. CI workflow `.github/workflows/ci.yml` added (not yet run on GitHub). | Demo/mock mode deliberately not built (local Supabase used instead). Vercel preview not yet created (phase 11). |
| 03 Data + security | NOT STARTED | | | |
| 04 NFC tag system | NOT STARTED | | | |
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
