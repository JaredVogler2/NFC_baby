-- NFC Baby — care event write path (create / correct / void), read helpers and notification enqueue.
-- Errors use custom SQLSTATEs so the API can map them without parsing text:
--   NB401 unauthenticated · NB403 forbidden · NB404 not found (or not yours) · NB409 conflict
--   NB410 tag revoked · NB422 validation (HINT = field, DETAIL = human message) · NB429 rate limited

alter default privileges revoke execute on functions from public;

-- ---------------------------------------------------------------------------------------------
-- Internal helpers (no grants to browser roles)
-- ---------------------------------------------------------------------------------------------
create function public._fail(p_code text, p_message text, p_field text default null, p_detail text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = p_code, message = p_message, hint = coalesce(p_field, ''), detail = coalesce(p_detail, '');
end;
$$;

create function public._intent_for_subtype(p_subtype public.event_subtype)
returns public.care_intent
language sql
immutable
set search_path = ''
as $$
  select case when p_subtype in ('BOTTLE', 'NURSING') then 'FEED'::public.care_intent
              else p_subtype::text::public.care_intent end
$$;

-- Validate an event time against "now": ≤ 5 min in the future (clock skew), ≤ 366 days old,
-- and > 24 h old only with explicit confirmation.
create function public._check_event_time(p_at timestamptz, p_confirm_old boolean, p_field text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_at > now() + interval '5 minutes' then
    perform public._fail('NB422', 'VALIDATION', p_field, 'That time is in the future.');
  end if;
  if p_at < now() - interval '366 days' then
    perform public._fail('NB422', 'VALIDATION', p_field, 'That time is more than a year ago.');
  end if;
  if p_at < now() - interval '24 hours' and not coalesce(p_confirm_old, false) then
    perform public._fail('NB422', 'CONFIRM_OLD', p_field, 'That time is more than a day ago. Confirm to save it.');
  end if;
end;
$$;

-- Validate + normalise feeding details JSON into a feeding_details row (not inserted).
-- Keys: milkType, amountUnknown, amountValue, amountUnit (bottle); side, durationSeconds, endedAt (nursing).
create function public._build_feeding(
  p_event_id uuid,
  p_method public.event_subtype,
  p_occurred_at timestamptz,
  p_feeding jsonb
)
returns public.feeding_details
language plpgsql
set search_path = ''
as $$
declare
  r public.feeding_details;
  v_value numeric;
  v_unit text;
  v_ended timestamptz;
  v_duration integer;
begin
  if p_feeding is null or jsonb_typeof(p_feeding) <> 'object' then
    perform public._fail('NB422', 'VALIDATION', 'feeding', 'Feeding details are required.');
  end if;
  r.event_id := p_event_id;
  r.feed_method := p_method;
  r.amount_unknown := false;

  if p_method = 'BOTTLE' then
    begin
      r.milk_type := (p_feeding ->> 'milkType')::public.milk_type;
    exception when others then
      perform public._fail('NB422', 'VALIDATION', 'feeding.milkType', 'Choose breastmilk, formula or unknown.');
    end;
    if r.milk_type is null then
      perform public._fail('NB422', 'VALIDATION', 'feeding.milkType', 'Choose breastmilk, formula or unknown.');
    end if;
    if coalesce((p_feeding ->> 'amountUnknown')::boolean, false) then
      if p_feeding ? 'amountValue' and jsonb_typeof(p_feeding -> 'amountValue') <> 'null' then
        perform public._fail('NB422', 'VALIDATION', 'feeding.amountValue', 'Clear the amount or untick "Amount not measured".');
      end if;
      r.amount_unknown := true;
    else
      begin
        v_value := (p_feeding ->> 'amountValue')::numeric;
      exception when others then
        v_value := null;
      end;
      v_unit := p_feeding ->> 'amountUnit';
      if v_value is null then
        perform public._fail('NB422', 'VALIDATION', 'feeding.amountValue', 'Choose an amount or tick "Amount not measured".');
      end if;
      if v_value <= 0 then
        perform public._fail('NB422', 'VALIDATION', 'feeding.amountValue', 'Amount must be more than zero.');
      end if;
      if v_unit not in ('oz', 'ml') or v_unit is null then
        perform public._fail('NB422', 'VALIDATION', 'feeding.amountUnit', 'Choose oz or mL.');
      end if;
      -- Bound-check in unconstrained numeric before assigning to the numeric(9,4) columns.
      if (case when v_unit = 'oz' then v_value * 29.5735295625 else v_value end) > 500 then
        perform public._fail('NB422', 'VALIDATION', 'feeding.amountValue', 'That amount is larger than this app can record (max 500 mL / 16.9 oz). Check the number.');
      end if;
      r.amount_entered_value := round(v_value, 4);
      r.amount_entered_unit := v_unit::public.volume_unit;
      r.amount_ml := case when v_unit = 'oz' then round(v_value * 29.5735295625, 4) else round(v_value, 4) end;
    end if;
  else
    begin
      r.side := coalesce(nullif(p_feeding ->> 'side', ''), 'UNKNOWN')::public.nursing_side;
    exception when others then
      perform public._fail('NB422', 'VALIDATION', 'feeding.side', 'Choose left, right, both or not tracked.');
    end;
    begin
      v_ended := (p_feeding ->> 'endedAt')::timestamptz;
      v_duration := (p_feeding ->> 'durationSeconds')::integer;
    exception when others then
      perform public._fail('NB422', 'VALIDATION', 'feeding.duration', 'Duration is not valid.');
    end;
    if v_ended is not null then
      if v_ended < p_occurred_at then
        perform public._fail('NB422', 'VALIDATION', 'feeding.endedAt', 'The end time is before the start time.');
      end if;
      if v_ended > now() + interval '5 minutes' then
        perform public._fail('NB422', 'VALIDATION', 'feeding.endedAt', 'The end time is in the future.');
      end if;
      -- A known end time is authoritative: derive duration from the two instants.
      v_duration := greatest(1, extract(epoch from (v_ended - p_occurred_at))::integer);
    end if;
    if v_duration is not null and (v_duration < 1 or v_duration > 14400) then
      perform public._fail('NB422', 'VALIDATION', 'feeding.duration', 'Duration must be between 1 minute and 4 hours.');
    end if;
    r.ended_at := v_ended;
    r.duration_seconds := v_duration;
  end if;
  return r;
end;
$$;

-- Flat snapshot of the user-editable fields of an event (used for audit diffs).
create function public._event_snapshot(p_event_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'subtype', e.subtype,
    'childId', e.child_id,
    'occurredAt', e.occurred_at,
    'notes', e.notes,
    'milkType', d.milk_type,
    'amountMl', d.amount_ml,
    'amountUnknown', d.amount_unknown,
    'amountEnteredValue', d.amount_entered_value,
    'amountEnteredUnit', d.amount_entered_unit,
    'side', d.side,
    'durationSeconds', d.duration_seconds,
    'endedAt', d.ended_at
  )
  from public.care_events e
  left join public.feeding_details d on d.event_id = e.id
  where e.id = p_event_id
$$;

create function public._jsonb_diff(p_before jsonb, p_after jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(k, jsonb_build_object('from', p_before -> k, 'to', p_after -> k)),
    '{}'::jsonb
  )
  from (
    select key as k from jsonb_object_keys(p_before) as key
    union
    select key as k from jsonb_object_keys(p_after) as key
  ) keys
  where (p_before -> k) is distinct from (p_after -> k)
$$;

-- Is `p_now` inside a [start, end) local quiet window (window may wrap past midnight)?
create function public._in_quiet_hours(p_now timestamptz, p_tz text, p_start time, p_end time)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_start = p_end then false
    when p_start < p_end then (p_now at time zone p_tz)::time >= p_start and (p_now at time zone p_tz)::time < p_end
    else (p_now at time zone p_tz)::time >= p_start or (p_now at time zone p_tz)::time < p_end
  end
$$;

-- Create the outbox rows for one newly-saved event (same transaction as the event).
-- Only in AUTOMATIC mode, only for adults with a verified number, recorded consent, no opt-out,
-- automatic texts enabled and the category selected. Quiet hours / burst ceiling are recorded as
-- SUPPRESSED so the UI can say exactly why someone was not texted.
create function public._enqueue_notifications(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev public.care_events%rowtype;
  v_hh public.households%rowtype;
  v_intent public.care_intent;
  v_count integer := 0;
  v_state public.outbox_state;
  v_reason text;
  r record;
begin
  select * into v_ev from public.care_events where id = p_event_id;
  select * into v_hh from public.households where id = v_ev.household_id;
  if v_hh.notification_mode <> 'AUTOMATIC' then
    return 0;
  end if;
  v_intent := public._intent_for_subtype(v_ev.subtype);
  for r in
    select m.user_id, p.quiet_hours_enabled, p.quiet_start, p.quiet_end
    from public.household_members m
    join public.notification_preferences p
      on p.household_id = m.household_id and p.user_id = m.user_id
    join public.notification_contacts c
      on c.household_id = m.household_id and c.user_id = m.user_id
    where m.household_id = v_ev.household_id
      and m.disabled_at is null
      and m.role in ('owner', 'parent')
      and p.auto_sms_enabled
      and v_intent = any (p.categories)
      and (p.include_own_entries or m.user_id <> v_ev.created_by)
      and c.verified_at is not null
      and c.consent_at is not null
      and c.opted_out_at is null
  loop
    v_state := 'PENDING';
    v_reason := null;
    if r.quiet_hours_enabled and public._in_quiet_hours(now(), v_hh.timezone, r.quiet_start, r.quiet_end) then
      v_state := 'SUPPRESSED';
      v_reason := 'QUIET_HOURS';
    elsif (
      select count(*) from public.notification_outbox o
      where o.user_id = r.user_id
        and o.created_at > now() - interval '1 hour'
        and o.state not in ('SUPPRESSED', 'CANCELED')
    ) >= 20 then
      v_state := 'SUPPRESSED';
      v_reason := 'RATE_LIMIT';
    end if;
    insert into public.notification_outbox (household_id, event_id, user_id, channel, notification_revision, state, reason)
    values (v_ev.household_id, v_ev.id, r.user_id, 'SMS', 1, v_state, v_reason)
    on conflict (event_id, user_id, channel, notification_revision) do nothing;
    if found then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Create (idempotent)
-- ---------------------------------------------------------------------------------------------
create function public.log_care_event(
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

-- ---------------------------------------------------------------------------------------------
-- Correct (optimistic concurrency + audit)
-- ---------------------------------------------------------------------------------------------
create function public.update_care_event(
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
  if v_ev.revision <> p_expected_revision then
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

-- ---------------------------------------------------------------------------------------------
-- Void ("Undo this entry"): marked, attributed, audited, never deleted
-- ---------------------------------------------------------------------------------------------
create function public.void_care_event(
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
  if v_ev.revision <> p_expected_revision then
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

-- ---------------------------------------------------------------------------------------------
-- Read model (security invoker → RLS of the base tables applies)
-- ---------------------------------------------------------------------------------------------
create view public.care_event_list
with (security_invoker = true)
as
select
  e.id,
  e.household_id,
  e.child_id,
  e.event_type,
  e.subtype,
  e.occurred_at,
  e.created_at,
  e.updated_at,
  e.created_by,
  cp.display_name as created_by_name,
  e.updated_by,
  up.display_name as updated_by_name,
  e.source,
  e.source_tag_id,
  t.label as source_tag_label,
  e.notes,
  e.state,
  e.voided_at,
  e.voided_by,
  vp.display_name as voided_by_name,
  e.void_reason,
  e.revision,
  d.milk_type,
  d.amount_ml,
  d.amount_unknown,
  d.amount_entered_value,
  d.amount_entered_unit,
  d.side,
  d.duration_seconds,
  d.ended_at
from public.care_events e
left join public.feeding_details d on d.event_id = e.id
left join public.profiles cp on cp.user_id = e.created_by
left join public.profiles up on up.user_id = e.updated_by
left join public.profiles vp on vp.user_id = e.voided_by
left join public.nfc_tags t on t.id = e.source_tag_id;

-- Newest occurrence first; (occurred_at, created_at, id) keyset cursor for stable paging.
create function public.list_care_events(
  p_child_id uuid,
  p_intents public.care_intent[] default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_include_void boolean default false,
  p_before_occurred timestamptz default null,
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns setof public.care_event_list
language sql
stable
security invoker
set search_path = ''
as $$
  select l.*
  from public.care_event_list l
  where l.child_id = p_child_id
    and (p_include_void or l.state = 'ACTIVE')
    and (p_intents is null or public._intent_for_subtype(l.subtype) = any (p_intents))
    and (p_from is null or l.occurred_at >= p_from)
    and (p_to is null or l.occurred_at < p_to)
    and (
      p_before_occurred is null
      or (l.occurred_at, l.created_at, l.id) < (p_before_occurred, p_before_created, p_before_id)
    )
  order by l.occurred_at desc, l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

-- Dashboard summary for one child: latest feed / diaper by occurrence (active only), last 5
-- entries, and today's descriptive counts in the family's time zone.
create function public.get_dashboard(p_child_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_child public.children%rowtype;
  v_tz text;
  v_day_start timestamptz;
begin
  select * into v_child from public.children where id = p_child_id;
  if not found then
    perform public._fail('NB404', 'NOT_FOUND');
  end if;
  select timezone into v_tz from public.households where id = v_child.household_id;
  v_day_start := (date_trunc('day', now() at time zone v_tz)) at time zone v_tz;
  return jsonb_build_object(
    'serverTime', now(),
    'dayStart', v_day_start,
    'lastFeed', (
      select to_jsonb(l) from public.care_event_list l
      where l.child_id = p_child_id and l.state = 'ACTIVE' and l.event_type = 'FEED'
      order by l.occurred_at desc, l.created_at desc limit 1
    ),
    'lastDiaper', (
      select to_jsonb(l) from public.care_event_list l
      where l.child_id = p_child_id and l.state = 'ACTIVE' and l.event_type = 'DIAPER'
      order by l.occurred_at desc, l.created_at desc limit 1
    ),
    'recent', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.occurred_at desc, x.created_at desc)
      from (
        select * from public.care_event_list l
        where l.child_id = p_child_id and l.state = 'ACTIVE'
        order by l.occurred_at desc, l.created_at desc, l.id desc limit 5
      ) x
    ), '[]'::jsonb),
    'today', (
      select jsonb_build_object(
        'diaperChanges', count(*) filter (where e.event_type = 'DIAPER'),
        'wet', count(*) filter (where e.subtype in ('WET', 'BOTH')),
        'poop', count(*) filter (where e.subtype in ('POOP', 'BOTH')),
        'bottles', count(*) filter (where e.subtype = 'BOTTLE'),
        'bottleMl', coalesce(sum(d.amount_ml) filter (where e.subtype = 'BOTTLE'), 0),
        'bottlesUnmeasured', count(*) filter (where e.subtype = 'BOTTLE' and d.amount_unknown),
        'nursing', count(*) filter (where e.subtype = 'NURSING')
      )
      from public.care_events e
      left join public.feeding_details d on d.event_id = e.id
      where e.child_id = p_child_id and e.state = 'ACTIVE' and e.occurred_at >= v_day_start
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants for the browser role (authenticated). Internal helpers stay private.
-- ---------------------------------------------------------------------------------------------
revoke all on function public._fail(text, text, text, text) from public, anon, authenticated;
revoke all on function public._intent_for_subtype(public.event_subtype) from public, anon, authenticated;
revoke all on function public._check_event_time(timestamptz, boolean, text) from public, anon, authenticated;
revoke all on function public._build_feeding(uuid, public.event_subtype, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public._event_snapshot(uuid) from public, anon, authenticated;
revoke all on function public._jsonb_diff(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._in_quiet_hours(timestamptz, text, time, time) from public, anon, authenticated;
revoke all on function public._enqueue_notifications(uuid) from public, anon, authenticated;

-- list/dashboard run as invoker and use these helpers; they are pure and safe to expose.
grant execute on function public._intent_for_subtype(public.event_subtype) to authenticated;
grant execute on function public._fail(text, text, text, text) to authenticated;

revoke all on function public.log_care_event(uuid, public.care_intent, public.event_subtype, public.event_source, text, uuid, timestamptz, boolean, text, jsonb) from public, anon;
revoke all on function public.update_care_event(uuid, integer, jsonb, boolean) from public, anon;
revoke all on function public.void_care_event(uuid, integer, text) from public, anon;
revoke all on function public.list_care_events(uuid, public.care_intent[], timestamptz, timestamptz, boolean, timestamptz, timestamptz, uuid, integer) from public, anon;
revoke all on function public.get_dashboard(uuid) from public, anon;

grant execute on function public.log_care_event(uuid, public.care_intent, public.event_subtype, public.event_source, text, uuid, timestamptz, boolean, text, jsonb) to authenticated;
grant execute on function public.update_care_event(uuid, integer, jsonb, boolean) to authenticated;
grant execute on function public.void_care_event(uuid, integer, text) to authenticated;
grant execute on function public.list_care_events(uuid, public.care_intent[], timestamptz, timestamptz, boolean, timestamptz, timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_dashboard(uuid) to authenticated;

revoke all on public.care_event_list from anon;
grant select on public.care_event_list to authenticated;
