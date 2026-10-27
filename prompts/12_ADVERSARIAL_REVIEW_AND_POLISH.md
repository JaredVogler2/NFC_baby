# 12 — Adversarial launch review and ruthless UX simplification

## Goal
Do not assume that passing a unit test proves usability or security. Independently critique the full app like a tired parent at 3 AM, an impatient user scanning a tag, and a privacy attacker. Fix weaknesses rather than writing only a review report.

## Review procedure
1. Read codebase fresh from application entry routes through tag → auth → event POST → database → outbox → timeline → notification UI. Identify every trust boundary and untested dependency.
2. Exercise scan and log with slow simulated 3G, cellular reconnect, Safari back-forward cache, screen rotation, midnight timezone transition, repeated tapping and partially completed form.
3. Check if wet diaper requires >2 intentional taps after NFC page. Remove redundant screens, field labels, menu items and confirmation dialogs where safe; preserve explicit Save and child/type visibility.
4. Check if FEED feels fast: last mode and volume suggestions, clear amount choices, amount-unknown option and date/time notes. Remove needless complexity, keep optional nursing advanced details tucked away.
5. Dark-room UI on real or simulated iPhone: light spill, legibility, contrast, thumb reach, not overscrolling while typing.
6. Audit every 'Success' message; ensure text distinguishes Save, Draft Available, Queued, Submitted to Provider and Delivered if supported. No unsupported certainty.
7. Inspect server routes, RLS and storage to find ways to: enumerate households, use a tag as an authentication token, overwrite another parent's entry, duplicate events or spam two phone numbers.
8. Inspect database migrations and generated types; run fresh install and migrate, simulate migration failure and partial retries.
9. Audit notification path: consent, STOP, recipient verification, dispatch retries, idempotent enqueue, ambiguous send status, quiet hours, possible duplicate SMS after provider timeout.
10. Check security of redirectTo, invite tokens, public QR tags, SMS view links and exposed application metadata.
11. Review PWA offline behavior and ensure browser-local drafts aren't accidentally exposed after user change/logout.
12. Inspect Lighthouse / accessibility / screen readers / keyboard, and fix all critical issues. Keep nice visual identity without large JS dependencies.
13. Remove unused features, misleading marketing, placeholder links, mock data in production, debug console outputs, fake badges and unfinished scaffold code.
14. Run full tests; inspect E2E trace. Test multiple phones/accounts where devices available.

## Priority rubric
P0 = any private data leak, wrongful SMS, incorrect baby association, unauthenticated mutation, or data corruption.
P1 = duplicate logs, broken save or auth, false notification claim, wrong time/amount, inaccessible core button.
P2 = confusing wording, difficult notes/time editing, sluggish load, minor layout issue.
Fix P0/P1 before declaring ready. Record P2 in backlog with rationale.

## Final acceptance demo (do not fake)
- Four NFC URLs work on actual phone and persist event only after Save.
- Create wet and both diapers, edit note/time, void one, confirm author/audit.
- Create 3.5 oz bottle + nursing entry, verify conversion/date.
- Mom and Dad use separate phones/sessions; correct shared live timeline.
- Person outside household denied even with valid tag URL.
- Duplicate/retry tests prove one record/outbox jobs.
- Notification mode demo: compose user confirmation OR tested provider sends to both opted-in adults; successful database write remains even if texting fails.
- Export privacy, authentication and no-secret scan done.
- Real deployment status clearly reported.

## Required report
Create REVIEW_REPORT.md with concise table of findings, severity, cause, fix commit, proof, remaining limitations. Update BUILD_STATUS with gate PASS/BLOCKED, not assumptions. Check changes committed and clean git state. If all mandatory items pass, ready for optional phase 13. Do not imply mobile physical validation if test equipment wasn't available.