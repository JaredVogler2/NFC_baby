-- NFC Baby — core schema.
-- Conventions: all instants are timestamptz (UTC); every family table carries household_id;
-- invariants that matter for safety are enforced here with CHECK / FK constraints, not only in
-- application code. Rollback: this is the base migration; roll back by restoring from backup
-- (see docs/DATA_MANAGEMENT.md) — there is no destructive down-migration for family data.

-- ---------------------------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'parent', 'caregiver', 'viewer');
create type public.care_intent as enum ('WET', 'POOP', 'BOTH', 'FEED');
create type public.event_type as enum ('DIAPER', 'FEED');
create type public.event_subtype as enum ('WET', 'POOP', 'BOTH', 'BOTTLE', 'NURSING');
create type public.event_source as enum ('TAG', 'DASHBOARD', 'SHORTCUT', 'OFFLINE_SYNC');
create type public.event_state as enum ('ACTIVE', 'VOID');
create type public.milk_type as enum ('BREASTMILK', 'FORMULA', 'OTHER', 'UNKNOWN');
create type public.nursing_side as enum ('LEFT', 'RIGHT', 'BOTH', 'UNKNOWN');
create type public.volume_unit as enum ('oz', 'ml');
create type public.notification_mode as enum ('OFF', 'COMPOSE', 'AUTOMATIC');
create type public.outbox_state as enum (
  'PENDING', 'PROCESSING', 'SENT_TO_PROVIDER', 'DELIVERED',
  'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'UNKNOWN', 'CANCELED', 'SUPPRESSED'
);
create type public.audit_action as enum ('CREATE', 'UPDATE', 'VOID');

-- Valid IANA zone? (`at time zone` raises for unknown names.) Marked immutable so it can back a
-- CHECK constraint; the zone list changes rarely and only ever grows.
create function public.is_valid_timezone(tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if tz is null or length(tz) > 64 then
    return false;
  end if;
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Households, people, children
-- ---------------------------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  timezone text not null default 'America/New_York' check (public.is_valid_timezone(timezone)),
  notification_mode public.notification_mode not null default 'OFF',
  default_feed_method public.event_subtype
    check (default_feed_method is null or default_feed_method in ('BOTTLE', 'NURSING')),
  default_volume_unit public.volume_unit not null default 'oz',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  joined_at timestamptz not null default now(),
  disabled_at timestamptz,
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 40),
  date_of_birth date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, household_id)
);
create index children_household_idx on public.children (household_id);

-- ---------------------------------------------------------------------------------------------
-- NFC tags: an opaque token → (household, child, purpose). Not a credential.
-- ---------------------------------------------------------------------------------------------
create table public.nfc_tags (
  id uuid primary key default gen_random_uuid(),
  -- 128 random bits, Crockford base32 (lowercase, no i/l/o/u), 26 characters.
  token text not null unique check (token ~ '^[0-9a-hjkmnp-tv-z]{26}$'),
  household_id uuid not null references public.households (id) on delete cascade,
  child_id uuid not null,
  purpose public.care_intent not null,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tested_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id),
  foreign key (child_id, household_id) references public.children (id, household_id),
  check ((revoked_at is null) = (revoked_by is null))
);
create index nfc_tags_household_idx on public.nfc_tags (household_id);

-- ---------------------------------------------------------------------------------------------
-- Care events
-- ---------------------------------------------------------------------------------------------
create table public.care_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  child_id uuid not null,
  event_type public.event_type not null,
  subtype public.event_subtype not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  updated_by uuid references auth.users (id),
  source public.event_source not null,
  source_tag_id uuid references public.nfc_tags (id),
  notes text check (notes is null or char_length(notes) between 1 and 500),
  state public.event_state not null default 'ACTIVE',
  voided_at timestamptz,
  voided_by uuid references auth.users (id),
  void_reason text check (void_reason is null or char_length(void_reason) <= 200),
  revision integer not null default 1 check (revision >= 1),
  idempotency_key uuid not null,
  request_hash text not null check (char_length(request_hash) between 8 and 128),
  foreign key (child_id, household_id) references public.children (id, household_id),
  unique (created_by, idempotency_key),
  unique (id, subtype),
  -- Impossible type/subtype combinations cannot be stored.
  check (
    (event_type = 'DIAPER' and subtype in ('WET', 'POOP', 'BOTH'))
    or (event_type = 'FEED' and subtype in ('BOTTLE', 'NURSING'))
  ),
  check (source <> 'TAG' or source_tag_id is not null),
  check ((state = 'VOID') = (voided_at is not null and voided_by is not null))
);
create index care_events_timeline_idx
  on public.care_events (household_id, child_id, occurred_at desc, created_at desc, id desc);
create index care_events_active_type_idx
  on public.care_events (child_id, event_type, occurred_at desc) where state = 'ACTIVE';
create index care_events_author_recent_idx on public.care_events (created_by, created_at desc);

create table public.feeding_details (
  event_id uuid primary key,
  feed_method public.event_subtype not null check (feed_method in ('BOTTLE', 'NURSING')),
  milk_type public.milk_type,
  -- Canonical millilitres; entered value + unit kept so 3.5 oz stays exactly 3.5 oz.
  amount_ml numeric(9, 4) check (amount_ml is null or (amount_ml > 0 and amount_ml <= 500)),
  amount_unknown boolean not null default false,
  amount_entered_value numeric(9, 4) check (amount_entered_value is null or amount_entered_value > 0),
  amount_entered_unit public.volume_unit,
  side public.nursing_side,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 14400),
  ended_at timestamptz,
  foreign key (event_id, feed_method) references public.care_events (id, subtype)
    on update cascade on delete cascade,
  check (
    (
      feed_method = 'BOTTLE'
      and milk_type is not null
      and side is null and duration_seconds is null and ended_at is null
      and (
        (amount_unknown and amount_ml is null and amount_entered_value is null and amount_entered_unit is null)
        or (not amount_unknown and amount_ml is not null and amount_entered_value is not null and amount_entered_unit is not null)
      )
    )
    or (
      feed_method = 'NURSING'
      and milk_type is null and amount_ml is null and not amount_unknown
      and amount_entered_value is null and amount_entered_unit is null
    )
  )
);

-- Every FEED event must have exactly one details row by the end of its transaction.
create function public.assert_feed_details()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_type = 'FEED' and not exists (
    select 1 from public.feeding_details d where d.event_id = new.id
  ) then
    raise exception 'FEED event % has no feeding details', new.id using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger care_events_feed_details_present
  after insert or update on public.care_events
  deferrable initially deferred
  for each row execute function public.assert_feed_details();

-- Append-only audit trail of every create / correction / void.
create table public.care_event_audit (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.care_events (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  actor_id uuid not null references auth.users (id),
  action public.audit_action not null,
  revision integer not null,
  changes jsonb not null,
  created_at timestamptz not null default now()
);
create index care_event_audit_event_idx on public.care_event_audit (event_id, id);

create function public.forbid_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only an explicit, owner-confirmed household purge may remove audit rows.
  if tg_op = 'DELETE' and coalesce(current_setting('nfcb.allow_purge', true), '') = 'on' then
    return old;
  end if;
  raise exception 'care_event_audit is append-only' using errcode = '42501';
end;
$$;

create trigger care_event_audit_append_only
  before update or delete on public.care_event_audit
  for each row execute function public.forbid_audit_mutation();

-- Events are never physically deleted except in an explicit household purge.
create function public.forbid_event_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('nfcb.allow_purge', true), '') = 'on' then
    return old;
  end if;
  raise exception 'care events are voided, never deleted' using errcode = '42501';
end;
$$;

create trigger care_events_no_delete
  before delete on public.care_events
  for each row execute function public.forbid_event_delete();

-- ---------------------------------------------------------------------------------------------
-- Invites (hashed, single-use, expiring)
-- ---------------------------------------------------------------------------------------------
create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index household_invites_household_idx on public.household_invites (household_id);

-- ---------------------------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------------------------
create table public.notification_preferences (
  household_id uuid not null,
  user_id uuid not null,
  auto_sms_enabled boolean not null default false,
  categories public.care_intent[] not null default '{WET,POOP,BOTH,FEED}',
  include_own_entries boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '06:00',
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id)
    on delete cascade
);

-- Phone numbers: encrypted by the app (AES-256-GCM) before they get here; RLS denies every
-- browser role. Consent and verification are recorded separately from care records.
create table public.notification_contacts (
  household_id uuid not null,
  user_id uuid not null,
  phone_ciphertext text not null,
  phone_hmac text not null check (phone_hmac ~ '^[0-9a-f]{64}$'),
  phone_last4 text not null check (phone_last4 ~ '^[0-9]{4}$'),
  set_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verification_code_hash text,
  verification_expires_at timestamptz,
  verification_attempts integer not null default 0,
  verification_sends integer not null default 0,
  last_verification_sent_at timestamptz,
  verified_at timestamptz,
  consent_at timestamptz,
  consent_text_version text,
  opted_out_at timestamptz,
  primary key (household_id, user_id),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id)
    on delete cascade
);
create index notification_contacts_hmac_idx on public.notification_contacts (phone_hmac);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  event_id uuid not null references public.care_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null default 'SMS' check (channel in ('SMS')),
  notification_revision integer not null default 1,
  state public.outbox_state not null default 'PENDING',
  reason text check (reason is null or reason ~ '^[A-Z_]{2,40}$'),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  provider text,
  provider_message_id text,
  provider_status text,
  provider_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  unique (event_id, user_id, channel, notification_revision)
);
create index notification_outbox_due_idx
  on public.notification_outbox (next_attempt_at)
  where state in ('PENDING', 'FAILED_RETRYABLE');
create index notification_outbox_recipient_recent_idx
  on public.notification_outbox (user_id, created_at desc);
create unique index notification_outbox_provider_msg_idx
  on public.notification_outbox (provider_message_id) where provider_message_id is not null;

-- Owner-initiated "send a test text" log (one message, explicit confirmation).
create table public.notification_tests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  state public.outbox_state not null,
  provider_message_id text,
  provider_error_code text,
  created_at timestamptz not null default now()
);

-- updated_at maintenance
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger households_touch before update on public.households
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger nfc_tags_touch before update on public.nfc_tags
  for each row execute function public.touch_updated_at();
create trigger notification_preferences_touch before update on public.notification_preferences
  for each row execute function public.touch_updated_at();
create trigger notification_contacts_touch before update on public.notification_contacts
  for each row execute function public.touch_updated_at();
create trigger notification_outbox_touch before update on public.notification_outbox
  for each row execute function public.touch_updated_at();
