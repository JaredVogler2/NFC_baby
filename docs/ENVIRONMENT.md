# Environment, privacy and external setup contract

## Secrets policy
The repository is PUBLIC. Do not commit actual phone numbers, children's names, health logs, consent screenshots, database exports, auth cookies, app keys, tokens, .env or detailed provider logs. Use an ignored local .env.local and Vercel project Environment Variables; use encrypted/restricted DB rows for contact preferences. Real adult recipient numbers were supplied in private chat—enter them privately at deployment and never copy them into public source.

## Proposed environment variable template (example placeholders only)
~~~dotenv
# Public client configuration — public Supabase key is not a bypass of RLS
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=PUBLIC_ANON_OR_PUBLISHABLE_KEY

# Server-side only, if privileged operations are truly necessary
SUPABASE_SERVICE_ROLE_KEY=SERVER_ONLY_NEVER_IN_BROWSER

# Canonical deployed HTTPS origin
APP_URL=https://your-production-domain.example

# Messaging modes: off (default) or twilio, behind consent/config checks
SMS_PROVIDER=off
TWILIO_ACCOUNT_SID=SERVER_ONLY_PLACEHOLDER
TWILIO_AUTH_TOKEN=SERVER_ONLY_PLACEHOLDER
TWILIO_MESSAGING_SERVICE_SID=SERVER_ONLY_PLACEHOLDER
TWILIO_WEBHOOK_SECRET=SERVER_ONLY_PLACEHOLDER_IF_NEEDED

# If using secured retry cron on plan that supports desired cadence
CRON_SECRET=SERVER_ONLY_RANDOM_VALUE

# If using encrypted phone fields, document rotation and server-key storage
CONTACT_ENCRYPTION_KEY=SERVER_ONLY_ROTATABLE_KEY
~~~

These names are recommended starting points, not evidence that an integration is already connected. Agent must finalize/verify exact env schema and document which are truly required vs optional. Avoid two contradictory sources of truth for recipients. Preferred recipient storage: encrypted/restricted DB preferences entered by each adult or approved owner setup. If a private server-side bootstrap script is used to enroll existing numbers, make it one-time and do not embed literal values in the script/repo.

## Authentication / DB
- Create a Supabase project and configure e-mail sign-in/invite-only membership, redirect URLs for preview and production.
- Apply checked SQL migrations and RLS, verify with separate household test users and an actual unauthorized JWT.
- Service role key only server-side, do not expose as NEXT_PUBLIC_. Ensure privileged route handlers still validate family authorization.
- Supabase publishable key is not a secret; row-level access enforcement is mandatory.
- App should not save event payloads to third-party analytics, Vercel log entries, link previews, query strings or exception traces.

## Notification provider
- Default SMS_PROVIDER=off so first deployment works without a Twilio account.
- If automatic messaging is requested, register/verify sending path and opted-in recipients with provider; store server-side credentials; test both separately after confirmation.
- Do not use a trial limitation or unauthenticated public webhook as excuse to silently skip delivery.
- Document provider-specific webhook validation and retry job plan. On Hobby Vercel cron scheduling, do not assume per-minute background work; confirm limits on the deployment plan.
- Provide an owner-only test send and status dashboard, with masked recipient phones.

## Vercel / deployment
- Public app routes (login, /t/opaque) may be reachable from browser but **all family data is protected by auth and RLS**.
- Configure Vercel Git integration, env on Production/Preview scopes, build command, Node runtime support and proper region as necessary.
- Avoid exposing preview deployment to unauthenticated child data. Set safe redirect allowlist and cache controls.
- Confirm app can recover from expired cookies and mobile Safari auth storage behavior.
- Keep production URLs stable: changing APP_URL requires rewriting physical tags unless a controlled redirect is maintained.

## Go-live checklist
- [ ] App builds and logs into real DB without mock persistence
- [ ] Two authorized users invited, unique sign-ins tested
- [ ] Four physical tags programmed with production HTTPS URLs
- [ ] Scan alone cannot save; save and undo each type works
- [ ] Phone numbers only in privileged settings, consent recorded
- [ ] Test requested notification mode on both real phones
- [ ] Verify no secrets/phones leaked in Git, frontend bundle, logs
- [ ] Data export, support/recovery instructions ready

## As implemented in this repository
The final variable list is validated in `lib/env/server.ts` and `lib/env/public.ts`; the per-scope
table (Production vs Preview, which are Sensitive) is in `docs/DEPLOYMENT.md` §2.

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Without them every page shows "Setup needed". Built into the page code: redeploy after changing. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | First-owner setup, invites, text dispatch. Server only. |
| `APP_URL` | yes in production | Exact HTTPS origin written onto stickers and into emails/texts. |
| `BOOTSTRAP_OWNER_EMAIL` | for first setup | The only address that may create the family (once). |
| `CONTACT_ENCRYPTION_KEY` | before any phone number is saved | 32 random bytes, base64. AES-256-GCM for numbers + HMAC lookup. |
| `CRON_SECRET` | for the daily text retry | ≥ 32 characters; dispatcher returns 404 when unset. |
| `SMS_PROVIDER` | no (default `off`) | `twilio` only after DEPLOYMENT §4. `mock` is for tests and refuses to run on Vercel. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` | only for automatic texts | The auth token also verifies Twilio's webhook signatures, so no separate `TWILIO_WEBHOOK_SECRET` is used. |
