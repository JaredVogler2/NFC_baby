# Messaging Mom + Dad — real capabilities and safe implementations

**Goal:** a baby-care entry notifies both consenting adult parents as easily as possible, with honest labels and without publishing phone numbers or misleading users about delivery.

## Decision table
| Channel | Setup | Can reach both? | What a 'success' means | Constraints |
|---|---|---|---|---|
| Shared app timeline | Built-in, no extra vendor | Yes, both authorized phones | Event is in secure database, visible on reload/revalidation | Must open/check app |
| iPhone share/copied text | No paid provider | Yes if user selects both recipients | Draft was offered/copied, NOT sent | Requires user's Messages send action |
| iPhone Shortcuts 'Send Message' | Setup on every iPhone | Supports chosen contacts, subject to verified iOS behavior | Shortcut action ran; app cannot independently confirm carrier delivery | User permission, device limitations, no silent web SMS |
| Server-managed SMS (e.g. Twilio) | Sender/provider, compliance and consent | Yes: two individual sends | Provider accepts/returns status; delivery may differ per recipient | Costs, registration, privacy, retries, opt-out |

## Option 1 — No-cost baseline: share to both
After SAVE succeeds, app builds short privacy-conscious message, e.g.
'Baby update: Wet + poop diaper at 9:03 PM (logged by Dad).'
- Primary button: 'Share update with Mom & Dad'. Use navigator.share({text: message}) only from a real user gesture and only when browser supports it.
- User picks Messages and BOTH named contacts, reviews and taps Send. App never assumes it sent.
- Backup buttons: 'Copy update' and 'Open Messages' (sms: scheme opens Messages but documented API does not guarantee arbitrary body text or a multi-recipient group from Safari).
- If desired, user can first open a persistent group message in iOS Messages with both parents and paste the copied update.
- Do not claim native Web Share programmatically preselects recipients; it does not.

## Option 2 — Better iPhone handoff: one-tap run preinstalled Shortcut
Apple officially documents URL scheme:
  shortcuts://run-shortcut?name=NFC%20Baby%20Notify&input=text&text=URL_ENCODED_MESSAGE

The website can offer a user-clicked 'Run NFC Baby Notify' action with dynamically URL-encoded concise message only **after event save**, if the family manually installed a Shortcut named 'NFC Baby Notify' on that phone.
Suggested Shortcut builder sequence:
1. Create new shortcut on EACH parent's iPhone, name exactly 'NFC Baby Notify'.
2. Accept text from the Shortcut Input; include a fallback 'Ask for Input' only when input absent.
3. Action 'Send Message' with the received text. Configure BOTH parents as recipients (choose contacts privately in Shortcuts, do not embed numbers in public app code). Check whether your tested iOS version produces desired single group conversation or separate sends.
4. Prefer showing compose/confirmation while evaluating. If allowing automatic action execution on the phone, confirm system permissions and that both recipients agreed; verify no unintended duplicate sends when returning from browser.
5. Test with explicit one-time synthetic text on both actual devices; verify both recipients received it before describing this as reliable in product help.
6. Web app button opens above URL on user action; if Shortcut absent/blocked, fallback to native share or copy. Never automatically launch on page load.
7. The web app can say 'Opened Shortcut' or 'Handed off to device', NOT 'Delivered to Mom and Dad' because it cannot attest device-level delivery.
8. Consider passing an authenticated event permalink rather than private details if needed for privacy; never pass credentials or secrets via deep link.
9. The phone's system may require permission confirmation or user Send taps; do not promise entirely hands-free texting on every iOS version.

Official Apple documentation: https://support.apple.com/en-au/guide/shortcuts/apd624386f42/ios
Shortcuts 'Send Message' action background: https://support.apple.com/en-euro/guide/shortcuts/-apdf22b0444c/ios

## Option 3 — Automatic delivery from Vercel: two recipient SMS jobs
- In an owner-only Settings flow, collect each adult's phone number privately (E.164) and opt-in/confirmation. Store restricted/encrypted at rest where feasible, NOT in Git, NFC URL, frontend HTML/JS or logs. The owner has the initial phone numbers privately, but should input them through production setup, NOT append them to README.
- Configure provider server credentials only through Vercel secret environment variables.
- For U.S. long-code application texting, Twilio requires A2P 10DLC registration even for hobbyists; confirm costs, campaign/use-case and consent. Other routes (e.g. toll-free) have their own rules and registration verification.
- App sends two separate provider requests for an event, one to Mom and one to Dad. This is NOT necessarily an iMessage group chat. They each get an independent delivery attempt and status.
- Each recipient controls OFF/ON, categories, quiet hours and STOP opt-out. Unconsented destinations must never be contacted.
- Each logical event-target-send has durable unique key, transactionally inserted on event save. Dispatch after commit, retries with lease and backoff, and never retry blindly after ambiguous provider accept. Correction to event does not retract old SMS.
- Sample status to display: Event SAVED ✓ / Mom provider QUEUED / Dad provider FAILED, with clear retry or status instructions.
- Provider trial/sandbox may prohibit unverified recipients; do not claim end-to-end success on a fake trial number.
- Test messages only after informed consent and explicit admin tap, not automatic when setting env values.

Compliance reference: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc
Policy/consent: https://www.twilio.com/en-us/legal/messaging-policy
Apple SMS URL scheme: https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/SMSLinks/SMSLinks.html

## Recommended defaults
- Make logging usable with no SMS provider.
- Both parents see shared events through app immediately.
- COMPOSE/SHORTCUT is the quickest no-subscription path for text updates.
- For effortless **automatic** text after every save on either device, enable server-side provider only after compliance and adult opt-in are complete.
- Allow preference by type. Many parents may want every feeding event but fewer diaper texts; do not assume.
- Never turn a notification failure into a failed care log, and never label 'draft' as 'sent'.

## Scenario acceptance
| Scenario | Expected |
|---|---|
| Wet saved, compose selected | Event persisted, short message offered, user can send to both; app does not claim delivery |
| Feed 3.5 oz saved, provider on and both opted in | Two independent unique provider jobs with per-parent states |
| One parent opts out | No future provider attempt to opted-out number |
| Scan/refresh only | Zero events and zero texts |
| Save POST retried after timeout | One event and one intended provider job per opted-in parent |
| One recipient provider fails | Event saved; other recipient independent; exact state displayed |
| Parent voids already texted event | History corrected; old SMS not recalled, UI warns |
| Missing provider credentials | Provider disabled/clear error; in-app and compose continue to work |

---

## Implementation in this repository (phase 08)

### Where it lives
| Piece | Location |
|---|---|
| Family mode OFF / COMPOSE / AUTOMATIC (owner) | Settings → Texts & notifications · `POST /api/v1/notifications/mode` |
| Own number, consent, SMS verification code, categories, quiet hours, stop | same screen · `/api/v1/notifications/contact*`, `/preferences` |
| Share / Copy / Open Messages / Run Shortcut after saving | `components/notifications/ShareActions.tsx` |
| Message text (no child name, no notes) | `lib/notifications/template.ts` |
| Outbox rows (created in the same transaction as the entry) | `log_care_event` → `_enqueue_notifications` (migration 0003) |
| Dispatcher (lease, retries, staleness, UNKNOWN) | `lib/notifications/dispatch.ts`, SQL in migration 0005 |
| Provider adapters | `lib/notifications/providers/` — `off` (default), `mock` (tests; refuses on Vercel), `twilio` (REST, no SDK) |
| Webhooks (signature-verified) | `/api/v1/notifications/twilio/status`, `/api/v1/notifications/twilio/inbound` |
| Retry endpoint for a scheduler | `GET/POST /api/v1/notifications/dispatch` with `Authorization: Bearer $CRON_SECRET` |

### Who gets an automatic text
All must be true at the moment an entry is saved: family mode is AUTOMATIC; the recipient is an
active **owner or parent** (never caregivers/viewers); they saved a number, ticked the consent text
(versioned, stored with the timestamp) and entered the code texted to that number; they have not
stopped texts (in the app or by replying STOP); the entry's kind is in their categories; and it's
not their quiet hours (then the row is recorded as "not texted — quiet hours" and is never sent
later). One logical text per entry per recipient (`unique(event_id, user_id, channel, revision)`).

### What the states mean (shown per parent on the saved screen and entry details)
| State | Meaning |
|---|---|
| queued | waiting to be handed to the provider (normally < 2 s) |
| sent to the text provider | the provider accepted it — **not** proof of delivery |
| delivered | the carrier reported delivery (Twilio status callback) |
| not sent yet — will retry | provider temporarily refused (rate limit / 503); retried at 30 s, 2 min, 10 min (+jitter), max 4 tries |
| not sent — failed | permanent refusal (invalid number, carrier failure, too many tries) |
| unknown | we sent the request but never got an answer (timeout). **Never resent automatically** — avoids double texts |
| not texted — quiet hours / too many texts this hour | suppressed by preference / 20-per-hour safety ceiling |
| not sent — entry was undone first / too late to be useful | canceled before sending (void, or > 30 min old — so enabling automatic mode can never send a backlog) |

### Owner setup for automatic texts (EXTERNAL SETUP — not done by the build)
1. Twilio account → buy a US number → create a **Messaging Service** containing it.
2. Register for **A2P 10DLC** (Brand + "Low volume mixed" or similar campaign) — required for US
   long-code application texting even for a family. Describe it honestly: "Family baby-care
   updates to 2 opted-in parents; opt-in by entering a code texted to their number in the app;
   STOP/HELP supported." Wait for approval. (Toll-free verification is the alternative route.)
3. In the Messaging Service, keep **Advanced Opt-Out** on (handles STOP/HELP replies) and set the
   **incoming message webhook** to `https://YOUR_DOMAIN/api/v1/notifications/twilio/inbound`.
   Status callbacks are requested per message automatically when `APP_URL` is HTTPS.
4. Vercel → Environment Variables (Production only): `SMS_PROVIDER=twilio`,
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`,
   `CONTACT_ENCRYPTION_KEY` (32 random bytes, base64), `APP_URL`. Redeploy.
5. Owner: Settings → Texts & notifications → Automatic texts. Each parent, **on their own phone**:
   add number → read and tick the consent text → "Text me a verification code" → enter it.
6. Owner: "Send test text…" to each verified parent (one message, confirmed). Ask each parent
   whether it arrived. Only after both confirm real receipt may anyone say automatic texting works.
7. Optional: point any scheduler at `/api/v1/notifications/dispatch` with the bearer secret every
   few minutes to retry temporarily-failed texts promptly. Without it, retries happen whenever
   someone saves an entry or opens Home. (Vercel Hobby cron runs at most once a day; not relied on.)

### Option 2 setup — "NFC Baby Notify" Shortcut (per iPhone, NEEDS HUMAN DEVICE testing)
1. Shortcuts app → **+** → name it exactly **NFC Baby Notify**.
2. Add action **Send Message**. Tap *Message* → choose **Shortcut Input**. Tap *Recipients* → pick
   both parents from Contacts (numbers stay on the phone; the app never sees them).
3. Shortcut settings (ⓘ) → enable **Receive "Text" input**; optionally turn off "Show When Run"
   only after you have tested it.
4. In NFC Baby: Settings → This phone → tick "I installed the NFC Baby Notify Shortcut".
5. Save an entry → **Run "NFC Baby Notify"**. iOS asks for permission the first time. Messages
   either shows a draft or sends, depending on the action's "Show compose sheet" setting and the
   iOS version. Check both recipients received it before relying on it.
The app only opens `shortcuts://run-shortcut?name=NFC%20Baby%20Notify&input=text&text=…` from your
tap; it never runs it on page load and never reports it as delivered.

### Verified here vs. still to verify
- ✔ Automated (mock provider + real Postgres): two separate texts, opt-out, STOP webhook, signed
  status callback, one-recipient failure isolation, unknown-not-resent, retries/backoff, void/stale
  cancellation, no backlog on enabling, concurrent dispatchers, no plaintext numbers, compose draft.
- ✖ NOT verified: any real Twilio send, carrier delivery, A2P approval, iOS Share sheet, Messages
  `sms:` behaviour on a real iPhone, the Shortcut. These are EXTERNAL SETUP / NEEDS HUMAN DEVICE.
