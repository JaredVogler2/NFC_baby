# Physical NFC stickers — purchase, write, mount and verify

This document is for the actual household setup after deploying the website. The public Git repo MUST NOT contain real baby names, phone numbers, access codes or private tagged record content.

## Minimum purchase
- Four compatible standard NDEF rewritable NFC tags (NTAG213 or NTAG215 typically sufficient for short URLs); buy spares.
- Optional waterproof printed labels and QR stickers.
- For metal equipment/surfaces buy ferrite-backed/on-metal NFC tags; regular stickers can fail on metal.
- Do NOT place peelable tags within infant/toddler reach; small detached items can be a choking hazard.

## Proposed tag inventory (first four)
| Sticker label | Placement (out of child's reach) | Assigned purpose | Scan result |
|---|---|---|---|
| WET | Adult-only area by changing station | WET | Open Wet diaper form |
| POOP | Adult-only area by changing station | POOP | Open Poop diaper form |
| BOTH | Adult-only area by changing station | BOTH | Open Wet + Poop form |
| FEED | Adult-only bottle/feeding area | FEED | Open feeding method/amount screen |

Extra same-purpose tags permitted upstairs, downstairs, travel bag, etc. Each receives a separate opaque token; can point to same action.

## After Vercel production domain is running
1. Sign in as household owner in the production site on iPhone.
2. Open Settings > NFC Tags > New Tag.
3. Choose baby's private profile, purpose, human label. Generate tag URL, for example https://nfc-baby.example/t/7HVQ-OPAQUE (illustrative, never real).
4. Use a compatible NFC writer app to write a single NDEF URI/URL record with that exact HTTPS URL. Important: save the NDEF URL itself, not only plain text.
5. Re-read the tag in the writer app; verify URL exactly matches, no accidental whitespace or staging hostname.
6. Test scanning from an unlocked iPhone that is authenticated on the site. For NFC background tag reading on supported iPhones, move the top of the iPhone near the tag and follow the iOS notification to open Safari. Some versions/cases require multiple attempts or different phone positioning.
7. Expect a form, NOT an automatic saved diaper event. Check baby's name/nickname and activity type.
8. Press Save on a clearly labelled synthetic test event. Confirm timestamp, author, and event in both adults' timelines. Mark test event as void and verify audit rather than delete evidence.
9. Repeat each action sticker, then scan with the other parent's iPhone/account.
10. Repeat while signed out: initial scan should show generic sign-in, then return to intended form after login.
11. Scan WITHOUT saving, close page. Verify zero events/messages were created.
12. Attach and label tags out of child reach, print QR fallback using same URL, then confirm from mounted location. Mount not over bare metal unless on-metal tag.
13. After verification optionally make NFC tag read-only using writer app; be aware physical lock usually cannot be undone. Application administrator can still revoke/repoint tag on backend.

## Expected screen examples
WET URL: selected baby, 'Wet diaper', Event time: Now, optional 'Change time', optional 'Add note', large 'Save wet diaper'.
POOP URL: identical layout with 'Poop diaper'.
BOTH URL: single 'Wet + poop' event, never two accidental entries.
FEED URL: 'Feeding', Bottle / Nursing, amount (bottle) and source, optional time/notes, large Save.

## About true one-tap and no-confirm logging
Basic physical URL tags cannot securely silently write baby records just from GET; the site must require an authenticated intentional Save. If the family later wants absolutely no button press, an *individually installed* Apple Shortcuts NFC automation can call authenticated POST with a per-phone revocable token, but requires careful deduplication, revocation and risk controls. Phase 13 is optional; do not hack this in initial launch.

## Problems / fixes
- Nothing happens: confirm supported iPhone, screen/device state, top antenna, try NFC reader app and inspect NDEF URL.
- Wrong action: check tag association in admin, re-test URL.
- Can't sign in: verify production auth redirect allowlist and session cookies; don't share family credentials.
- Multiple logs: a scan alone cannot create one. If two saves were made, void incorrect record and investigate client idempotency keys.
- Says saved but no SMS: event persistence and message delivery are separate; inspect notification mode/status; compose needs human send, auto requires verified provider/consent.
- QR works but NFC doesn't: tag may be damaged, poorly placed, empty or magnetically interfered with.
- Stolen/missing tag: revoke in Settings; it was never a login credential and should expose no private data on its own.

Reference:
- Apple Shortcuts intro https://support.apple.com/guide/shortcuts/welcome/ios
- Apple personal NFC automations https://support.apple.com/en-euro/guide/shortcuts/-apd602971e63/ios
