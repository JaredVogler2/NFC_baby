# 05 — Wet / Poop / Both rapid logging, backdating and safe correction

## Goal
Make diaper tracking so simple that parents actually use it. Each of three dedicated stickers should show a one-screen intent and one obvious Save action; optional date/time and notes should never get in the way.

## Required routes + views
- Scanning assigned WET sticker opens 'Log wet diaper' with clear wet label/pictogram, baby nickname if authenticated, default timestamp Now, expandable 'Change time', optional notes, large 'Save wet diaper' button.
- POOP opens 'Log poop diaper', identical layout but exact type POOP and dedicated confirmation.
- BOTH opens 'Log wet + poop diaper', saves ONE event with subtype BOTH (do not create two rows unless backed by deliberate business rule, and this design mandates one).
- Authenticated dashboard exposes same 3 buttons for times sticker isn't nearby.
- Success: 'Wet diaper saved at 2:14 AM', named logger, notification state, 'Undo' and 'Add note/Edit' affordances; return/close hint.
- Clean empty state when no diaper records exist; no gamified medals or graphs.

## Detailed data rules
- Store occurred_at UTC, created_at server UTC, event subtype, source tag (if any), author user id, notes, status and idempotency key.
- Default time is now at actual Save, not frozen when a page is opened minutes before (display live Now unless parent explicitly chooses another timestamp).
- Backdated time input uses family local timezone and converts with DST correctness; handle ambiguous/nonexistent local times with clear behavior and UTC persist.
- Preserve manually selected event time. Simple easy-to-read calendar+time picker, include quick presets 'Now', '5 min ago', '15 min ago', '30 min ago'.
- Notes optional <=500 chars; high-value templates 'leak', 'diaper rash concern' and freeform only if useful. Do not require health fields.
- No automatic medical diagnosis from diaper frequency.
- Clients can safely issue concurrent writes; no double-submits due to rapid Save taps, network retry, or duplicate return; idempotent POST with same clientRequestId.
- A deliberate second diaper save after first success should be a NEW attempt; do not globally block two real events just because timestamp/type match.

## Corrections and audit
- Edit time, category and note from family timeline; server checks membership and optimistic revision, records who changed what/when.
- Void accidental entry through confirmation. It disappears from main totals/timeline by default but remains visible in audit and optionally 'Show corrected entries'.
- Time-limited success Undo can be a convenience; backend supports auditable void afterward too.
- If notification was already sent, UI warns it cannot recall the old text. Do not trigger surprise correction SMS by default.
- If a notification has not yet been sent and event is voided, cancel pending notification. If queued/sending, reconcile as best possible, never lie about carrier delivery.
- UI states for initial save, pending, saved, unavailable offline, timeout, duplicate retry, expired session and conflict.

## Acceptance tests
- Three physical-tag intents produce correct distinct stored type and accurate timestamps.
- Both creates one BOTH row; timeline counts correctly.
- No note required. A 500-character note succeeds; too-long text has understandable validation.
- Scan alone, prefetch, browser reload yields zero writes.
- Double Save with same idempotency key yields exactly one event, one set of outbox notifications.
- Retry after ambiguous timeout returns existing persisted event without duplicate.
- Two parents concurrently log different events; both remain visible.
- Unauthorized modification rejected; edit by authorized member audited.
- Backdating 15 min and crossing midnight matches family timezone.
- Void removes active event from analytics; audit remains.
- Large touch controls tested on 375 px iPhone and VoiceOver.
- Visual time-to-completion usability trials: one logged wet diaper using one explicit Save action after link opens; optional fields remain collapsed.

## Exit
Real persistent diaper logging from each NFC URL to timeline, tests, clean UI, committed checkpoint. Continue phase 06.