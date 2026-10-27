# 04 — Physical NFC stickers, URL resolver and tag management

## Goal
One NFC sticker per action: Wet, Poop, Both and Feeding. Each tag launches the correct action-specific screen in Safari on a compatible unlocked iPhone through standard NFC URL reading; all parents can use the same physical tag securely.

## Design: stable URL, mutable behavior
- Use publicly readable NDEF HTTPS URL (not native proprietary encoding), e.g. https://YOUR_DOMAIN/t/OPAQUE_TAG_ID. Do not encode baby name, type, note, phone, time, or API key into the URL. Opaque ID should have high entropy, no sequential auto-increment.
- A server-side tag entry links tagId to household, child, purpose and active status. Admin may edit purpose and selected child without rewriting the physical tag.
- GET /t/:id is side-effect free, incl. auth redirect, prefetch, previews, web crawlers, and repeated scans.
- Unauthenticated GET shows generic branded access gate, preserves safe internal returnTo path, never discloses tag purpose, baby name, history, or who owns tag.
- After login and membership authorization, load purpose-specific form. Server checks tag active and authorized; do not let a malicious POST override tag's intended purpose.
- If tag belongs to another household, return generic 404/unauthorized that reveals no sensitive details; if revoked, show clear safe error only to authorized user.
- Tag screen supports record time Now or edit date+time; note optional; scanning it multiple times must not create any event. Save requires authenticated button/POST.
- On Save, generate UUID clientRequestId per action attempt; persist across network retry until completion; upon success generate new attempt for any deliberate new event.
- Correct handling of browser back navigation, refresh, duplicate tab, debounce and lost POST response.
- Provide optional QR fallback showing the SAME URL; QR image may be printed under the tag label.

## Administrative tag management
Create Settings → NFC Tags showing:
- Name/label (editable), assigned baby, action, URL, active/revoked state, date created, last deliberate use (if collected).
- Create tag flow: choose action and child, generate opaque URL, copy link, show QR, provide physical programming instructions and 'Open test link' button. Creation must only register the mapping, not log an event.
- Tag lifecycle: unassigned → configured → tested; revoke → permanently disabled; replace via new tag token. Revoked tokens cannot be reactivated without admin explicit steps; no mass enumeration.
- Allow one tag per action and duplicates (e.g. upstairs wet and downstairs wet) without limits from arbitrary URL strings.
- Printable printable labels with distinct icons, textual identifiers and room names. Include example Wet / Poop / Both / Feed.
- A scan-test screen validates authenticated routing without emitting event/notification.
- Optional NFC sticker as family HUB opens a quick action dashboard; not mandatory at launch.

## iPhone behavior and honesty
- Standard iPhone NFC reading of URL records is not the same as a personal Shortcuts automation. A normal scan opens a notification/link; user may need to tap it. Do not promise guaranteed lock-screen background app launches or silent event logging from a browser.
- As an advanced optional pathway, iPhone Shortcuts personal NFC automations can run actions on an individually configured device. Explicitly separate this from multi-device shared URL tags.
- Do not depend on Web NFC reader/writer APIs in iPhone Safari, as compatibility differs; program stickers with dedicated NFC-writing app or compatible platform.
- Document when an unlocked device is required, the typical NFC antenna placement near the top of supported iPhones, and cases that interfere with scanning (metal, thick cases, overlapping tags).
- For stickers on metal use anti-metal/ferrite-backed NFC tags. Standard tags often fail near metal.
- All tags must remain out of infant/toddler reach. Peelable stickers are a choking hazard.

## Required test cases
1. Register all four tag intents, write equivalent URLs to physical tags, scan on real iPhone.
2. Wrong tag/unknown tag/expired or revoked tag shows correct safe state.
3. Different signed-in parent scans same physical tag; both can intentionally log and see data.
4. Signed-out parent logs in and returns to correct tag without auto-creating event.
5. Anonymous/other-household person cannot infer child or household, nor create event by guessed tag ID.
6. Multiple browser opens and robots hitting same URL yield zero new records or texts.
7. URI is stable after editing the tag label; revocation invalidates original.
8. Tag URL opens over HTTPS, not an inaccessible development localhost.
9. Offline scan and authentication expiration produce clear handling rather than lost details.
10. Access log/analytics contain no medical details or recipients.

## Exit
Deliver functional resolver, tag management, QR/print fallback, onboarding walkthrough and tests. Update BUILD_STATUS with actual Safari device test status. Commit, proceed to phase 05.