# 13 — Post-launch optional enhancements (DO NOT build before all mandatory phases pass)

## Decision rule
This is a backlog, not an invitation to overbuild. Ask whether a feature removes a real repetitive step without creating configuration or medical risk. Prioritize by time saved/week, implementation burden, parental consent, privacy surface and potential to confuse a sleepy user. Implement separately behind feature flags with small reversible commits and tests.

## High-value options
1. **One-scan Shortcuts instant logging**: for diaper-only tag on each parent device, configure an iPhone NFC personal automation that calls an authenticated scoped API with a per-device revocable token and explicit local setup/consent. Critical: cannot reuse naked public tag ID as secret, do not log through GET, replay-proof and revocable tokens, prevent repeated automated scans, offer undo. Note a normal URL sticker alone does not trigger a silent send.
2. **Notification preference tuning**: separate toggles per Wet/Poop/Both/Feed and time window. Parents often may want feeding updates every time but diapers only in summaries. Build opt-in if volume actually warrants it, and never surprise-send backlogged events.
3. **Shared handoff digest**: on demand 'Since you last checked' summary of events and optional diaper inventory; no LLM required; always sourced from verified persisted records.
4. **Bottle and pump add-on**: milk expression time, volume, batch/date label and storage inventory, only if pumping workflows demand it. Do not create clinical milk-storage guidance without verified guidelines.
5. **Family storage / supply stock**: scan a diaper pack or formula shelf to decrement stock or add to private shopping list; user confirmation and easy undo.
6. **Expanded child profiles**: baby vs toddler profiles, caregiver-only access to selected children.
7. **Widgets / Apple Shortcuts**: manual 'Log Wet' home-screen Shortcut pointing to authenticated app, optionally direct API via revocable client-scoped credential.
8. **Keyboard/microphone notes**: optional browser speech-to-text where supported with clear privacy and accurate edit/confirm.
9. **Daily/weekly summaries and CSV charts**: descriptive counts by calendar day; label as records, NOT health guidance.
10. **QR fallback cards**: printable labels with visual color/type encoding, human-readable names and QR; QR opens same protected URL.
11. **Manual reminders**: parent-defined follow-up tasks with explicit opt-in, avoiding automatic feeding/medical timing advice.
12. **Delivery diagnostics**: owner dashboard for per-recipient provider status, queue stuck alerts without showing phone numbers.

## Feature gates
- Never sacrifice one-tap diaper intent UI, confidentiality, no-GET mutation or clear SMS status.
- Every new auto action requires consent and a new audit/test pathway.
- Do not add chatbot, machine learning predictions, health diagnoses, baby-camera surveillance, unapproved medical dosing or an extensive navigation hierarchy.
- Prefer visual simplicity over feature breadth.
- Re-run core NFC, RLS, duplicate and SMS regression tests on each addition.

## Output
Document what was consciously deferred. Only implement a chosen enhancement after product owner approval or clear evidence of usage need, with a scoped requirement, new tests and release note.