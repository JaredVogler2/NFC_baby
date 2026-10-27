# Data management: storage, backup, export, retention, migrations

## What is stored, where
| Data | Table | Protection |
|---|---|---|
| Family, timezone, settings | `households` | RLS: members read; owner writes via functions |
| Adult display names | `profiles` | RLS: self + co-members |
| Membership + role | `household_members` | RLS: members read; owner manages |
| Child nickname (optional DOB, unused by default) | `children` | RLS: members read |
| NFC tag mapping | `nfc_tags` | RLS: members read; owner/parent manage |
| Care events + feeding details | `care_events`, `feeding_details` | RLS: members read; writes only via functions; **never deleted**, undo = void |
| Audit trail | `care_event_audit` | RLS: owner/parent read; append-only (trigger) |
| Invites | `household_invites` | SHA-256 of token only; owner reads |
| Notification preferences | `notification_preferences` | own row (owner sees all) |
| Phone numbers, consent, verification | `notification_contacts` | AES-256-GCM ciphertext; **no** browser access at all (RLS + revoked grants) |
| Outbox / delivery state | `notification_outbox`, `notification_tests` | no message bodies or numbers stored |

Nothing is sent to analytics or third parties. Application logs contain only route, status,
duration and error codes (`lib/log.ts`).

## Backups
- Hosted Supabase includes daily backups on paid plans (7+ days); the Free plan does not
  include downloadable backups. For a family log, the recommended minimum is the **in-app
  export** (below) once a month, saved somewhere private.
- Full database dump (owner, from a trusted computer):
  `npx supabase db dump --db-url "$PRODUCTION_DB_URL" --data-only -f backup.sql`
  Store it encrypted; it contains your family's records. Never commit it.

## Export (phase 07)
Owners and parents can download CSV or JSON from Settings → Privacy & export. CSV cells that begin
with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'` to prevent spreadsheet formula
injection. Columns are documented on the export page.

## Retention and deletion
- Events are kept until the family deletes them. Undo marks entries `VOID` (kept for the audit
  trail) and hides them from totals and the default timeline.
- Outbox rows (delivery status) are operational data; they can be pruned after 90 days without
  affecting care records.
- **Delete the whole family** (owner): from a trusted computer with the database URL run
  `psql "$PRODUCTION_DB_URL" -c "set nfcb.allow_purge = 'on'; delete from public.households where id = '<household id>';"`
  then remove the auth users in Supabase → Authentication. This is irreversible; export first.
  (A one-click in-app delete is intentionally not offered at launch.)
- A parent can stop texts at any time (Settings → Notifications → Stop texts, or reply STOP).

## Migrations
- Versioned SQL in `supabase/migrations/` (timestamp-prefixed, applied in order, never edited
  after they reach production).
- Apply: `npx supabase db push` (linked project) or `npx supabase migration up --db-url …`.
- CI applies every migration to a fresh database on each run (`supabase start`) and runs the
  integration suite, so a broken migration fails CI before it can reach production.
- **Rollback strategy**: migrations are forward-only. To undo a change, write a new migration that
  reverses it. If a migration fails midway, Postgres rolls back that migration's transaction (each
  file runs in a transaction), so the schema stays at the previous version; fix the file and
  re-run. For data-destroying mistakes, restore from backup (above).
