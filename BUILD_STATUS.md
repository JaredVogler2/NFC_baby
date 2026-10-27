# BUILD_STATUS

Evidence log for the phased build defined in `prompts/00`–`13`. A phase is PASS only when its
gate's automated checks ran and passed; anything that needs a human, a device or an account is
marked **EXTERNAL SETUP** / **NEEDS HUMAN DEVICE/ACCOUNT SETUP** instead.

## NEXT_ACTION
Phase 01 — write `docs/PRODUCT_SPEC.md` (entities, journeys A–I as named acceptance tests,
wireframes, component map, requirement → route mapping, decision log).

## Phase table
| Phase | Status | Commit | Evidence (commands / results) | Open questions / external setup |
|---|---|---|---|---|
| 00 Operating rules | PASS | (this commit) | Toolchain verified: Node 22.22.0, npm 10.9.4, Docker 29 daemon, local Supabase stack started from `ghcr.io` images (Postgres 17, GoTrue, PostgREST, Mailpit). Package versions checked on npm registry 2026-10-27. ADRs in `docs/ARCHITECTURE_DECISIONS.md`. | Hosted Supabase project, Vercel project, domain, Twilio are owner accounts → EXTERNAL SETUP |
| 01 Product + UX | NOT STARTED | | | |
| 02 App foundation | NOT STARTED | | | |
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
