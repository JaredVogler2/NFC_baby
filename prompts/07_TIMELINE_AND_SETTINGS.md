# 07 — Shared parent timeline, minimal dashboard, editing and administration

## Goal
After a wet/poop/feed log, both parents must see an accurate consistent shared record without asking each other. Build the second half of product usefulness: easy review, accountability, recovery, and secure settings.

## Dashboard (primary home screen)
- Selected child at top (if multiple); large compact 'Last fed' and 'Last diaper' blocks showing type, event time and elapsed time.
- Three diaper quick actions and Feed action for use without NFC; no extra menu before logging.
- Last 5 care events with author (Mom/Dad display name), time, type, feeding amount if known, and status.
- Stable loading/skeleton, new family empty state 'No entries yet—scan a sticker or tap Log', error/retry.
- Accessible from installable home-screen PWA and normal Safari.
- Maybe show 'today total wet / dirty / bottle volume' in a restrained collapsible section; do not put high-stakes infant assessment in UI.

## History
- Newest actual event first by occurred_at descending with created_at as stable tiebreaker; virtualized or cursor paginated for long history.
- Date group headings in family IANA zone, local times with explicit date when necessary, notes displayed safely, edited/void markers, author.
- Filters: All, Diapers, Feeding; date selector/range. Reset filter affordance and clear empty states.
- Details drawer/modal with original data, audit trail if authorized, edit/void with confirmation, current notification status.
- Refresh new events across phones promptly while both screens active; Supabase Realtime subscription with authorization if configured, otherwise bounded polling / refresh on focus. Never pretend real-time if only poll.
- Optimistic UI may help, but show a pending/non-persisted visual state and reconcile with canonical server result, no false success.

## Settings
- Family profile (name, time zone), children (profile/nickname), optional default feeding mode, display unit oz/mL, accessibility/night mode.
- Team members + invite flow for parent/owner and optional caregiver with role boundaries. Only owners edit recipient numbers and messaging provider status.
- NFC tags: create/list/revoke/QR/URL and destination test flow (phase 04).
- Parent notifications: recipients as masked, modes OFF / COMPOSE / AUTOMATIC (if configured), per-event toggles, quiet hours, summary settings. No mandatory third-party account.
- Export household events to authorized CSV/JSON from secure route; documented columns and dates, sanitize spreadsheet injection, no public link.
- Account sign-out, revoke invite, deactivate user, explain how family records can be deleted/exported.

## Nuances
- Do not make diaper aggregates misleading: BOTH counts toward wet and poop categories for derived rollups without duplicating source event count.
- An event entered later but occurred earlier must display in chronological occurrence order.
- Avoid using literal last feed interval as a clinical recommendation.
- On edits, prevent overwriting concurrent parent edits with expected revision and helpful diff to resolve conflict.
- Use role-level authorization at all API boundaries, not just hiding buttons.
- A sticky action to log from dashboard must not perform GET mutations.

## Exit criteria
- Two separate browsers/accounts simulate both parents in a test: one logs, other sees refreshed event and exact edit.
- Filters, pagination, notes, exports, invites, audit and settings save reliably.
- Cross-household data requests denied; caregiver cannot access owners' contact data.
- Responsive design and mobile VoiceOver reviewed.
- BUILD_STATUS/checkpoint commit; proceed to phase 08.