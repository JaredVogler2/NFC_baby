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
