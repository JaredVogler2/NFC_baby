# Phase 13: optional enhancements (deferred on purpose)

Phase 13 says to build nothing here before the mandatory phases pass on real devices and the owner
approves a specific feature. Phases 00–12 pass their automated gates, but the real-iPhone, live-SMS
and production checks are still owner steps. So **nothing below has been built in phase 13.**

This page records what already exists (built because an earlier phase required it), what was
deferred, and why. Every future item needs a scoped requirement, owner approval, tests and a
release note. The core NFC, RLS, duplicate and SMS regression suites must be re-run with each one.

| # | Option (prompt 13) | Status | Reason / notes |
|---|---|---|---|
| 1 | One-scan Shortcuts instant logging | Deferred | Needs a per-device revocable credential, replay protection, protection against repeated automatic scans, and undo, plus per-phone consent. A plain sticker URL must never save on its own (no-GET-mutation rule). Highest value once real-phone use proves the two-tap flow is too slow. |
| 2 | Notification preference tuning | **Exists** (phase 08) | Per-category toggles (Wet/Poop/Both/Feed), quiet hours, "include my own entries", and no backlog when switching on. Summary/digest texts are not built. |
| 3 | "Since you last checked" handoff digest | Deferred | Home already shows last fed, last diaper, today's counts and recent entries. Wait for evidence it's needed. |
| 4 | Bottle/pump add-on with milk storage | Deferred | Risk of clinical guidance. Needs verified storage guidelines first. |
| 5 | Diaper/formula stock and shopping list | Deferred | A new data surface and confirmation flows; not part of the logging problem. |
| 6 | Expanded child profiles / caregiver per-child access | Partly exists | Several children and archiving are supported. Per-child caregiver scoping is deferred because RLS would need child-level policies. |
| 7 | Widgets / Apple Shortcuts | Partly exists | An optional "NFC Baby Notify" share Shortcut for texts (phase 08). A home-screen "Log Wet" link can be added to Shortcuts today (it opens the normal form). A direct API credential is deferred, same as #1. |
| 8 | Speech-to-text notes | Deferred | iOS dictation on the keyboard already works in the notes field, with no extra privacy surface. |
| 9 | Daily/weekly summaries and charts | Deferred | Export (CSV/JSON) exists. Charts were excluded at launch (prompt 07 / A42: no chart libraries). |
| 10 | QR fallback cards | **Exists** (phase 04) | Settings → NFC stickers → Print labels & QR codes. The QR opens the same protected URL. |
| 11 | Manual reminders | Deferred | Must avoid automatic feeding or medical timing advice. Needs an explicit opt-in design. |
| 12 | Delivery diagnostics | Partly exists | Per-recipient status on each entry and masked numbers in Settings. Alerts for a stuck queue are deferred; the daily cron and Home visits already retry. |

Also deferred from the phase-12 review backlog (see `REVIEW_REPORT.md`):
- an app-side per-IP sign-in limiter, or a CAPTCHA with a client widget
- confirming the full formatted phone number before saving
- moving the family mode change behind the service role
- showing the time on the Save button
- an automatic status check when a restored entry appears
