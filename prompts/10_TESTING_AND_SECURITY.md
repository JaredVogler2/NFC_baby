# 10 — Comprehensive testing, adversarial security and failure injection

## Goal
Prove the application works with real database persistence and external boundaries. Tests should focus on high-risk failures: wrong family data, duplicate logs, wrong time, accidental SMS, broken sign-in and unreliable iPhone behavior.

## Test pyramid
Unit: domain validators, unit conversion, DST/date formatting, notification templating, idempotency state machine, consent logic, permission matrix, safe URL resolution, correction rules and aggregations.
Integration: migrations, RLS policies, multi-account Supabase Auth, authenticated Next.js route handlers, event insert/audit/outbox transaction, optimistic edit locks, revocation and server-only phone access.
E2E Playwright: two different parent sessions, sign-in redirect from tag, four scan intentions, success screens, double-click, refresh, timeline sorting, offline pending recovery, exports, preferences, unauthorized users. Use deterministic fixture data.
Manual real-device: supported iPhone iOS + Safari NFC scanning actual programmed tags, Safari tab vs PWA, optional native share sheet and Shortcuts, SMS mode only with both adults' consent.

## Adversarial scenarios, must test
1. Public stranger scans unique but valid URL: no baby/name, no events, no phone, no row enumeration.
2. Signed-in user from another household scans tag, guesses child id or directly calls APIs: all 403/404 no leakage.
3. User tampers with tag payload (changes WET to FEED) or created_by, household, author, notes HTML injection: validated/denied.
4. User repeats same POST 10 times concurrently using same idempotency key: precisely 1 persisted event, 1 logical notification per recipient.
5. Fetch/GET crawlers, link preview, preloading, browsing tag without pressing Save: precisely 0 event writes and 0 notifications.
6. Two distinct valid events at identical time/type: both save if distinct deliberate clientRequestIds.
7. Network goes out after DB commit but before response; reconnect/retry returns original record.
8. Wrong or voided event is not counted in last fed/last diaper or dashboard totals.
9. Backdate at midnight DST fallback and spring-forward using America/New_York; UTC stored correct, ambiguous local times explained; no silent wrong date.
10. Multi-parent simultaneous edits with optimistic concurrency: no silent overwrite.
11. Save succeeds, Twilio fails: event remains visible, notification marked failed/unknown.
12. One parent opts out, other opts in: exactly one outbound target. Both opted in: two targets, not accidental group cross-message.
13. Privacy: DOM bundle, source maps, server logs, preview deployment, tag query string, exception stack, public repo show no actual numbers or child records.
14. Revoked/stale tag returns safe view; old token can't log anymore.
15. Internal-only cron endpoints, delivery callbacks, test-SMS routes are authenticated or provider-verified and rate-limited.
16. Session expires at save; attempt safely re-authenticates without cross-user queued data or phantom success.
17. Content injection and exported CSV formula injection mitigated.
18. Repeatedly submit during slow responses from an iPhone; no misreported success.
19. Toggling 'send automatically' never sends backlogged test logs unless that behavior was explicitly designed and consented.
20. No real provider SMS from unit, integration, CI or staging by default.

## Quality tooling
- ESLint, TypeScript strict, Prettier, dependency vulnerability scanning (advisory not auto-blind upgrades).
- Vitest + Testing Library + Playwright; database RLS policy tests with separate actual user JWTs.
- Run migrations from clean DB in CI; seed only synthetic names and numbers (reserved/fake test data) with external sends mocked.
- Lighthouse mobile and WCAG-based axe checks; manually validate VoiceOver and tap accessibility on iPhone.
- Monitor error rate/latency with redacted request metadata; avoid storing family log bodies and bearer data in analytics.

## Acceptance matrix
Use docs/ACCEPTANCE_MATRIX.md as a living checklist, with per-row: command/device/test case, actual result, date, status, commit hash, limitations. No 'PASS' on a mere intent to test.
Capture count from database before/after tests; inspect notification_outbox to verify dedupe. Record proof of sender paths individually.
If hardware, provider credentials, production domain or DNS unavailable, mark 'NEEDS HUMAN DEVICE/ACCOUNT SETUP', not PASS. Still complete every automatable test.

## Exit
No known critical auth/data/safety bug. CI green, migration from zero passes, production build green, E2E passes, manual outstanding items listed. Commit BUILD_STATUS and proceed 11.