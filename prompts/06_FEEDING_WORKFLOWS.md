# 06 — Feeding logging with amount, time and notes but minimal friction

## Goal
A FEED sticker supports actual infant feeding patterns without forcing unnecessary inputs. A bottle feed should be recordable with two easy choices and Save, and breastfeeding should be possible when relevant. Keep a polished single-screen UI with progressive disclosure.

## Base FEED NFC screen
- Large header 'Log feeding', baby nickname, local default Now.
- Choose feeding method: Bottle / Nursing; persist last-used method as a *suggestion*, never silently assume something not visible. Bottle can be default if household specifically configures it.
- Bottle: select milk source Breastmilk / Formula / Unknown; input amount via big chips (for example 1, 2, 3, 4, 5, 6 oz), editable decimal custom input and oz/mL switch. Show last amount as a quick-select suggestion, not as pre-submitted record.
- Required bottle quantity unless explicit 'Amount not measured' selected. Do not default to 0, treat unknown as distinct NULL + flag. Confirm amount on Save and success.
- Notes field optional: e.g. 'finished bottle', 'spit up' (free text, no diagnosis). Date+time can be edited/backdated with same semantics as diaper.
- Nursing: optionally choose Left / Right / Both / Not tracked, enter start time, duration or finish time if known; allow a simple completed feeding with no duration recorded if not tracked. Offer optional timer only when intentional; never let a running timer prevent saving.
- User should never have to type baby name, parent name, or phone recipients.
- All log types share accessible one-hand UI and correctly handle keyboard, double-tap, screen sleep, page re-entry.

## Conversion and persistence
- Canonical ml with precision, U.S. fluid oz conversion 29.5735295625 ml per fl oz. Display human-rounded quantity as chosen, preserve enough precision so editing does not drift.
- Valid amounts are positive with clearly bounded inputs for data integrity, NOT individualized feeding advice. Explicit 'unknown amount' is supported.
- Breastfeeding records may use optional duration and side but should not invent ounces or convert time to intake.
- Event time vs creation time is explicit; for nursing, derive duration only from two known valid instants, ensure end>=start and avoid impossible negative values.
- Households select default volume unit; individual users may override display preference. Persist stable canonical values.
- Source tag intent must FEED; a malicious request posting diaper under FEED tag is rejected or requires separate dashboard route with a valid authorization path.
- Save event and pending notifications atomically, exactly one event per intentional attempt.

## Timeline rendering
- 'Bottle · Breastmilk · 3.5 oz · 2:10 AM · Logged by Dad', or 'Nursing · Left · 12 min'.
- Latest feed appears on dashboard. 'Time since last feed' uses the most recent occurred_at active event, not most recently entered delayed event.
- Indicate time since last feed as an informative record, not a recommended schedule.
- Editing source, amount, notes, time and method follows audit and concurrency rules from phase 05.
- Provide optional quick 'repeat last feed' action that pre-populates visibly and requires explicit new Save; not a one-click silent duplicate.

## Edge cases to test
- Decimal 3.5 oz, 120 mL and unit toggle; round trips within tested tolerances.
- Unknown amount without fake zero; disallow blank amount unless explicitly unknown.
- Attempt negative, NaN, 9-digit amount, invalid milk type, duration invalid.
- Cross-midnight feeding and daylight-saving transitions.
- Backdate several hours, log two feeds minutes apart and correct newest versus latest-by-occurred_at.
- Parents on separate devices with different display units see same underlying event.
- Retry after network loss does not create duplicate feed or outgoing text.
- Editing a feed after provider SMS triggers warning about previously transmitted info.
- Accessible with keyboard, VoiceOver, reduced motion; no tiny amount chips.

## Non-goals at launch
No formula recommendations, dehydration assessment, pediatric diagnostic charts, AI sleep/feeding prediction, pumped milk freezer inventory, nutrition calculation, or complex multi-stage timer app. These belong in optional phase 13 after proven demand.

## Exit
Working feeding flow, validated canonical storage, tests, and verified simple UI. Commit, proceed to phase 07.