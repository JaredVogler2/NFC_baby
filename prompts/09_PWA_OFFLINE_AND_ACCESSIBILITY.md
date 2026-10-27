# 09 — iPhone PWA, network recovery, accessible night use and performance

## Goal
Parents must be able to use the app on a real iPhone, sleepy, one-handed, even with occasional network loss. Make it feel like a thoughtfully crafted lightweight utility, not a sluggish enterprise dashboard.

## PWA + install
- Valid web app manifest: name 'NFC Baby', short_name, start_url/dashboard, icons (maskable where useful), display standalone, theme colors, iPhone safe-area and splash behavior where supported.
- Explain Add to Home Screen for iPhone Safari; NFC URL may open Safari browser rather than PWA context, and may require iOS notification tap. Ensure web and standalone routes/auth work identically.
- Add service worker only if it materially improves offline app-shell loading and does not cache sensitive data in shared/public caches. Avoid broad precache of authenticated data, API responses or notification content. Version caches, clear on logout as appropriate.
- Test cookie/auth behavior in iOS Safari and installed home-screen modes. Never rely solely on a Service Worker or online push notification permission.

## Offline and uncertain-write design
- Explicit offline banner and compact state at logging screens.
- If offline, optionally save a LOCAL draft with user consent, baby/tag ID, intended event timestamp, form data and stable clientRequestId. Visually say 'Pending on this device — NOT yet in shared history; no text sent.' Make sync explicit or automatic only after original save intent confirmed; never treat scan alone as intent.
- Prefer indexedDB (or similarly appropriate persistence) for offline queue; protect privacy, cap retention, and discuss implications for shared phone. If offline drafts cannot be stored safely, retain in memory and disclose risk of loss.
- On reconnect after user had submitted, POST same idempotency key to ensure one server record; verify server authoritative result before clearing draft.
- If session expired, require login before any sync, but retain permitted local draft. If another parent signs in to same device, never silently upload previous user's private draft to wrong household.
- Handle ambiguous response: attempt status check via idempotency key or safe retry, not duplicate-new-key submission. 'Can't confirm save yet' is distinct from 'Not saved'.
- No offline fake SMS; notification only after server confirms event and provider queue processes it.

## Accessibility and high-fidelity iPhone UX
- Large ergonomic CTA; 44px or larger tap areas, focus ring, touch feedback, high contrast, 16px minimum input fonts, semantic field labels and accessible errors.
- iPhone top/bottom safe areas, overscroll, keyboard-aware CTA, supports landscape, 320px width, zoom 200%, prefers-reduced-motion, dark mode/night mode.
- Make form operable with VoiceOver; buttons expose action names ('Save wet diaper'), not just icons.
- Date/time selected with native accessible controls or meticulously verified replacements.
- Avoid color-only distinction wet/poop/both, use text and icon; avoid bright full-screen flashing at 2 AM.
- Use subtle motion and comfortable transitions; prioritize clarity over decorative animations.
- Performance: aim for light JS payload and fast Time to Interactive; measure with Lighthouse mobile and real iPhone on normal cellular. Optimize initial navigation and data fetching, no unnecessary 3D/chart libraries.
- Structured loading states and resilient error boundaries; don't blank the screen after failed save.
- Handle session expired and refresh without losing user-entered notes/amount.

## Verification
- Safari iPhone normal tab and Add to Home Screen mode.
- Test actual NFC scan end-to-end, not simulated mouse click; test unlocked device, URL notification, correctly routed action.
- Simulate offline before scan, after form load, while submitting, and immediately after server commit. No duplicates upon reconnection.
- Test tap targets, VoiceOver, text size, dark mode, focus, accessibility automated checks (axe or equivalent).
- Multi-parent real-data refresh after one writes and the other resumes the app.
- Test repeated scanning while already on tag route; no accidental event.
- Document any true iOS Safari limitations and proven fallback instead of claiming unsupported features.

## Exit
Functional installable PWA where appropriate, explicit pending/offline states, measurable accessibility/performance proof, committed checkpoint. Proceed phase 10.