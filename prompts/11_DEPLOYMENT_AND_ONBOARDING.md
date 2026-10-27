# 11 — Deploy on Vercel, configure private services, program the four stickers

## Goal
A complete deployable product with clear caregiver-grade instructions for two parents, without leaking private numbers or producing fake deployment success.

## Environment and infrastructure
1. Create or link Vercel project from GitHub repo; ensure correct production branch and server runtime; choose suitable region close to users and DB. Use Vercel Preview for safe tests, Production for live family use.
2. Set Supabase project/DB/Auth and migrations, RLS; configure Vercel environment variables by Production/Preview scope. No secrets to NEXT_PUBLIC_ except a truly public Supabase publishable/anon key (protected by RLS). Do not expose service_role secret. See docs/ENVIRONMENT.md.
3. Configure canonical APP_URL HTTPS, auth callback redirect allowlist and trusted domains; test returning from /t/:id through login.
4. Set family timezone America/New_York initially, configurable; create family and child privately through admin flow, not seed real details in repo.
5. Invite Mom and Dad by separate accounts; verify each on their own iPhone.
6. Configure private parent SMS destination numbers (provided by owner privately, not copied into repo). Record each adult's consent and preferences; mask in UI. Automatic provider mode remains disabled until validated.
7. Configure Twilio/other provider credentials server side ONLY if opted in and registration/compliance complete. Test sending to BOTH consenting recipients from provider with two separate sends; record status without sharing number in test output.
8. Install or verify HTTPS, secure cookies, content-security/privacy headers, no public admin endpoints, build health probe and simple errors.
9. Set proper app icon, metadata, favicon, robots noindex (if appropriate) without relying on indexing controls for security.

## NFC setup checklist
- Purchase four or more compatible NDEF tags (NTAG213/215 are ample for short URL), preferably printable/sticky and out of child reach. Add ferrite-backed anti-metal tags for metal placement.
- In Settings > NFC Tags create WET, POOP, BOTH, FEED for correct child; name e.g. 'Changing Table Wet', 'Changing Table Poop', 'Changing Table Both', 'Bottle Station Feed'. Copy generated HTTPS link.
- Use an NFC-writing utility on iPhone with appropriate support (such as NFC Tools) to write a single NDEF URL record containing the complete URL. Read back and verify. Optionally lock the tag AFTER successful tests; a locked tag can't be reprogrammed, but revocation remains available in web admin.
- Print separate labels or QR fallback for each action; apply where the phone can reach but baby/toddler cannot peel or swallow. Don't attach close to metal unless using suitable anti-metal tag.
- With logged-in Parent A: scan all four tags on actual phone, follow NFC banner/link, verify correct page, deliberately save synthetic practice event, confirm timeline. Void practice events and confirm audit.
- Parent B: repeat using same tags, check both accounts show real shared history, and log/undo test. Test sign-in when signed out and an accidental scan without saving.
- With each parent, verify intended notification channel including composer user confirmation or actual compliant provider delivery if enabled.
- Build a short one-page parent instruction: 'Tap phone near sticker → open notification → check type/time/amount → Save → green Saved state; any text status shown separately; Undo/Edit if mistake.'
- Test 'Open tag URL' from QR if NFC is flaky.

## Production release checklist
- Both accounts work, RLS and authorization tested, migrations applied, startup works on fresh deploy.
- All core tag screens and safe POST idempotency pass; production no demo/mock persistence.
- Production HTTPS URLs are exactly what are written on tags; no preview/dev URLs accidentally programmed.
- Provider mode either OFF with documented compose path or ON with verified consent and documented real delivery evidence. Do not imply config-only provider integration means texts arrive.
- Vercel log inspection confirms no phones/notes/infant identifiers or credentials included.
- Backup/export and owner recovery paths documented and tested; basic alerting on error/notification queue backlog without sensitive data.
- Publish README usage, docs/ONBOARDING.md, docs/TROUBLESHOOTING.md, env instructions, install instructions, service architecture.
- Mark any steps needing account owner input as blocked rather than inventing successful setup.

## Exit evidence
- Link to actual Vercel live site IF deployed, commit sha, last migration, screenshots of safe synthetic views if useful, test commands and output, real iPhone tag check results, manual action needed.
- Commit evidence, proceed phase 12.