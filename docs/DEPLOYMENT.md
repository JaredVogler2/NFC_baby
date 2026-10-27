# Deploying NFC Baby (Vercel + Supabase)

Everything here needs the **owner's own accounts**. Nothing in this repository contains real
keys, phone numbers or family data, and nothing below should be copied back into it.

Time needed: about 45 minutes, plus SMTP sign-up. Automatic texts are optional and come last.

```
iPhone (Safari / Home Screen app)
   │ HTTPS
   ▼
Vercel (Next.js 16, region iad1, Washington DC)   ── daily cron → /api/v1/notifications/dispatch
   │  server-side only: service-role key, contact encryption key, Twilio
   ▼
Supabase (Postgres + Auth + Data API, region us-east-1)   — RLS on every table
   │  optional
   ▼
Twilio Messaging Service (SMS)   — only after A2P registration and each parent's consent
```

## 1. Supabase project (database + sign-in)

1. Create a project at <https://supabase.com/dashboard> → **New project**.
   - Region: **East US (North Virginia)** (`us-east-1`), next to Vercel `iad1`.
   - Save the database password in your password manager.
2. Apply the database (from a computer with this repo checked out and Node 22):
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push            # applies supabase/migrations/* in order
   npx supabase db lint --linked --level warning   # expect: no warnings
   ```
3. **Authentication → Sign In / Providers**
   - **Allow new users to sign up: OFF.** Members are created only by the first-owner setup and
     by invites, never by strangers.
   - **Email** provider: **enabled**. Keep it enabled, or sign-in codes can't be sent.
   - Email OTP length **6**; expiry **900–3600 s**.
4. **Authentication → URL Configuration**
   - **Site URL**: your production URL exactly, e.g. `https://nfc-baby.vercel.app`. The email link
     is built from it.
   - **Redirect URLs**: add `https://<your-domain>/**`.
5. **Authentication → Emails → Templates**: paste `supabase/templates/magic_link.html` into **both**
   "Magic Link" and "Confirm signup". Use the subject `Your NFC Baby sign-in code`. The template
   shows the 6-digit code, which works in the Home Screen app, and a link to `/auth/confirm` that
   needs a tap, so email scanners can't use it up.
6. **Authentication → Emails → SMTP Settings**: set up a custom SMTP provider (for example Resend,
   Postmark or Amazon SES). Supabase's built-in sender only sends a few emails per hour and is
   meant for testing. **This is required for real use.**
7. **Project Settings → API keys**: copy the **Project URL**, the **publishable/anon** key and the
   **secret/service_role** key. The secret key goes only into Vercel's server-side variables
   (step 2.3), never into a `NEXT_PUBLIC_` variable.
8. **Project Settings → Data API**: make sure the `public` schema is exposed (it is by default).
   RLS protects every table; browsers can only read their own family's rows.

## 2. Vercel project (the website)

1. Vercel → **Add New → Project** → import `JaredVogler2/NFC_baby`. Framework: Next.js. Keep the
   default build command (`npm run build`) and output settings. Production branch: `main`.
   `vercel.json` already sets the function region (`iad1`) and a once-a-day retry run for texts.
2. Pick the production domain now. **The URLs written onto the stickers include it**, so changing
   it later means re-programming the stickers. A custom domain or `nfc-baby.vercel.app` both work.
3. **Settings → Environment Variables** (mark the secret ones as *Sensitive*):

   | Name | Production | Preview | Notes |
   |---|---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL | *(leave unset)* | Public. Preview without it shows "Setup needed". |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable/anon key | *(unset)* | Public; RLS protects data. |
   | `SUPABASE_SERVICE_ROLE_KEY` | secret key | *(unset)* | **Sensitive.** Server only. |
   | `APP_URL` | `https://<your-domain>` | *(unset)* | Exact origin used in sticker links and emails. |
   | `BOOTSTRAP_OWNER_EMAIL` | your email | *(unset)* | Only this address can create the family, once. |
   | `CONTACT_ENCRYPTION_KEY` | 32 random bytes, base64 | *(unset)* | **Sensitive.** Required before anyone saves a phone number. Keep a private backup copy. |
   | `CRON_SECRET` | 32+ random characters | *(unset)* | **Sensitive.** Protects the text dispatcher. Vercel Cron sends it automatically. |
   | `SMS_PROVIDER` | `off` | `off` | Change to `twilio` only after section 4. |

   Generate the two random values on your computer:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # CONTACT_ENCRYPTION_KEY
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # CRON_SECRET
   ```
   Keep previews away from the production database. Either leave the Supabase variables unset for
   Preview, or point them at a separate staging Supabase project. Keep Vercel **Deployment
   Protection** on for previews.
4. **Redeploy production** after setting the variables (Deployments → ⋯ → Redeploy).
   `NEXT_PUBLIC_*` values are built into the page code, so they only take effect on a new build.
5. Verify from your computer. The script is read-only and creates nothing:
   ```bash
   node scripts/verify-deployment.mjs https://<your-domain>
   ```
   Expect every line to read `PASS`: health, configured database, security headers, HSTS,
   HTTP→HTTPS redirect, the signed-out sticker gate, 401 for family APIs, cross-site writes refused,
   dispatcher not public, manifest/service worker/icons.

## 3. First sign-in and family setup

Follow `docs/ONBOARDING.md` → *Owner setup*. In short: sign in with `BOOTSTRAP_OWNER_EMAIL`, create
the family (time zone America/New_York) and the child's nickname, invite the other parent, create
the four stickers, then program and test them.

## 4. Optional: automatic texts (Twilio)

Do this only if both parents want automatic texts. The default (**Off**) and **Share a draft**
need nothing here. See `docs/SMS_OPTIONS.md` for the full decision.

1. Twilio account → buy a US number → create a **Messaging Service** with that number.
2. Complete **A2P 10DLC** registration (brand + campaign). US carriers block or filter
   unregistered application texts, so treat texts as not working until the campaign is approved.
3. Messaging Service → Integration → set the incoming-message webhook to
   `https://<your-domain>/api/v1/notifications/twilio/inbound`, so STOP and HELP replies are handled.
4. Vercel production variables: `TWILIO_ACCOUNT_SID` (`AC…`), `TWILIO_AUTH_TOKEN` (**Sensitive**),
   `TWILIO_MESSAGING_SERVICE_SID` (`MG…`), then set `SMS_PROVIDER=twilio`, and redeploy.
5. In the app, each parent goes to **Settings → Texts & notifications**, enters **their own** number, accepts the
   consent text, and types the code they receive. The owner then switches the family to
   **Automatic texts** and uses **Send test text** (at most 3 per hour) for each parent.
6. Confirm on **both phones** that each text arrived. Until then, the app only claims "sent to the
   text provider" or "delivered" when Twilio reports it, never more than that.

Hobby plan note: Vercel Cron runs once a day on Hobby. Texts are normally sent right after each
save; the daily run and every Home screen open retry anything that failed temporarily.

## 5. Go-live checklist (owner)

- [ ] `verify-deployment.mjs` all PASS against the production URL
- [ ] Owner and second parent can each sign in on their own iPhone (Safari tab, and Home Screen app if used)
- [ ] Four stickers programmed with the **production** URL (not a preview URL); each opens the right form
- [ ] A scan alone saves nothing; save → appears on the other parent's phone; undo works
- [ ] Notification mode chosen; if automatic, both parents verified + consented and both received the test text
- [ ] Vercel → Logs: search for a note you typed or a phone number. Expected: no matches (the app logs only route, status and timing)
- [ ] Export (Settings → Privacy & export) downloads CSV and JSON
- [ ] `CONTACT_ENCRYPTION_KEY` and the database password are stored in your password manager

## Backups, recovery and monitoring

- **Export**: Settings → Privacy & export (CSV/JSON) at any time. Owner/parent only.
- **Database backups**: Supabase daily backups on paid plans. On the free plan, export regularly
  or use `npx supabase db dump --linked -f backup.sql` (store privately, never in this repo).
- **Lost owner email access**: in Supabase → Authentication → Users, change the owner's email
  address. Their membership stays the same.
- **Contact key**: if `CONTACT_ENCRYPTION_KEY` is lost or changed, saved phone numbers can't be
  read. Each parent re-enters and re-verifies their number. Events are not affected.
- **Monitoring without family data**: Vercel → Observability shows error rates and latency per
  route. Text problems appear per parent on each entry and in Settings → Texts & notifications. Logs contain no
  notes, names or numbers by design (`lib/log.ts`).
- **Rollback**: Vercel → Deployments → promote the previous deployment. Database migrations only
  add things; don't roll back the database unless a migration says so.
