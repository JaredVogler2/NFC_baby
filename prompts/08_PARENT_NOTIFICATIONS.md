# 08 — Notify Mom and Dad: secure drafts, iPhone Shortcuts and optional automatic SMS

## User requirement
When a wet/poop/both/feed event is logged, notify **BOTH parents** with a short readable text, ideally automatically, otherwise provide one effortless draft/compose workflow. Recipient telephone numbers were supplied privately to the project owner; this public repository must NOT include the literal numbers. Configure them through a protected family settings flow or private server-only Vercel variables after each recipient expressly consents.

## Three real, honestly-labeled delivery modes
A. OFF / In-app only (baseline): save is always functional. Both signed-in parents see shared timeline promptly. Optional in-app unread marker.
B. COMPOSE / Send yourself (no SMS provider): after authenticated save, render a copyable message and a 'Share via Messages' primary action using the native share sheet where supported. Explicitly instruct the user to choose both parent recipients; provide 'Copy message' fallback and 'Open Messages' action. Never claim a web page can silently send iMessage/SMS. Optional user-installed iPhone Shortcut: accepts event message text + selected recipients, opens draft or uses Shortcuts 'Send Message' action with its system-level permissions; test real behavior on actual iOS versions and keep messages user-consented. Shortcut is configured on EACH phone; it is not shared just by sharing a tag.
C. AUTOMATIC SMS / Managed provider (opt-in, not default): server sends two individual outbound provider messages to the two verified consenting parent numbers after successful event save, with separate delivery states. Choose Twilio Programmable Messaging or equivalent server-side adapter. U.S. A2P 10DLC registration/verification and fees/consent may apply even for personal apps; do not attempt evasion. If using alternative toll-free route, validate that route's verification rules. Disable until compliant sending path exists.

## Important documented platform limitations
- Apple's published 'sms:' scheme officially documents opening Messages and a phone number, but DOES NOT promise filling the text body or reliably specifying a multi-recipient group message from a webpage. Avoid hacks relying on undocumented sms:?body= features as the only composer solution. Any experimental deep link must feature detect, offer copy/share fallback and be verified on iPhone.
- Safari has no standard API to silently send the user's personal iMessage; native iOS Shortcuts actions or an actual server-side SMS provider are distinct approaches.
- The provider mode delivers **separate SMS to each parent**, not necessarily a common group text thread. A group Messages conversation may instead be created manually or by a locally tested Shortcut.
- 'Queued' means queued, not carrier-delivered. Even provider 'sent' is not the same as final recipient delivery; expose trustworthy states.

## Sample message templates (do not embed real names or numbers)
- 'Baby update: Wet diaper at 2:14 AM (logged by Dad).'
- 'Baby update: Poop diaper at 8:40 AM (logged by Mom).'
- 'Baby update: Wet + poop at 9:02 PM (logged by Dad).'
- 'Baby update: Bottle, 3.5 oz breastmilk at 3:20 AM (logged by Mom).'
- 'Baby update: Nursing at 4:10 AM (logged by Mom).'
- Optional safe footer 'View history: <authenticated app link>'. Never place full notes, date of birth, health-sensitive text, phone numbers, unauthenticated links, or API tokens in SMS by default.
- Single consistent timezone. Event occurrence time (not submission time), show date as well if not same local day.
- Template notes included only if adult explicitly enables a warning/disclosure; default OFF for privacy.

## Notification architecture
- App event POST transaction creates care_event + two logical notification_outbox rows (only if target opted in, category enabled and mode automatic). For compose mode no provider outbox; store optional 'draft offered' telemetry without claiming delivery.
- Per-recipient route preferences with verified phone destination, enabled state, category mask, quiet hours, consent timestamp and opt-out. Address and preference storage is restricted.
- Enqueue with unique(event_id, recipient_id, channel, notification_revision); use idempotency and database transaction to avoid repeated sends when client retries.
- Outbox worker can be invoked by explicit server-side action after commit with a lease/claim and by a verified scheduled retry where plan permits. Vercel Hobby Cron has plan restrictions; do not implement impossible minute polling on Hobby. Use a robust strategy compatible with target plan: immediate protected dispatch + durable queue + externally supported retry/monitoring, or upgrade plan only if justified.
- Transaction state: PENDING → PROCESSING (lease) → SENT_TO_PROVIDER / FAILED_RETRYABLE / FAILED_PERMANENT / UNKNOWN; attempt counters, jittered backoff, provider code, separate message IDs; do not store message body in logs.
- If send times out after provider accepted request, do not blindly replay an SMS and risk duplicate; record ambiguous outcome and reconcile using provider identifiers/status where feasible.
- If an event is corrected/voided before send, update/cancel pending job; if after send, show 'Original text may already have been received.' Correction texts OFF by default, configurable later.
- Never send a notification for mere tag scans, preview, API GET, failed event save, browser refresh, or unauthenticated user.
- Rate limiting and household safety ceiling for unexpected bursts; do not spam parents on repeated corrections.
- Retryable provider failure must not hide a successful care event or claim text delivery.
- Mask recipients in UI. Expose a 'Send test SMS' explicit owner-only action only after verification/consent, with preview/confirmation and one-message safety count.
- Implement Twilio signature validation on inbound status callbacks and opt-out webhooks if subscribed; server-side only. Follow STOP/HELP behavior and recipient preferences. Avoid exposing provider tokens client-side.
- Privacy UI makes clear SMS travels through carrier and provider and is not an end-to-end encrypted iMessage.

## iPhone compose UX
- After success, visually split 'Activity saved' from 'Parent notification'.
- One large button: 'Share update with Mom & Dad'. Use Web Share API if available; fallback copy-to-clipboard + open Messages. Acknowledge that user must select/confirm recipients, with no false guarantee both received it.
- Provide shortcut instructions in docs with tested versions/steps and a working optional target action that can include multiple configured recipients where device allows; never silently substitute one recipient for two.
- Configurable personal preference for on-device draft vs provider SMS; avoid generating duplicates if provider already sending automatically.
- If group message requested, provide explicit compose-mode instructions for selecting both recipients in Messages. Do not claim the app can force Messages to send to two contacts on iPhone.

## Test matrix
- Both parents verified, opted-in → one event creates exactly 2 provider-target jobs, unique member targets and statuses.
- Parent A opted-out → only Parent B gets automatic message.
- Category disabled → no message.
- Quiet hours preference → suppress/defer/digest precisely as setting promises.
- Duplicate POST and retry → 1 event and at most 1 intended message per recipient, modulo ambiguous telecom provider delivery caveat.
- Real provider sandbox/mock tests: one recipient success and other failure clearly independent.
- Missing credentials, unregistered number, invalid recipient, rate limit, webhook fraud, revoked consent → fail safe.
- Draft mode → message copy/share works on iPhone Safari and message not shown as 'sent' in web app.
- Correction after sending → warns of already-sent original, no silent correction SMS.
- Test preview is not sent; 'Send test' requires confirmation and logs result.
- No phone numbers, baby name, notes, provider tokens in server logs, URL, telemetry, build, or public GitHub.
- Verify no accidental real SMS in CI or local tests, use mock provider.

## Release decision / deliverables
- In-app/off and composer path functional without provider account.
- Provider integration coded behind disabled-by-default flag, clearly documented human provisioning/consent and actual end-to-end test if credentials supplied.
- Precise state model in UI, docs/SMS_OPTIONS updated, test outputs, BUILD_STATUS committed.
- Never report 'automatic texting working' until compliant live send to BOTH parents is verified with consent. Proceed phase 09.