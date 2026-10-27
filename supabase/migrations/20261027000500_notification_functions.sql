-- NFC Baby — notification delivery (service role only).
-- The dispatcher runs server-side with the service role. These functions make each step atomic:
-- claim (lease, SKIP LOCKED), record the provider result, apply provider status callbacks, STOP
-- opt-outs, and contact verification with attempt limits. None are executable by browser roles.

-- Rows whose lease expired while PROCESSING may or may not have reached the provider (crash after
-- the HTTP call). They are marked UNKNOWN and never re-sent automatically (no duplicate texts).
create function public.expire_outbox_leases()
returns integer
language sql
security definer
set search_path = ''
as $$
  with expired as (
    update public.notification_outbox
    set state = 'UNKNOWN', reason = 'LEASE_EXPIRED', lease_until = null
    where state = 'PROCESSING' and lease_until < now()
    returning 1
  )
  select count(*)::integer from expired
$$;

-- Claim due rows for sending. Each claimed row comes back with everything needed to render and
-- send it; the phone is still ciphertext (decrypted only in server memory).
create function public.claim_outbox(p_event_id uuid default null, p_limit integer default 10, p_lease_seconds integer default 60)
returns table (
  id uuid,
  event_id uuid,
  user_id uuid,
  household_id uuid,
  attempts integer,
  event_state public.event_state,
  event_created_at timestamptz,
  household_mode public.notification_mode,
  household_timezone text,
  household_unit public.volume_unit,
  phone_ciphertext text,
  contact_ok boolean,
  contact_opted_out boolean,
  member_active boolean
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select o.id
    from public.notification_outbox o
    where o.state in ('PENDING', 'FAILED_RETRYABLE')
      and o.next_attempt_at <= now()
      and (p_event_id is null or o.event_id = p_event_id)
    order by o.next_attempt_at
    for update skip locked
    limit least(greatest(p_limit, 1), 50)
  ),
  claimed as (
    update public.notification_outbox o
    set state = 'PROCESSING',
        attempts = o.attempts + 1,
        lease_until = now() + make_interval(secs => greatest(p_lease_seconds, 15))
    from due
    where o.id = due.id
    returning o.*
  )
  select
    c.id, c.event_id, c.user_id, c.household_id, c.attempts,
    e.state, e.created_at,
    h.notification_mode, h.timezone, h.default_volume_unit,
    k.phone_ciphertext,
    (k.verified_at is not null and k.consent_at is not null) as contact_ok,
    (k.opted_out_at is not null) as contact_opted_out,
    (m.disabled_at is null and m.role in ('owner', 'parent')) as member_active
  from claimed c
  join public.care_events e on e.id = c.event_id
  join public.households h on h.id = c.household_id
  left join public.notification_contacts k on k.household_id = c.household_id and k.user_id = c.user_id
  left join public.household_members m on m.household_id = c.household_id and m.user_id = c.user_id
$$;

create function public.complete_outbox(
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
  where id = p_id and state = 'PROCESSING';
end;
$$;

-- Provider delivery callbacks. Only moves forward (never turns DELIVERED back into anything).
create function public.apply_provider_status(p_message_id text, p_status text, p_error_code text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_outbox%rowtype;
  v_new public.outbox_state;
begin
  select * into v_row from public.notification_outbox where provider_message_id = p_message_id for update;
  if not found then
    return 'unknown_message';
  end if;
  v_new := case lower(coalesce(p_status, ''))
    when 'delivered' then 'DELIVERED'
    when 'failed' then 'FAILED_PERMANENT'
    when 'undelivered' then 'FAILED_PERMANENT'
    when 'canceled' then 'FAILED_PERMANENT'
    when 'accepted' then 'SENT_TO_PROVIDER'
    when 'queued' then 'SENT_TO_PROVIDER'
    when 'sending' then 'SENT_TO_PROVIDER'
    when 'sent' then 'SENT_TO_PROVIDER'
    else null
  end::public.outbox_state;
  if v_new is null or v_row.state = 'DELIVERED' or (v_new = 'SENT_TO_PROVIDER' and v_row.state <> 'UNKNOWN' and v_row.state <> 'PROCESSING') then
    update public.notification_outbox set provider_status = lower(p_status) where id = v_row.id and state <> 'DELIVERED';
    return 'ignored';
  end if;
  update public.notification_outbox
  set state = v_new,
      provider_status = lower(p_status),
      provider_error_code = coalesce(p_error_code, provider_error_code),
      delivered_at = case when v_new = 'DELIVERED' then now() else delivered_at end,
      reason = case when v_new = 'FAILED_PERMANENT' then 'CARRIER_FAILED' else reason end
  where id = v_row.id;
  return 'applied';
end;
$$;

-- Inbound STOP (or a 21610 "unsubscribed" provider error): opt the number out everywhere and
-- cancel anything not yet sent to it.
create function public.record_opt_out(p_phone_hmac text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with c as (
    update public.notification_contacts
    set opted_out_at = coalesce(opted_out_at, now())
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

-- Save (or replace) an adult's number. A new or changed number always loses verification and
-- consent: the person must confirm again from their own phone.
create function public.set_contact(
  p_household_id uuid,
  p_user_id uuid,
  p_ciphertext text,
  p_hmac text,
  p_last4 text,
  p_set_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = p_user_id and disabled_at is null and role in ('owner', 'parent')
  ) then
    raise exception using errcode = 'NB422', message = 'VALIDATION', hint = 'userId', detail = 'Only owners and parents can receive texts.';
  end if;
  insert into public.notification_contacts (household_id, user_id, phone_ciphertext, phone_hmac, phone_last4, set_by)
  values (p_household_id, p_user_id, p_ciphertext, p_hmac, p_last4, p_set_by)
  on conflict (household_id, user_id) do update set
    phone_ciphertext = excluded.phone_ciphertext,
    phone_hmac = excluded.phone_hmac,
    phone_last4 = excluded.phone_last4,
    set_by = excluded.set_by,
    verified_at = case when notification_contacts.phone_hmac = excluded.phone_hmac then notification_contacts.verified_at else null end,
    consent_at = case when notification_contacts.phone_hmac = excluded.phone_hmac then notification_contacts.consent_at else null end,
    consent_text_version = case when notification_contacts.phone_hmac = excluded.phone_hmac then notification_contacts.consent_text_version else null end,
    verification_code_hash = null,
    verification_expires_at = null,
    verification_attempts = 0;
  insert into public.notification_preferences (household_id, user_id)
  values (p_household_id, p_user_id)
  on conflict do nothing;
end;
$$;

-- Reserve a verification send (rate limited: one per 60 s, five per 24 h). Returns false if limited.
create function public.begin_contact_verification(
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
begin
  select * into v from public.notification_contacts
  where household_id = p_household_id and user_id = p_user_id for update;
  if not found then
    return 'no_contact';
  end if;
  if v.last_verification_sent_at > now() - interval '60 seconds' then
    return 'too_soon';
  end if;
  if v.verification_sends >= 5 and v.last_verification_sent_at > now() - interval '24 hours' then
    return 'daily_limit';
  end if;
  update public.notification_contacts
  set verification_code_hash = p_code_hash,
      verification_expires_at = now() + make_interval(secs => p_ttl_seconds),
      verification_attempts = 0,
      verification_sends = case when last_verification_sent_at < now() - interval '24 hours' then 1 else verification_sends + 1 end,
      last_verification_sent_at = now()
  where household_id = p_household_id and user_id = p_user_id;
  return 'ok';
end;
$$;

-- Check a code (max 5 attempts per code). On success: verified + consent recorded, texts enabled,
-- any previous opt-out cleared (the person just re-confirmed from their own phone).
create function public.confirm_contact_verification(
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

-- The person stops automatic texts from the app (same effect as replying STOP).
create function public.opt_out_contact(p_household_id uuid, p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_contacts set opted_out_at = coalesce(opted_out_at, now())
  where household_id = p_household_id and user_id = p_user_id;
  update public.notification_preferences set auto_sms_enabled = false
  where household_id = p_household_id and user_id = p_user_id;
  update public.notification_outbox set state = 'CANCELED', reason = 'OPTED_OUT', lease_until = null
  where household_id = p_household_id and user_id = p_user_id and state in ('PENDING', 'FAILED_RETRYABLE');
$$;

revoke all on function public.expire_outbox_leases() from public, anon, authenticated;
revoke all on function public.claim_outbox(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_outbox(uuid, public.outbox_state, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.apply_provider_status(text, text, text) from public, anon, authenticated;
revoke all on function public.record_opt_out(text) from public, anon, authenticated;
revoke all on function public.set_contact(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.begin_contact_verification(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.confirm_contact_verification(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.opt_out_contact(uuid, uuid) from public, anon, authenticated;
