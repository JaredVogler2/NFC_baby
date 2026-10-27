# Getting started with NFC Baby

Three parts: **owner setup** (once, about 20 minutes), **second parent** (5 minutes), and a
**one-page card** for everyone who logs. Deployment itself is in `docs/DEPLOYMENT.md`.

## Owner setup (once)

1. On your iPhone, open the production site in **Safari** and tap **Email me a sign-in code**,
   using the address set as `BOOTSTRAP_OWNER_EMAIL`. Type the 6-digit code from the email (or tap
   the email's link, then **Finish signing in**).
2. **Set up your family**: family name, your name, the baby's nickname, and the time zone
   (America/New_York unless you live elsewhere), then **Create our family log**. Only this
   address can do this, and only once.
3. **Settings → Members & invites → Invite someone**: enter the other parent's email, choose
   **Parent**, then **Create invite link**. Send them the link yourself (Messages, email). It works
   once, only for that email address, and expires. Other roles:
   - **Caregiver** (sitter, grandparent who helps): can log, and edit only their own entries.
   - **Viewer**: can read, cannot log.
   - Caregivers and viewers never receive automatic texts.
4. **Settings → NFC stickers**: for each sticker choose what it logs (**Wet**, **Poop**,
   **Wet + poop**, **Feeding**), the child, and a label for where it lives (e.g. "Changing table").
   Then tap **Create sticker link**. Creating a sticker logs nothing.
5. Write each link to its sticker. On the sticker's page:
   - **Sticker link (write this to the NFC tag)** → **Copy**.
   - In an NFC writer app (e.g. *NFC Tools*): **Write → Add a record → URL / URI** → paste the
     full `https://…` link → **Write** → hold the iPhone's top edge to the sticker.
   - **Read** the sticker back and check the link matches exactly. It must be the production
     domain, not a preview URL.
   - Optional: once everything works, lock the sticker in the writer app. Locking can't be undone,
     but you can still **Retire** a sticker in the app at any time.
6. Test each sticker. Scan it with the phone unlocked → tap the banner → the right form opens with
   **Sticker check** at the top → **Mark sticker as tested**. Then save one practice entry, check it
   on Home, open it and **Undo this entry**.
7. Mount the stickers where an adult's phone reaches but a child can't peel them off. Use on-metal
   stickers near metal. Print **QR codes** (Settings → NFC stickers → **Print labels & QR codes**) as a backup for when
   NFC is fussy.
8. **Settings → Texts & notifications**: choose **Off** (default), **Share a draft** (you send it
   yourself from Messages), or **Automatic texts** (needs the Twilio setup in
   `docs/DEPLOYMENT.md` §4 and each parent's own verified number and consent).

## Second parent (on their own iPhone)

1. Open the invite link in Safari → sign in with the invited email → **Join the family log**.
2. Scan each sticker once while signed in. This also lets the phone show the form later with no
   signal.
3. Optional: Safari → Share → **Add to Home Screen** for a full-screen app. Stickers still open in
   Safari, so stay signed in there too (see `docs/IPHONE_AND_OFFLINE.md`).
4. If you want automatic texts: Settings → Texts & notifications → add **your own** number, accept,
   and type the code.

## One-page card (print and keep by the changing table)

> **Log it in two taps**
>
> 1. Hold the top of your unlocked iPhone to the sticker → tap the banner.
> 2. Check it says the right thing (**Wet / Poop / Wet + poop / Feeding**) and the right time.
>    For a bottle, choose the amount, or **Amount not measured**.
> 3. Tap the big **Save** button. Wait for the green **Saved** screen.
>
> - Scanning alone never saves anything. No **Saved** screen = not saved.
> - **Can't confirm the save yet** = the phone isn't sure. Tap **Check again**. It never makes a double.
> - **You're offline** → **Keep as pending on this phone**. Open the app when you have signal;
>   it adds the entry then. Until then it is **not** in the shared history and no text was sent.
> - Wrong entry? Open it → **Edit** or **Undo this entry**.
> - Texts: the Saved screen says exactly what happened ("not sent", "draft to share",
>   "sent to the text provider", "delivered"). A save never depends on a text.
> - Sticker not working? Scan the QR code on the label, or use **Log** on Home.

## Day-to-day

- **Home** shows "Last fed" and "Last diaper" by when they happened, today's counts and recent
  entries. It updates when you come back to the app, and every 20 seconds while open.
- **History**: everything, newest first, filter by type or day. Undone entries can be shown.
- **Repeat last feed** on Home pre-fills the last feeding; you still check it and tap Save.
- **Settings → This phone**: night mode, oz/mL display, Shortcut link (optional).
- **Settings → Privacy & export**: download CSV/JSON. The file contains family records, so keep
  it private.

## Signing out on a shared phone

Settings → **Sign out** also removes pending entries and remembered stickers from that phone. Nobody
else's data stays behind.
