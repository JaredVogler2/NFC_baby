-- Fixes from the phase-12 adversarial review (REVIEW_REPORT.md). Functions are replaced with
-- `create or replace` so grants are kept; each change is marked with "review:".

-- review: stickers of an archived child can no longer log (P1).
create or replace function public.log_care_event(
  p_client_request_id uuid,
  p_intent public.care_intent,
  p_subtype public.event_subtype,
  p_source public.event_source,
  p_tag_token text default null,
  p_child_id uuid default null,
  p_occurred_at timestamptz default null,
  p_confirm_old boolean default false,
  p_notes text default null,
  p_feeding jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_notes text := nullif(btrim(p_notes), '');
  v_hash text;
  v_existing record;
  v_tag public.nfc_tags%rowtype;
  v_household uuid;
  v_child uuid;
  v_role public.member_role;
  v_occurred timestamptz;
  v_event_type public.event_type;
  v_id uuid;
  v_feed public.feeding_details;
  v_queued integer;
begin
  if v_uid is null then
    perform public._fail('NB401', 'UNAUTHENTICATED');
  end if;
  if p_client_request_id is null then
    perform public._fail('NB422', 'VALIDATION', 'clientRequestId', 'Missing request id.');
  end if;

  v_hash := md5(jsonb_build_object(
    'intent', p_intent, 'subtype', p_subtype, 'source', p_source, 'tag', p_tag_token,
    'child', p_child_id, 'at', extract(epoch from p_occurred_at), 'notes', v_notes,
    'feeding', p_feeding
  )::text);

  -- Replay of an attempt that already committed → return the original event, unchanged.
  select id, request_hash into v_existing
  from public.care_events
  where created_by = v_uid and idempotency_key = p_client_request_id;
  if found then
    if v_existing.request_hash <> v_hash then
      perform public._fail('NB409', 'IDEMPOTENCY_MISMATCH');
    end if;
    return jsonb_build_object('id', v_existing.id, 'replayed', true, 'queued', 0);
  end if;

  -- Resolve household + child from server-side rows only.
  if p_tag_token is not null then
    select * into v_tag from public.nfc_tags where token = p_tag_token;
    if not found or not public.is_member(v_tag.household_id) then
      perform public._fail('NB404', 'NOT_FOUND', 'tag');
    end if;
    if v_tag.revoked_at is not null then
      perform public._fail('NB410', 'TAG_REVOKED', 'tag');
    end if;
    if v_tag.purpose <> p_intent then
      perform public._fail('NB422', 'VALIDATION', 'intent', 'This sticker logs a different kind of entry.');
    end if;
    if p_child_id is not null and p_child_id <> v_tag.child_id then
      perform public._fail('NB422', 'VALIDATION', 'childId', 'This sticker belongs to a different child.');
    end if;
    if p_source not in ('TAG', 'OFFLINE_SYNC') then
      perform public._fail('NB422', 'VALIDATION', 'source', 'Invalid source.');
    end if;
    v_household := v_tag.household_id;
    v_child := v_tag.child_id;
    -- review: a sticker of an archived child is retired (its entries would be invisible).
    if exists (select 1 from public.children c where c.id = v_child and c.archived_at is not null) then
      perform public._fail('NB410', 'TAG_REVOKED', 'tag');
    end if;
  else
    if p_source = 'TAG' then
      perform public._fail('NB422', 'VALIDATION', 'tag', 'A sticker is required for this source.');
    end if;
    select c.household_id into v_household
    from public.children c
    where c.id = p_child_id and c.archived_at is null;
    if not found or not public.is_member(v_household) then
      perform public._fail('NB404', 'NOT_FOUND', 'childId');
    end if;
    v_child := p_child_id;
  end if;

  v_role := public.my_role(v_household);
  if v_role is null or v_role = 'viewer' then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;

  if public._intent_for_subtype(p_subtype) <> p_intent then
    perform public._fail('NB422', 'VALIDATION', 'subtype', 'That entry type does not match.');
  end if;
  v_event_type := case when p_intent = 'FEED' then 'FEED'::public.event_type else 'DIAPER'::public.event_type end;
  if v_event_type = 'DIAPER' and p_feeding is not null and jsonb_typeof(p_feeding) <> 'null' then
    perform public._fail('NB422', 'VALIDATION', 'feeding', 'Diaper entries have no feeding details.');
  end if;

  v_occurred := coalesce(p_occurred_at, now());
  perform public._check_event_time(v_occurred, p_confirm_old, 'occurredAt');

  if (
    select count(*) from public.care_events
    where created_by = v_uid and created_at > now() - interval '10 minutes'
  ) >= 60 then
    perform public._fail('NB429', 'RATE_LIMITED');
  end if;

  insert into public.care_events (
    household_id, child_id, event_type, subtype, occurred_at, created_by, source,
    source_tag_id, notes, idempotency_key, request_hash
  )
  values (
    v_household, v_child, v_event_type, p_subtype, v_occurred, v_uid, p_source,
    v_tag.id, v_notes, p_client_request_id, v_hash
  )
  on conflict (created_by, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    -- A concurrent request with the same key committed first.
    select id, request_hash into v_existing
    from public.care_events
    where created_by = v_uid and idempotency_key = p_client_request_id;
    if v_existing.request_hash <> v_hash then
      perform public._fail('NB409', 'IDEMPOTENCY_MISMATCH');
    end if;
    return jsonb_build_object('id', v_existing.id, 'replayed', true, 'queued', 0);
  end if;

  if v_event_type = 'FEED' then
    v_feed := public._build_feeding(v_id, p_subtype, v_occurred, p_feeding);
    insert into public.feeding_details select v_feed.*;
  end if;

  insert into public.care_event_audit (event_id, household_id, actor_id, action, revision, changes)
  values (v_id, v_household, v_uid, 'CREATE', 1,
          jsonb_build_object('source', p_source) || public._event_snapshot(v_id));

  if v_tag.id is not null then
    update public.nfc_tags
    set last_used_at = now(), use_count = use_count + 1, tested_at = coalesce(tested_at, now())
    where id = v_tag.id;
  end if;

  v_queued := public._enqueue_notifications(v_id);
  return jsonb_build_object('id', v_id, 'replayed', false, 'queued', v_queued);
end;
$$;
-- review: update_care_event requires an expected revision (P2).
create or replace function public.update_care_event(
  p_event_id uuid,
  p_expected_revision integer,
  p_patch jsonb,
  p_confirm_old boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ev public.care_events%rowtype;
  v_role public.member_role;
  v_before jsonb;
  v_after jsonb;
  v_diff jsonb;
  v_subtype public.event_subtype;
  v_occurred timestamptz;
  v_child uuid;
  v_notes text;
  v_feed public.feeding_details;
  v_old_feeding jsonb;
  v_notified boolean;
begin
  if v_uid is null then
    perform public._fail('NB401', 'UNAUTHENTICATED');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    perform public._fail('NB422', 'VALIDATION', 'patch', 'Nothing to change.');
  end if;

  select * into v_ev from public.care_events where id = p_event_id for update;
  if not found or not public.is_member(v_ev.household_id) then
    perform public._fail('NB404', 'NOT_FOUND');
  end if;
  v_role := public.my_role(v_ev.household_id);
  if v_role = 'viewer' or (v_role = 'caregiver' and v_ev.created_by <> v_uid) then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;
  if v_ev.state = 'VOID' then
    perform public._fail('NB409', 'EVENT_VOID', null, 'This entry was undone and cannot be edited.');
  end if;
  -- review: a missing revision is a conflict, never a silent overwrite.
  if p_expected_revision is null or v_ev.revision <> p_expected_revision then
    perform public._fail('NB409', 'REVISION_CONFLICT', null, v_ev.revision::text);
  end if;

  v_before := public._event_snapshot(v_ev.id);
  v_subtype := v_ev.subtype;
  v_occurred := v_ev.occurred_at;
  v_child := v_ev.child_id;
  v_notes := v_ev.notes;

  if p_patch ? 'subtype' then
    begin
      v_subtype := (p_patch ->> 'subtype')::public.event_subtype;
    exception when others then
      perform public._fail('NB422', 'VALIDATION', 'subtype', 'Unknown entry type.');
    end;
    if (v_subtype in ('BOTTLE', 'NURSING')) <> (v_ev.event_type = 'FEED') then
      perform public._fail('NB422', 'VALIDATION', 'subtype', 'A diaper entry cannot become a feeding (undo it and log a new one).');
    end if;
  end if;
  if p_patch ? 'occurredAt' then
    begin
      v_occurred := (p_patch ->> 'occurredAt')::timestamptz;
    exception when others then
      perform public._fail('NB422', 'VALIDATION', 'occurredAt', 'Invalid time.');
    end;
    if v_occurred is null then
      perform public._fail('NB422', 'VALIDATION', 'occurredAt', 'Choose a time.');
    end if;
    if v_occurred is distinct from v_ev.occurred_at then
      perform public._check_event_time(v_occurred, p_confirm_old, 'occurredAt');
    end if;
  end if;
  if p_patch ? 'childId' then
    v_child := (p_patch ->> 'childId')::uuid;
    if not exists (
      select 1 from public.children c
      where c.id = v_child and c.household_id = v_ev.household_id and c.archived_at is null
    ) then
      perform public._fail('NB422', 'VALIDATION', 'childId', 'Unknown child.');
    end if;
  end if;
  if p_patch ? 'notes' then
    v_notes := nullif(btrim(p_patch ->> 'notes'), '');
    if char_length(v_notes) > 500 then
      perform public._fail('NB422', 'VALIDATION', 'notes', 'Notes can be at most 500 characters.');
    end if;
  end if;

  begin
    if v_ev.event_type = 'FEED' and (p_patch ? 'feeding' or v_subtype <> v_ev.subtype or v_occurred <> v_ev.occurred_at) then
      if p_patch ? 'feeding' then
        v_old_feeding := p_patch -> 'feeding';
      else
        -- Re-validate the existing details against the new method/time.
        select jsonb_build_object(
          'milkType', d.milk_type, 'amountUnknown', d.amount_unknown,
          'amountValue', d.amount_entered_value, 'amountUnit', d.amount_entered_unit,
          'side', d.side, 'durationSeconds', d.duration_seconds, 'endedAt', d.ended_at
        ) into v_old_feeding
        from public.feeding_details d where d.event_id = v_ev.id;
        if v_subtype <> v_ev.subtype then
          perform public._fail('NB422', 'VALIDATION', 'feeding', 'Enter the feeding details for the new method.');
        end if;
      end if;
      v_feed := public._build_feeding(v_ev.id, v_subtype, v_occurred, v_old_feeding);
      delete from public.feeding_details where event_id = v_ev.id;
    end if;

    update public.care_events
    set subtype = v_subtype,
        occurred_at = v_occurred,
        child_id = v_child,
        notes = v_notes,
        revision = revision + 1,
        updated_by = v_uid,
        updated_at = now()
    where id = v_ev.id;

    if v_feed.event_id is not null then
      insert into public.feeding_details select v_feed.*;
    end if;

    v_after := public._event_snapshot(v_ev.id);
    v_diff := public._jsonb_diff(v_before, v_after);
    if v_diff = '{}'::jsonb then
      raise exception using errcode = 'NB304', message = 'NO_CHANGE';
    end if;
  exception when sqlstate 'NB304' then
    return jsonb_build_object('id', v_ev.id, 'revision', v_ev.revision, 'changed', false,
      'previouslyNotified', false);
  end;

  insert into public.care_event_audit (event_id, household_id, actor_id, action, revision, changes)
  values (v_ev.id, v_ev.household_id, v_uid, 'UPDATE', v_ev.revision + 1, v_diff);

  select exists (
    select 1 from public.notification_outbox o
    where o.event_id = v_ev.id and o.state in ('PROCESSING', 'SENT_TO_PROVIDER', 'DELIVERED', 'UNKNOWN')
  ) into v_notified;

  return jsonb_build_object('id', v_ev.id, 'revision', v_ev.revision + 1, 'changed', true,
    'previouslyNotified', v_notified);
end;
$$;
-- review: void_care_event requires an expected revision (P2).
create or replace function public.void_care_event(
  p_event_id uuid,
  p_expected_revision integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ev public.care_events%rowtype;
  v_role public.member_role;
  v_reason text := nullif(btrim(p_reason), '');
  v_canceled integer;
  v_notified boolean;
begin
  if v_uid is null then
    perform public._fail('NB401', 'UNAUTHENTICATED');
  end if;
  select * into v_ev from public.care_events where id = p_event_id for update;
  if not found or not public.is_member(v_ev.household_id) then
    perform public._fail('NB404', 'NOT_FOUND');
  end if;
  v_role := public.my_role(v_ev.household_id);
  if v_role = 'viewer' or (v_role = 'caregiver' and v_ev.created_by <> v_uid) then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;
  if v_ev.state = 'VOID' then
    -- Idempotent: a second Undo tap is not an error.
    return jsonb_build_object('id', v_ev.id, 'revision', v_ev.revision, 'alreadyVoid', true,
      'canceledNotifications', 0, 'previouslyNotified', false);
  end if;
  -- review: a missing revision is a conflict, never a silent overwrite.
  if p_expected_revision is null or v_ev.revision <> p_expected_revision then
    perform public._fail('NB409', 'REVISION_CONFLICT', null, v_ev.revision::text);
  end if;
  if char_length(v_reason) > 200 then
    perform public._fail('NB422', 'VALIDATION', 'reason', 'Reason can be at most 200 characters.');
  end if;

  update public.care_events
  set state = 'VOID', voided_at = now(), voided_by = v_uid, void_reason = v_reason,
      revision = revision + 1, updated_by = v_uid, updated_at = now()
  where id = v_ev.id;

  insert into public.care_event_audit (event_id, household_id, actor_id, action, revision, changes)
  values (v_ev.id, v_ev.household_id, v_uid, 'VOID', v_ev.revision + 1,
          jsonb_build_object('state', jsonb_build_object('from', 'ACTIVE', 'to', 'VOID'), 'reason', v_reason));

  update public.notification_outbox
  set state = 'CANCELED', reason = 'EVENT_VOIDED', lease_until = null
  where event_id = v_ev.id and state in ('PENDING', 'FAILED_RETRYABLE');
  get diagnostics v_canceled = row_count;

  select exists (
    select 1 from public.notification_outbox o
    where o.event_id = v_ev.id and o.state in ('PROCESSING', 'SENT_TO_PROVIDER', 'DELIVERED', 'UNKNOWN')
  ) into v_notified;

  return jsonb_build_object('id', v_ev.id, 'revision', v_ev.revision + 1, 'alreadyVoid', false,
    'canceledNotifications', v_canceled, 'previouslyNotified', v_notified);
end;
$$;
-- review: verification-text limits and STOP replies survive removing and re-adding a number (P1).
create table public.notification_verification_sends (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  phone_hmac text not null,
  sent_at timestamptz not null default now()
);
create index notification_verification_sends_user_idx
  on public.notification_verification_sends (user_id, sent_at desc);
create index notification_verification_sends_phone_idx
  on public.notification_verification_sends (phone_hmac, sent_at desc);
alter table public.notification_verification_sends enable row level security;
revoke all on public.notification_verification_sends from anon, authenticated;

-- Numbers that replied STOP (lookup HMAC only). Cleared only by a START reply.
create table public.notification_phone_opt_outs (
  phone_hmac text primary key,
  opted_out_at timestamptz not null default now()
);
alter table public.notification_phone_opt_outs enable row level security;
revoke all on public.notification_phone_opt_outs from anon, authenticated;

create or replace function public.begin_contact_verification(
  p_household_id uuid,
  p_user_id uuid,
  p_code_hash text,
  p_ttl_seconds integer default 600
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.notification_contacts%rowtype;
  v_last timestamptz;
  v_user_sends integer;
  v_phone_sends integer;
begin
  select * into v from public.notification_contacts
  where household_id = p_household_id and user_id = p_user_id for update;
  if not found then
    return 'no_contact';
  end if;
  if exists (select 1 from public.notification_phone_opt_outs where phone_hmac = v.phone_hmac) then
    return 'opted_out';
  end if;
  -- One person at a time, whatever happens to their contact row (removing it resets nothing).
  perform pg_advisory_xact_lock(hashtextextended('nfcb-verify:' || p_user_id::text, 0));
  select max(sent_at), count(*) filter (where sent_at > now() - interval '24 hours')
  into v_last, v_user_sends
  from public.notification_verification_sends where user_id = p_user_id;
  if v_last > now() - interval '60 seconds' then
    return 'too_soon';
  end if;
  if v_user_sends >= 5 then
    return 'daily_limit';
  end if;
  select count(*) into v_phone_sends
  from public.notification_verification_sends
  where phone_hmac = v.phone_hmac and sent_at > now() - interval '24 hours';
  if v_phone_sends >= 5 then
    return 'daily_limit';
  end if;
  insert into public.notification_verification_sends (household_id, user_id, phone_hmac)
  values (p_household_id, p_user_id, v.phone_hmac);
  update public.notification_contacts
  set verification_code_hash = p_code_hash,
      verification_expires_at = now() + make_interval(secs => p_ttl_seconds),
      verification_attempts = 0,
      verification_sends = v_user_sends + 1,
      last_verification_sent_at = now()
  where household_id = p_household_id and user_id = p_user_id;
  return 'ok';
end;
$$;

create or replace function public.confirm_contact_verification(
  p_household_id uuid,
  p_user_id uuid,
  p_code_hash text,
  p_consent_version text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.notification_contacts%rowtype;
begin
  select * into v from public.notification_contacts
  where household_id = p_household_id and user_id = p_user_id for update;
  if not found or v.verification_code_hash is null then
    return 'no_code';
  end if;
  -- review: a code sent before a STOP reply cannot undo that STOP.
  if exists (select 1 from public.notification_phone_opt_outs where phone_hmac = v.phone_hmac) then
    return 'opted_out';
  end if;
  if v.verification_expires_at < now() then
    return 'expired';
  end if;
  if v.verification_attempts >= 5 then
    return 'too_many_attempts';
  end if;
  if v.verification_code_hash <> p_code_hash then
    update public.notification_contacts set verification_attempts = verification_attempts + 1
    where household_id = p_household_id and user_id = p_user_id;
    return 'wrong_code';
  end if;
  update public.notification_contacts
  set verified_at = now(),
      consent_at = now(),
      consent_text_version = p_consent_version,
      opted_out_at = null,
      verification_code_hash = null,
      verification_expires_at = null,
      verification_attempts = 0
  where household_id = p_household_id and user_id = p_user_id;
  insert into public.notification_preferences (household_id, user_id, auto_sms_enabled)
  values (p_household_id, p_user_id, true)
  on conflict (household_id, user_id) do update set auto_sms_enabled = true;
  return 'ok';
end;
$$;
-- review: STOP is remembered per number (not per contact row) and voids any outstanding code.
create or replace function public.record_opt_out(p_phone_hmac text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.notification_phone_opt_outs (phone_hmac) values (p_phone_hmac)
  on conflict (phone_hmac) do nothing;
  with c as (
    update public.notification_contacts
    set opted_out_at = coalesce(opted_out_at, now()),
        verification_code_hash = null,
        verification_expires_at = null
    where phone_hmac = p_phone_hmac
    returning household_id, user_id
  ), p as (
    update public.notification_preferences np
    set auto_sms_enabled = false
    from c
    where np.household_id = c.household_id and np.user_id = c.user_id
    returning 1
  ), o as (
    update public.notification_outbox ob
    set state = 'CANCELED', reason = 'OPTED_OUT', lease_until = null
    from c
    where ob.household_id = c.household_id and ob.user_id = c.user_id
      and ob.state in ('PENDING', 'FAILED_RETRYABLE')
    returning 1
  )
  select count(*)::integer into v_count from c;
  return v_count;
end;
$$;

-- START reply: the number may be verified again (texts stay off until the person re-confirms).
create function public.record_opt_in(p_phone_hmac text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notification_phone_opt_outs where phone_hmac = p_phone_hmac;
  return found;
end;
$$;

-- review: when someone stops being a text recipient (disabled, or no longer owner/parent), their
-- number is deleted and nothing queued for them is sent (P2 privacy).
create function public._drop_contact_when_not_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.disabled_at is not null or new.role not in ('owner', 'parent') then
    update public.notification_outbox
    set state = 'CANCELED', reason = 'MEMBER_DISABLED', lease_until = null
    where household_id = new.household_id and user_id = new.user_id
      and state in ('PENDING', 'FAILED_RETRYABLE');
    update public.notification_preferences
    set auto_sms_enabled = false
    where household_id = new.household_id and user_id = new.user_id;
    delete from public.notification_contacts
    where household_id = new.household_id and user_id = new.user_id;
  end if;
  return new;
end;
$$;
create trigger household_members_drop_contact
  after update of role, disabled_at on public.household_members
  for each row execute function public._drop_contact_when_not_recipient();

-- review: re-check everything immediately before a text is handed to the provider, so a STOP,
-- undo, preference change, quiet hours or mode change after the row was queued is honoured, and
-- entries that happened more than an hour ago (offline sync, backdating) are not texted late.
create function public.outbox_send_check(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select o.state as o_state, o.user_id, e.state as e_state, e.occurred_at, e.created_at,
         e.created_by, e.subtype, h.notification_mode, h.timezone,
         m.disabled_at, m.role,
         k.verified_at, k.consent_at, k.opted_out_at, k.phone_hmac,
         p.auto_sms_enabled, p.categories, p.include_own_entries,
         p.quiet_hours_enabled, p.quiet_start, p.quiet_end
  into r
  from public.notification_outbox o
  join public.care_events e on e.id = o.event_id
  join public.households h on h.id = o.household_id
  left join public.household_members m on m.household_id = o.household_id and m.user_id = o.user_id
  left join public.notification_contacts k on k.household_id = o.household_id and k.user_id = o.user_id
  left join public.notification_preferences p on p.household_id = o.household_id and p.user_id = o.user_id
  where o.id = p_id;
  if not found or r.o_state <> 'PROCESSING' then return 'NOT_PROCESSING'; end if;
  if r.e_state <> 'ACTIVE' then return 'EVENT_VOIDED'; end if;
  -- Queued more than 30 min ago, or the entry itself happened more than an hour ago (offline
  -- sync, backfill): the update is no longer useful as a text.
  if r.created_at < now() - interval '30 minutes' or r.occurred_at < now() - interval '60 minutes' then
    return 'STALE';
  end if;
  if r.notification_mode <> 'AUTOMATIC' then return 'MODE_OFF'; end if;
  if r.disabled_at is not null or r.role is null or r.role not in ('owner', 'parent') then
    return 'MEMBER_DISABLED';
  end if;
  if r.phone_hmac is null or r.opted_out_at is not null
     or exists (select 1 from public.notification_phone_opt_outs x where x.phone_hmac = r.phone_hmac) then
    return 'OPTED_OUT';
  end if;
  if r.verified_at is null or r.consent_at is null then return 'NOT_VERIFIED'; end if;
  if not coalesce(r.auto_sms_enabled, false) then return 'PREFS_OFF'; end if;
  if not (public._intent_for_subtype(r.subtype) = any (r.categories)) then return 'CATEGORY_OFF'; end if;
  if not r.include_own_entries and r.created_by = r.user_id then return 'OWN_ENTRY'; end if;
  if r.quiet_hours_enabled and public._in_quiet_hours(now(), r.timezone, r.quiet_start, r.quiet_end) then
    return 'QUIET_HOURS';
  end if;
  return 'ok';
end;
$$;

create or replace function public.complete_outbox(
  p_id uuid,
  p_state public.outbox_state,
  p_reason text default null,
  p_provider text default null,
  p_message_id text default null,
  p_provider_status text default null,
  p_error_code text default null,
  p_next_attempt_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_state in ('PENDING', 'PROCESSING') then
    raise exception 'invalid completion state %', p_state;
  end if;
  update public.notification_outbox
  set state = p_state,
      reason = p_reason,
      provider = coalesce(p_provider, provider),
      provider_message_id = coalesce(p_message_id, provider_message_id),
      provider_status = coalesce(p_provider_status, provider_status),
      provider_error_code = p_error_code,
      lease_until = null,
      next_attempt_at = coalesce(p_next_attempt_at, next_attempt_at),
      sent_at = case when p_state in ('SENT_TO_PROVIDER', 'DELIVERED') then coalesce(sent_at, now()) else sent_at end
  where id = p_id
    and (
      state = 'PROCESSING'
      -- review: a slow send whose lease expired still records the provider's acceptance and id.
      or (state = 'UNKNOWN' and reason = 'LEASE_EXPIRED' and p_state = 'SENT_TO_PROVIDER')
    );
end;
$$;
-- review: the 3-per-hour test-text limit is reserved atomically before sending (no race).
create function public.reserve_test_text(p_household_id uuid, p_user_id uuid, p_requested_by uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('nfcb-test-text:' || p_household_id::text, 0));
  if (
    select count(*) from public.notification_tests
    where household_id = p_household_id and created_at > now() - interval '1 hour'
  ) >= 3 then
    return null;
  end if;
  insert into public.notification_tests (household_id, user_id, requested_by, state)
  values (p_household_id, p_user_id, p_requested_by, 'PROCESSING')
  returning id into v_id;
  return v_id;
end;
$$;

-- review: one sign-in code request per address per cooldown, for members and strangers alike, so
-- response codes reveal nothing about membership (P2 enumeration).
create table public.auth_code_requests (
  email_hash text primary key,
  last_requested_at timestamptz not null
);
alter table public.auth_code_requests enable row level security;
revoke all on public.auth_code_requests from anon, authenticated;

create function public.take_auth_code_slot(p_email_hash text, p_cooldown_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.auth_code_requests (email_hash, last_requested_at)
  values (p_email_hash, now())
  on conflict (email_hash) do update set last_requested_at = now()
  where public.auth_code_requests.last_requested_at
        < now() - make_interval(secs => greatest(p_cooldown_seconds, 0));
  return found;
end;
$$;

revoke all on function public.record_opt_in(text) from public, anon, authenticated;
revoke all on function public._drop_contact_when_not_recipient() from public, anon, authenticated;
revoke all on function public.outbox_send_check(uuid) from public, anon, authenticated;
revoke all on function public.reserve_test_text(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.take_auth_code_slot(text, integer) from public, anon, authenticated;
