# 01 — Complete product specification, journeys and polished UX

## Mission
Ship a calm, extremely efficient digital log for two sleep-deprived parents caring for a newborn. A physical NFC sticker replaces hunt-and-peck app navigation. A scan must make the intended action obvious; completing a record must be quick, reversible and reassuring.

## Personas and critical realities
- Mom and Dad each use their own iPhone, sometimes one-handed and in the dark. Both need shared live state.
- Caregivers may later need limited privileges; no public anonymous logging at launch.
- Multiple children may exist in the family. v1 starts with one tracked baby but schema supports multiple child profiles. For targeted NFC tags, ensure child assignment is visible to prevent writing to wrong profile.
- Parents sometimes record late events, use unreliable mobile data, and accidentally scan or double-tap.
- Each scan may come from Safari, lock-screen NFC notification, home-screen PWA, or a supported Shortcuts automation. Do not require installing a native app.

## Required screens; create a design spec and implement
1. Welcome/sign-in/invite: friendly, passwordless email magic link or secure equivalent, minimal setup, no social sign-in dependence.
2. Dashboard: selected baby, elapsed time since last feed and diaper, last 5 events, large quick-log affordances, no extraneous charts.
3. NFC intent screen: label 'Log wet diaper' / 'Log poop diaper' / 'Log both' / 'Log feeding'; selected infant; event-time default Now; note optional; visually obvious Save; explicit cancel; safe repeated visits. No mutation on initial load.
4. Success screen: clear 'Saved', event summary, who logged, exact date/time, correction affordance, next useful action; never claim 'Text sent' unless confirmed by provider.
5. Feeding detail: switch bottle / nursing; bottles choose breastmilk or formula; amounts in oz and mL; large chips of realistic values with last amount as optional suggestion; nursing start/end times or duration and optional side; note optional. All optional complexity progressively disclosed.
6. Unified family timeline: latest first, date separators, icons/color+text for wet/poop/both/feed, amount/side/note, author, visible edits, filters by event type and date, edit/void.
7. Settings: child name/nickname + time zone, membership/invites, parental notification preference, tag manager, SMS configuration/status, privacy/export.
8. Tag provisioning: admin chooses intent and baby, creates opaque tag ID/URL, QR fallback, printable label, test status, revoke/reissue.
9. Read-only or scoped caregiver mode, if implemented: no changing recipients, wiping logs, exporting others' data, or viewing phone numbers.

## UX standards
- Distinctive calm, premium design without childish clutter; choose a soft palette with WCAG-compliant text contrast and unobtrusive event pictograms.
- Mobile priority viewport 375–430px; fully functional at 320px, landscape, tablet and desktop.
- Safe-area insets for iPhone notch/home bar, minimum 44x44 CSS px tap targets, 16px input text to avoid iOS zoom, visible focus styles.
- Put Save above keyboard, avoid accidental form submission, preserve input if authentication interrupts a flow.
- Aim for perceived content available <1.5s on warm cellular and record save confirmation <2s excluding bad networks; measure, don't invent lab results.
- No carousel, dashboard sprawl, excessive tabs, graph noise or banners obscuring the primary action.
- Use plain words, not codes: 'Pee' can be secondary but primary is 'Wet diaper'; 'Poop diaper'; 'Wet + poop'.
- Distinguish event time vs time recorded; if a parent logs an event from 30 minutes ago, display both correctly.
- Clear 'Undo this entry' with confirmation and retained audit trail; undo cannot silently retract previously delivered SMS.
- When viewing an NFC URL while signed out, preserve intended tag destination through the login journey and do not leak patient data in the unauthenticated page.
- Alert messages: 'Saved. Text not sent; tap to draft' and 'Saved. Automatic texts queued' rather than ambiguous toast.
- If amount missing from feeding, explicitly allow 'Amount unknown' with clear warning; do not enter zero silently.
- Make notes optional on every event; normalize whitespace, length cap and sanitization.

## User journeys to wireframe and test
A. At changing table scan Wet → page says 'Wet diaper' → confirm → event appears on second parent's phone.
B. Scan Both → optional 'changed 8 min ago' → note → save → shows time + note.
C. Scan feeding → set bottle 3.5 oz at 2:10 AM → select breastmilk → save → timeline reflects correct timezone.
D. Scan tag twice/refresh/back → no duplicate entries without new deliberate action.
E. Scan while signed out → sign in → return to exact intended event without duplicate or loss.
F. Unauthorized stranger scans same tag → cannot see child identity, history or data; sees sign-in wall.
G. Failed network POST → distinguish 'not saved' from 'saved but response lost'; safe retry is idempotent.
H. Parent edits wrong quantity after notification → timeline corrected and notification status states original message may already have been delivered.
I. Offline scan → no false success; offer safe local pending draft and synchronization only after deliberate confirmation and eventual authentication.

## Phase deliverables
- docs/PRODUCT_SPEC.md: clear entities, scope, exclusions, personas, edge cases, text-only wireframes per screen and accessibility.
- An actual implementable UI specification and component map. Mock/design files are fine at this phase but must be converted into functional app in later phases.
- Named acceptance tests for the nine journeys above with measurable outcomes.
- Decision log: default UI settings and what is deliberately deferred.
- Completion gate: explicit mapping from every requirement to planned route/component, no unresolved contradictory user flows.

Proceed to phase 02 after commit.