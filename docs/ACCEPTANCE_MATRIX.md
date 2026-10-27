# Acceptance matrix — requirement to objective proof

Claude Code: maintain this with PASS / FAIL / BLOCKED (NEEDS DEVICE or ACCOUNT) and provide evidence/test commands and relevant SHA in BUILD_STATUS. Nothing is PASS merely because it exists in a prompt.

| ID | Priority | Requirement / exact verification | State |
|---|---|---|---|
| A01 | P0 | Public GET to each /t/opaque URL creates 0 DB events and 0 notifications | NOT RUN |
| A02 | P0 | WET sticker routes only to Wet form for authenticated member | NOT RUN |
| A03 | P0 | POOP sticker routes only to Poop form | NOT RUN |
| A04 | P0 | BOTH sticker creates one event subtype BOTH | NOT RUN |
| A05 | P0 | FEED sticker routes to amount/method form | NOT RUN |
| A06 | P0 | Two separate parent accounts can log from same physical tag | NOT RUN |
| A07 | P0 | Anonymous viewer cannot read child data through tag ID | NOT RUN |
| A08 | P0 | Another household member cannot access/read/edit foreign events | NOT RUN |
| A09 | P0 | Forged payload cannot change child/type/household/source intent | NOT RUN |
| A10 | P0 | Same idempotency key concurrent POST produces one event | NOT RUN |
| A11 | P0 | Same idempotency key produces only one logical notification per recipient | NOT RUN |
| A12 | P0 | Network retry after ambiguous commit returns original event | NOT RUN |
| A13 | P0 | Save failure never claims event saved or text sent | NOT RUN |
| A14 | P0 | Server SMS never runs without both provider setup AND recipient-specific consent | NOT RUN |
| A15 | P0 | Both opted-in parents get individual automatic sends with independent status | NOT RUN |
| A16 | P0 | Opted-out adult receives zero future automated messages | NOT RUN |
| A17 | P0 | No real phones/secrets in public repo, logs, client JS, URL, CI fixtures | NOT RUN |
| A18 | P0 | Revoked NFC tag cannot authorize new entry workflow | NOT RUN |
| A19 | P0 | Undo is audited void, dashboard excludes voided row, previously sent SMS warning shown | NOT RUN |
| A20 | P0 | Cross-parent edits use revision check and do not clobber silently | NOT RUN |
| A21 | P1 | Manual occurred_at differs correctly from created_at and sorts by occurrence | NOT RUN |
| A22 | P1 | Time zone + DST/overnight tests pass for America/New_York | NOT RUN |
| A23 | P1 | Bottle 3.5 oz, 120 mL conversion correct, unknown not zero | NOT RUN |
| A24 | P1 | Nursing optional duration + side without fabricated volume | NOT RUN |
| A25 | P1 | Notes optional across all four intents; safely displayed, validated | NOT RUN |
| A26 | P1 | Signed-out scan→login→correct tag route with no accidental event | NOT RUN |
| A27 | P1 | Parent A save appears to parent B on their own phone after expected refresh | NOT RUN |
| A28 | P1 | iPhone compose message can be shared/copied; app doesn't mark as sent | NOT RUN |
| A29 | P1 | Optional Shortcuts handoff verified on real iPhone for BOTH recipients | NOT RUN |
| A30 | P1 | Provider failure to one recipient doesn't undo event or affect other recipient | NOT RUN |
| A31 | P1 | No duplicate on double tap, browser back, refresh, offline sync | NOT RUN |
| A32 | P1 | Accessibility: VoiceOver labels, 44px targets, contrast, keyboard focus | NOT RUN |
| A33 | P1 | Mobile 320–430px screenshots have no primary-action clipping/overflow | NOT RUN |
| A34 | P1 | Offline event drafts never masquerade as confirmed synchronized data | NOT RUN |
| A35 | P1 | CSV/JSON export authorized, protected, formula injection safe | NOT RUN |
| A36 | P1 | Parent/admin tag registration, QR fallback, revocation functional | NOT RUN |
| A37 | P1 | Default privacy/no SMS mode works with zero messaging credentials | NOT RUN |
| A38 | P1 | Fresh DB migration, typecheck, lint, unit, integration, E2E, build all pass | NOT RUN |
| A39 | P1 | Live deployed production HTTPS URL and true NFC iPhone scan verified | NOT RUN |
| A40 | P2 | Event can be logged in 1 explicit tap after Wet tag page opens | NOT RUN |
| A41 | P2 | Feeding has big amount controls, custom amount and fast confirm | NOT RUN |
| A42 | P2 | Settings simple; no charts/AI/autodosing clutter at launch | NOT RUN |

## Mandatory demonstrations
1. **Diaper speed**: actual iPhone scan → tap NFC notification (if shown) → Wet form → Save → success; screen shows exact event and optional parent notification state.
2. **Feeding accuracy**: scan Feed → choose Bottle/3.5 oz/Breastmilk/time → Save → shared timeline.
3. **Two parents**: in two independent browsers/accounts, parent B sees parent A's record without manual sync of a spreadsheet.
4. **Safety**: open valid tag in private browser with no login; no event created, no child identity displayed.
5. **Text honesty**: trigger Compose mode; draft appears, no 'sent' claim; test auto mode only if provider/consent set up.
6. **Recovery**: kill network after POST while DB commit succeeds; replay same key; no duplicate.

## Evidence format
For every PASS, add a short reference in BUILD_STATUS or test results:
- Date/time and commit SHA
- Automated command and actual outcome (or device/browser details for manual)
- Where proof lives (test filename, test log, limited non-sensitive screenshot)
- Blocking external requirement if device/provider unavailable

Never store baby names, actual notes or parent phone numbers in these evidence artifacts.
