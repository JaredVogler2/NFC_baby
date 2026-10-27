# Local development and tests

## Prerequisites
Node.js 22+, npm, Docker (for the local Supabase stack), `psql` (PostgreSQL client).

## First run
```bash
npm ci
npm run db:start                 # local Supabase: Postgres, Auth, PostgREST, Mailpit
node scripts/write-local-env.mjs # writes .env.local (git-ignored) from `supabase status`
npm run dev                      # http://localhost:3000
```
Sign in as the bootstrap owner (`BOOTSTRAP_OWNER_EMAIL` in `.env.local`, default
`owner@example.test`). Emails (codes and links) are captured by Mailpit at
http://127.0.0.1:54324 — nothing is really sent.

Behind a registry that rate-limits Docker Hub/ECR, use GitHub's registry:
`SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io npm run db:start`.

## Test suites
| Command | What it runs | Needs |
|---|---|---|
| `npm run lint` / `npm run typecheck` / `npm run format:check` | static checks | — |
| `npm test` | unit + component tests (Vitest, jsdom) | — |
| `npm run test:integration` | RLS, SQL functions, idempotency, invites against the real local Supabase with real user JWTs | local Supabase + `.env.local` |
| `npm run build && npm run test:e2e` | Playwright on a production build (iPhone viewport, Chromium), real sign-in via Mailpit codes | local Supabase + `.env.local` |
| `npm run db:reset` | re-applies all migrations to an empty database | local Supabase |
| `npm run db:lint` | plpgsql_check over every SQL function; any warning fails | local Supabase |
| `npm run check:secrets` | scans git-tracked files and the browser build (`.next/static`) for keys, tokens, service-role JWTs, real-looking phone numbers and server-only env values | (build first for the bundle part) |

The E2E suite wipes local family data (`tests/e2e/support.ts → resetAll`). Never point
`.env.local` at a real project while running tests.

## Safety rails in tests
- `SMS_PROVIDER` is `off` or `mock` in every automated run; the mock adapter refuses to load on
  Vercel. No test can send a real SMS.
- Test data uses `@example.test` addresses and fake names only.
