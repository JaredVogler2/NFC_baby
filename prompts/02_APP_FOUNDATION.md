# 02 — Next.js / Vercel application scaffold and clean architecture

## Goal
Build a production-grade, dependency-light app skeleton that deploys cleanly to Vercel, not just a static mock. Type-safe routes, mobile design foundation, protected/public boundary and reusable components.

## Suggested stack (confirm package-current APIs)
- Next.js current stable App Router, TypeScript strict, React compatible stable, Node runtime for server functions, Vercel.
- Tailwind CSS + accessible base components with restrained, thoughtfully designed styling. Prefer shadcn/ui primitives only when they add accessibility; avoid dependency explosions.
- Zod for runtime input schemas; React Hook Form optional; TanStack Query or lightweight react hooks for data caching if truly necessary.
- Supabase Postgres + Auth and Row Level Security, with @supabase/ssr where package supports chosen Next.js version. Confirm APIs and SSR cookie strategy from docs.
- Vitest for unit tests, Testing Library for UI, Playwright for E2E; lint + prettier + CI.
- No SMS SDK initialized client-side; providers are server-only, behind interfaces.
- App must work in browser without a Service Worker at first; phase 09 adds resilience.

## Repository structure proposal
- app/(public)/login, app/(app)/dashboard, app/(app)/timeline, app/(app)/settings
- app/t/[tagId] for tag landing with authenticated resolution; do not leak baby details on public request
- app/api/v1/events, app/api/v1/tags, app/api/v1/notifications for secured route handlers
- components/ui, components/logging, components/layout, lib/auth, lib/db, lib/domain, lib/notifications, lib/nfc, lib/time
- supabase/migrations + optional verified seed/example script
- tests/unit, tests/integration, tests/e2e, tests/fixtures
- public/icons and PWA-ready assets

## Implementation requirements
1. Initialize package.json scripts: dev, build, start, lint, typecheck, test, test:e2e, format:check and optional db validation.
2. Establish environment example with dummy placeholders (never live phone data, no keys).
3. Build actual app shell: responsive header, bottom navigation Dashboard/History/Settings, loading and empty states, error boundaries, 404 page.
4. Add purposeful design tokens: surfaces, typography, safe-area, event colors, spacing, tap sizes, night/dark theme; do not depend on remote proprietary fonts.
5. Set cache rules: no cache for authenticated person-specific API and views, no static leakage, no revalidation of private data into shared cache; safe security headers; avoid security-through-obscurity.
6. Set up robust error translation: validation errors, 401, 403, 404, 409 idempotency replay, 429, 5xx; no internal details leak to users.
7. All event forms share typed field primitives and action states IDLE → SAVING → SAVED / RETRYABLE_ERROR.
8. Provide a demo/mock mode for visual verification **only if clearly labeled** and impossible to confuse with real backend persistence or actual SMS.
9. Create CI GitHub Actions to install dependencies, lint, typecheck, unit test and production build on PR/push with locked dependency versions.
10. Add baseline security dependencies and no client telemetry by default. Instrument safe operational metrics without user message content or child identity.

## Safety and architecture decisions
- Store the current signed-in user's membership on the server; never trust household id, baby id, or tag intent supplied solely by client.
- Tag IDs are opaque identifiers; GET only resolves/loads form and never writes. POST only for mutations.
- Use normalized server-side event inputs; don't ask iOS to directly call admin/service-role secrets.
- Plan for idempotent create with request key persisted transactionally.
- Implement a generalized NotificationAdapter but leave real delivery off until phase 08.
- Keep all time handling centralized: UTC storage, browser locale display but family-configured IANA zone for consistent history.
- Prepare graceful redirect to requested tag after sign in, allowlisted internal redirects only.

## Exit criteria
- Fresh checkout installs with lockfile and passes lint/typecheck/test/build.
- Vercel-targeted preview deployment can render login and mobile shell when deployment available.
- App routes are organized and protected as intended (even if full database logic arrives in phase 03).
- Visual review at mobile viewport, keyboard and VoiceOver landmarks; no horizontal overflow.
- BUILD_STATUS updated; commit. Proceed to phase 03.