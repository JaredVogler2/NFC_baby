# Troubleshooting

Each entry gives the symptom, the likely cause, and the fix. No fix here needs a phone number,
note or child name pasted anywhere.

## Scanning

| Symptom | Likely cause | Fix |
|---|---|---|
| Nothing happens when tapping a sticker | Phone locked or screen off; wrong spot; on metal; old iPhone | Unlock, hold the **top edge** to the sticker for 1–2 s. Background NFC needs iPhone XS or newer. Use an on-metal sticker near metal. Use the QR code meanwhile. |
| A banner appears but opens the wrong page | Sticker holds another URL (preview/dev or a typo) | Read the sticker in the writer app and compare with Settings → NFC stickers → that sticker's link. Rewrite it if needed. |
| "Not available" after scanning | The sticker belongs to another family, or the link is mistyped | Check the link. Members of another family deliberately get this generic page. |
| "Sticker retired" | It was retired in Settings | Create a new sticker and write its link. Retired stickers never work again. |
| "Sign in to continue" every time | Signed in to the Home Screen app but not Safari (or the other way round) | Stickers open in Safari; sign in there too. iOS keeps them separate. |
| "View only" | Your role is Viewer | The owner can change your role in Members & invites. |

## Saving

| Symptom | Meaning | What to do |
|---|---|---|
| Green **Saved** screen | The server stored it and everyone sees it | Nothing. |
| **Can't confirm the save yet** | The connection dropped mid-save; it may or may not have arrived | Tap **Check again**. It asks using the same request id and never makes a duplicate. No signal? **Keep as pending on this phone**. |
| **You're offline — not saved** | Nothing was sent | **Try again** with signal, or **Keep as pending on this phone**. |
| **Pending on this phone** on Home | Kept entries waiting to sync; not shared, no text sent | Open Home with signal; they sync automatically (or tap **Sync now**). If the time is more than a day ago, confirm it. |
| **That's more than a day ago** | Backdated over 24 h | Tap **Yes, that time is right** if it is. |
| **Someone else changed this entry** | The other parent edited it first | Reload, check, and edit again if still needed. Nothing was overwritten. |
| **Sign in again to save** | Session expired | Tap **Sign in**. Your entry is kept and comes back after signing in. |
| A duplicate appears | Two deliberate saves (e.g. both parents logged the same diaper) | Open the extra one → **Undo this entry**. A single Save can't create two. |

## Sign-in emails

| Symptom | Likely cause | Fix |
|---|---|---|
| No email arrives | Supabase's built-in sender is rate-limited, or the email went to spam | Set up custom SMTP (DEPLOYMENT §1.6). Check spam. Wait 60 s before asking again. |
| "Too many requests" | The per-address resend limit | Wait a minute. |
| Code rejected | Expired, already used, or an older email's code | Use the newest email's code. Codes expire (15–60 min, per Supabase setting). |
| Email link says "tap to finish" | By design: link scanners in mail apps can't use it up | Tap **Finish signing in**, or type the code. |
| Link opens an error page | Supabase **Site URL** isn't the production URL | Supabase → Authentication → URL Configuration → Site URL = `APP_URL`. |
| "No family access yet" | That email isn't a member, or was deactivated | Owner: invite it (Members & invites), or reactivate the member. |
| Can't create the family | Not the `BOOTSTRAP_OWNER_EMAIL`, or a family already exists | Use the configured address. A second family can't be created, by design. |

## Texts

| Symptom | Meaning | Fix |
|---|---|---|
| Saved screen says "Texts are off" | Mode is **Off** (the default) | Choose a mode in Settings → Texts & notifications. |
| **Share a draft** never says sent | By design: you send it yourself from Messages | Tap **Copy** or **Open Messages**. |
| Automatic texts shows "Unavailable: …" | `SMS_PROVIDER` isn't `twilio`, Twilio variables are missing, or `CONTACT_ENCRYPTION_KEY` isn't set (the reason is shown) | See DEPLOYMENT §4, then redeploy. |
| Parent shows "not verified yet" | Number not verified or consent not given | That parent re-enters their own number and types the code. |
| "sent to the text provider (delivery not yet confirmed)" but nothing arrived | Twilio accepted it; the carrier may filter unregistered traffic | Check A2P 10DLC campaign status and the Twilio message log. Delivered status appears when Twilio reports it. |
| "unknown — the provider did not confirm" | The provider timed out after possibly sending | Not re-sent automatically, to avoid doubles. Check with the other parent. |
| "texts stopped" for a parent | They replied STOP (or the carrier reported unsubscribed) | If they want texts again: reply START to the family's text number (lifts the carrier block), then re-enter and re-verify their number in Settings. |
| Undoing an entry after a text was sent | Texts can't be recalled | The app says so; tell the other parent if it matters. |

## Deployment

| Symptom | Likely cause | Fix |
|---|---|---|
| "Setup needed" page | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` missing in this environment | Add them for Production, then **redeploy**. They're built into the page code. |
| Invites/first owner fail with a server error | `SUPABASE_SERVICE_ROLE_KEY` missing or wrong | Add the secret key (server-only), redeploy. |
| Sticker links use the wrong domain | `APP_URL` unset or wrong | Set `APP_URL` to the production origin. Already-written stickers keep their old URL; rewrite them. |
| `verify-deployment.mjs` FAIL on HTTPS/HSTS | Testing an `http://` URL or a custom proxy | Use the `https://` production URL. |
| Cron failures in Vercel | `CRON_SECRET` missing (the dispatcher answers 404 when unset) | Set `CRON_SECRET`, redeploy. Optional unless automatic texts are on. |
| Preview deployment shows family data | Preview env vars point at production Supabase | Remove them from Preview, or use a separate staging project. |

## Getting help without leaking data

When asking for help, share the **error text** and the route (e.g. `POST /api/v1/events 409`).
Don't share screenshots that show names, notes, phone numbers or sticker links. Vercel logs
contain only route, status and timing, so they are safe to look at.
