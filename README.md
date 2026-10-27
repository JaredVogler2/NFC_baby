# NFC Baby — Tap-to-Log Family Tracker

A deliberately simple, mobile-first baby-care tracker activated by NFC stickers and hosted on Vercel. This repository begins with a **Claude Code Opus 5.5 build-specification and execution series**. The application is **not implemented yet**.

## Primary workflow
- Four purpose-specific NFC tags: **Wet Diaper**, **Poop Diaper**, **Both**, and **Feeding**.
- Scan → authenticated, event-specific mobile screen → confirm/save → immediate, clear result.
- Correct/undo mistakes; assign correct infant, event time, feed amount, and optional notes.
- Shared timeline and latest activity for two parents, with optional separate caregiver roles.
- Configurable notifications to Mom and Dad: in-app by default; optional iPhone compose/Shortcuts workflow; optional provider-backed automatic SMS to *each* opted-in number.
- No account registration for random tag scanners; no auto-saving a record solely because a URL was opened.

## Claude Code start here
Read [CLAUDE_GOAL.md](CLAUDE_GOAL.md), then [prompts/00_OPERATING_RULES.md](prompts/00_OPERATING_RULES.md). Execute prompts **01 through 13 strictly in order**, using the completion gates, tests, and evidence requirements in each. Run each phase as its own bounded task, commit meaningful increments, and resume from the current checklist if interrupted.

### Prompt sequence
| Phase | Prompt | Outcome |
|---|---|---|
| 00 | [Operating rules](prompts/00_OPERATING_RULES.md) | Safe execution and checkpoints |
| 01 | [Product + UX](prompts/01_PRODUCT_AND_UX.md) | User journeys, flows, design system |
| 02 | [Architecture](prompts/02_APP_FOUNDATION.md) | Next.js/Vercel app scaffold |
| 03 | [Data and security](prompts/03_DATA_AND_SECURITY.md) | Auth, RLS, schema, secure APIs |
| 04 | [NFC system](prompts/04_NFC_TAG_SYSTEM.md) | URL routing, tags, administration |
| 05 | [Diaper logging](prompts/05_DIAPER_WORKFLOWS.md) | Wet, poop, both rapid capture |
| 06 | [Feeding logging](prompts/06_FEEDING_WORKFLOWS.md) | Bottle, breastfeeding, timestamps, quantity |
| 07 | [Timeline](prompts/07_TIMELINE_AND_SETTINGS.md) | Family history, editing, settings |
| 08 | [Notifications](prompts/08_PARENT_NOTIFICATIONS.md) | SMS compose / optional provider sends |
| 09 | [PWA](prompts/09_PWA_OFFLINE_AND_ACCESSIBILITY.md) | iPhone usability, resilience |
| 10 | [Tests](prompts/10_TESTING_AND_SECURITY.md) | E2E, privacy, adversarial QA |
| 11 | [Deploy](prompts/11_DEPLOYMENT_AND_ONBOARDING.md) | Production Vercel release and tag setup |
| 12 | [Polish](prompts/12_ADVERSARIAL_REVIEW_AND_POLISH.md) | Final UX/error review |
| 13 | [Optional](prompts/13_OPTIONAL_ENHANCEMENTS.md) | Small optional features only |

### Supporting references
- [NFC setup](docs/NFC_STICKER_SETUP.md)
- [iPhone, Home Screen and offline use](docs/IPHONE_AND_OFFLINE.md)
- [SMS delivery decision](docs/SMS_OPTIONS.md)
- [Environment + secrets](docs/ENVIRONMENT.md)
- [Acceptance matrix](docs/ACCEPTANCE_MATRIX.md)

## Design constraints
1. A real event is logged only on explicit authenticated intent, never via GET, page prefetch, crawler, or incidental scan.
2. Fast enough for tired parents: single-task screens, large controls, editable defaults, easy correction, readable history.
3. Phone numbers, baby's identifiers, consent, keys and patient-like data never belong in a public repository, URLs, analytics, or logs.
4. A URL tag is a pointer, not an authentication credential. Multiple phones can use the same tag after each user authenticates.
5. A successful database save **does not** imply a text was sent. Show independent delivery status.
6. Default local zone: America/New_York, configurable per family; persist UTC instants separately from device time.
7. Notifications are configurable; no duplicate notifications on retry and no unconsented commercial messaging.
8. Secure child and family records behind membership checks and row-level security.

## Launch requirement
Do not represent mock UI as a finished application. Release only when tests pass on real Safari/iPhone hardware and the deployed domain, permissions, database, and SMS mode are verified. No secrets committed.

## References for implementers
- Apple Shortcuts NFC automation: https://support.apple.com/guide/shortcuts/setting-triggers-apde31e9638b/ios
- Apple documented SMS URL scheme: https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/SMSLinks/SMSLinks.html
- Twilio U.S. A2P messaging compliance: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc
- Vercel deployment docs: https://vercel.com/docs
- Supabase Auth SSR + RLS: https://supabase.com/docs/guides/auth/server-side and https://supabase.com/docs/guides/database/postgres/row-level-security
