# 00 — Execution contract, checkpoints and product invariants

**Agent role:** Lead engineer, pragmatic product designer, privacy reviewer, QA lead. Work as Claude Code Opus 5.5.

## First actions
1. Read README, CLAUDE_GOAL, all prompts 01–13 and docs before editing application code. Confirm the actual repository state; do not assume scaffolding exists.
2. Establish BUILD_STATUS.md with table of each phase: NOT STARTED / IN PROGRESS / PASS / BLOCKED, commit hash, tests run and open questions. This status is a record of evidence, not a substitute for tests.
3. Verify package managers and environment, choose npm unless repository strongly signals otherwise. Make architecture decisions once in docs/ARCHITECTURE_DECISIONS.md.
4. Work phase by phase. Within a phase, do the smallest deployable slices, implement migrations/UI/API/tests together, and commit each coherent slice. Do not stop at design mocks.
5. If Vercel, SMS, or Supabase accounts are not linked, implement provider interfaces and document setup without inventing tokens, provider data, production URL, or successful production tests.
6. Do not substitute a collection of toy pages for coherent end-to-end flows. Test each feature from tag URL to persisted row, refreshed family timeline, and notification state.

## Non-negotiable product rules
- Extremely intuitive iPhone-first interface; primary event can be saved in 1–2 interactions after NFC navigation when required data is known. No nested navigation or mandatory long forms.
- Four physical tag intents WET, POOP, BOTH, FEED. They are not interchangeable; a scanned tag should visually announce its intent and selected child. Feeding needs an amount or explicit unknown flag for bottles, if not recorded.
- A tag stores only an opaque public URL. GET never mutates user data, sends SMS, or creates event. Unknown/revoked tags show safe states. Do not assume URL token = access.
- After authenticated explicit Save POST, commit a durable event with an immutable event id, user/time/entry method, type, notes, and deduplication idempotency key. Show success only when server confirms.
- Each family member has own identity/role. The baby record is private. Visitors do not see names, event data, parent numbers, notes, calendars or consent.
- Any correction is attributed, preserves audit history and properly reconciles notifications; do not erase evidence silently. Undo is a marked void event, not destructive deletion.
- Date/time is server-backed UTC with UI rendered in the family's configured IANA timezone; default America/New_York. Users can backdate with clear safeguards for future timestamps.
- Event logging is usable without requiring a text provider. Notification failure must never roll back a legitimate event; visibly separate states.
- Parents can enable/disable recipients, event categories, quiet hours or summaries, and notification channels without coding.
- At least two parents can use a shared sticker; no single-user-only Shortcuts logic required for baseline.
- Treat medical details as sensitive personal family records; avoid collecting unnecessary PHI-like data; no unsolicited medical advice, formula or medication dosing algorithm.
- Strict separation: public config vs secrets, browser vs server privileges; no phone numbers in repo, client JavaScript, tag URLs or screenshots. Do not log request bodies/notes.
- Refuse to automatically send SMS until verified consent and legal/provider requirements. Set SMS provider disabled by default.

## Implementation discipline
- Implement typed domain models (TypeScript strict) and runtime input validators (Zod or equivalent); document time/units/storage conventions.
- Provider adapters (notifications, persistence) should be testable via injection; isolate external dependencies.
- Avoid needless LLM/API integrations, game mechanics, machine-learning, analytics trackers, advertisements, third-party telemetry, or UI decoration.
- Capture operational failures: offline, timeout, auth expiration, double tap, duplicate scan, network reconnect, wrong tag, future timestamp, editing after notification.
- Use semantic HTML, keyboard support, large touch targets, strong contrast, dark-night palette without hidden buttons.
- Design app for a single household now, but with household_id isolation so data cannot leak as usage expands. Use no public multi-tenant sign-up unless specifically requested.
- Design durable automation with idempotency and at-most-once intentional enqueue per event+channel+recipient; provider delivery status may still be unknown. Do not promise exactly-once telecom delivery.
- Prefer existing well-supported libraries, make version choices explicit, and avoid infrastructure that requires always-running background tasks.

## Git and progress rules
- After each completed phase run formatting/lint, type check, tests relevant to that phase, and production build. Fix regressions before marking PASS.
- Update BUILD_STATUS.md with performed steps and objective proof (test commands and results), not vague statements.
- Make a checkpoint commit every phase and write NEXT_ACTION for interrupted sessions.
- If upstream already provides a working feature, preserve it and test it rather than rewriting it for style.
- Do not force push to main. Avoid committing .env, service-account files, database dumps, real consent phone numbers, or live health records.
- If a phase requires human actions (DNS, Twilio purchase, SMS verification), mark them as EXTERNAL SETUP but keep the remainder of app functional.

## Deliverable per phase
A) Code changes, B) tests, C) documentation updates, D) build check, E) committed SHA, F) concise explanation of what the next phase can assume.

Read phase 01 next. Stop implementation of optional phase 13 until 00–12 are complete.