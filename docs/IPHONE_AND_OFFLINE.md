# iPhone use, Home Screen app and offline behaviour

This explains how NFC Baby behaves on an iPhone, what works without signal, and the iOS
limitations that matter at 2 AM. Everything marked **verified** was checked by automated tests in
Chromium with an iPhone viewport; items marked **needs a real iPhone** have not been verified on a
device yet (see `docs/ACCEPTANCE_MATRIX.md`).

## Add to Home Screen (optional)

1. Open the site in **Safari** and sign in.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. The NFC Baby icon opens Home (`/dashboard`) full-screen, without Safari's address bar.

What you should know (iOS behaviour, not something the app can change):

- **Stickers always open in Safari, not in the Home Screen app.** iOS opens an NFC link through a
  notification banner that launches Safari (or the default browser).
- **The Home Screen app and Safari keep separate sign-ins and separate storage.** Sign in once in
  Safari (for stickers) and once in the Home Screen app (for checking Home/History). Pending
  entries kept on the phone in Safari are synced when NFC Baby is next opened in Safari with signal;
  the Home Screen app cannot see them (and vice versa).
- Both use the same account, so everything that is saved appears in both.

If you only want one place, skip the Home Screen icon and use Safari for everything.

## What happens with no signal

| Situation | What you see | What is stored |
|---|---|---|
| Scan a sticker you have opened before (in this browser, last 30 days) | The same form, with "No connection" at the top | Nothing until you tap Save |
| Scan a sticker never opened in this browser | "You're offline — this page needs a connection" | Nothing |
| Tap Save with no signal | **You're offline — not saved** with **Keep as pending on this phone** / **Try again** | Nothing, unless you tap Keep |
| Tap **Keep as pending on this phone** | **Pending on this device — NOT yet in shared history; no text sent.** | One pending entry on this phone, with the time you tapped Save |
| Connection drops while saving | **Can't confirm the save yet** with **Check again** / **Keep as pending** | The app never assumes it saved or failed |
| Open Home with signal | Pending entries sync automatically, then "N pending entries are now in the shared history" | Pending entry removed only after the server confirms |

Guarantees (each covered by tests):

- A pending entry keeps the **request id of the original Save**. Syncing first asks the server
  whether that id already arrived, then sends the same id again; the server stores at most one
  event per id. Retrying, syncing from two tabs or re-syncing can never create a duplicate.
- A pending entry is never shown as saved, never counted in "Last fed"/"Today", and **no text is
  sent** for it until the server has the event.
- Pending entries belong to the person who made them. If someone else signs in on the phone, those
  entries are not shown or uploaded (they can only be removed), and **signing out deletes all of
  them** together with remembered stickers.
- Entries kept for more than **7 days** are removed with a notice. At most **20** can wait per
  person.
- If the time is more than a day ago when it finally syncs, you are asked to confirm it.

## iOS limitations (true limitations, not app bugs)

- **No background sync.** iOS Safari does not support Background Sync, so pending entries sync
  when you open NFC Baby (Home) with signal — not on their own.
- **Safari may clear website storage** (including pending entries) for sites you have not opened
  in Safari for 7 days. Home Screen apps are exempt. This matches the app's own 7-day limit.
- **Private Browsing**: storage is wiped when the tab closes. If the browser refuses storage the app
  says so and keeps the entry on screen only.
- **NFC reading** needs an unlocked iPhone XS or newer with the screen on; iOS shows a banner you
  must tap. Some phone positions need a second try. The app cannot change this.
- No push notifications are used; parent texts are covered in `docs/SMS_OPTIONS.md`.

## How offline support works (for maintainers)

- `public/sw.js` — production-only service worker. Caches build assets, icons, the manifest and a
  cookie-less `/offline` page. Never caches signed-in pages or API responses. Network-first for
  navigations; `/offline` only when the network fails. Versioned per build; old caches deleted.
- `lib/offline/db.ts`, `drafts.ts`, `sync.ts` — IndexedDB storage, limits, and the sync algorithm.
- `components/offline/*` — offline screen, pending list on Home, notice on sticker screens,
  service-worker registration.
- Decisions: ADR-014 in `docs/ARCHITECTURE_DECISIONS.md`.

## Manual check on a real iPhone (not yet done — needs a device)

1. Safari tab: sign in, scan each of the 4 stickers once online, then turn on Airplane Mode.
2. Scan the Wet sticker → form appears with "No connection" → Save → Keep as pending.
3. Turn Airplane Mode off → open Home → "1 pending entry is now in the shared history" → the
   other parent's phone shows it after refresh, at the original time.
4. Repeat with the Home Screen app open on Home: confirm it works and that stickers open Safari.
5. VoiceOver: each Save button reads its full action (e.g. "Save wet diaper"); banners are announced.
6. Settings → Accessibility → Display & Text Size → Larger Text: forms still usable.
