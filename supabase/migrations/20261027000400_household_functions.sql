-- NFC Baby — household administration: context, bootstrap, profile, settings, children, tags,
-- invites, members and notification preferences. All SECURITY DEFINER with explicit role checks.

-- ---------------------------------------------------------------------------------------------
-- Who am I, which family, which children
-- ---------------------------------------------------------------------------------------------
create function public.get_my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.household_members%rowtype;
  v_h public.households%rowtype;
begin
  if v_uid is null then
    return null;
  end if;
  select * into v_m
  from public.household_members
  where user_id = v_uid and disabled_at is null
  order by joined_at, household_id
  limit 1;
  if not found then
    return jsonb_build_object(
      'userId', v_uid,
      'displayName', (select display_name from public.profiles where user_id = v_uid),
      'membership', null
    );
  end if;
  select * into v_h from public.households where id = v_m.household_id;
  return jsonb_build_object(
    'userId', v_uid,
    'displayName', (select display_name from public.profiles where user_id = v_uid),
    'membership', jsonb_build_object('householdId', v_m.household_id, 'role', v_m.role),
    'household', jsonb_build_object(
      'id', v_h.id,
      'displayName', v_h.display_name,
      'timezone', v_h.timezone,
      'notificationMode', v_h.notification_mode,
      'defaultFeedMethod', v_h.default_feed_method,
      'defaultVolumeUnit', v_h.default_volume_unit
    ),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nickname', c.nickname, 'archived', c.archived_at is not null)
                       order by c.created_at)
      from public.children c where c.household_id = v_h.id
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'userId', m.user_id,
               'displayName', coalesce(p.display_name, 'Member'),
               'role', m.role,
               'disabled', m.disabled_at is not null)
             order by m.joined_at)
      from public.household_members m
      left join public.profiles p on p.user_id = m.user_id
      where m.household_id = v_h.id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- First-owner bootstrap (service role only; app checks BOOTSTRAP_OWNER_EMAIL first)
-- ---------------------------------------------------------------------------------------------
create function public.bootstrap_household(
  p_user_id uuid,
  p_household_name text,
  p_timezone text,
  p_child_nickname text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  -- Serialize concurrent bootstrap attempts.
  perform pg_advisory_xact_lock(hashtext('nfcb.bootstrap'));
  if exists (select 1 from public.households) then
    perform public._fail('NB409', 'ALREADY_BOOTSTRAPPED');
  end if;
  if not public.is_valid_timezone(p_timezone) then
    perform public._fail('NB422', 'VALIDATION', 'timezone', 'Unknown time zone.');
  end if;
  insert into public.households (display_name, timezone)
  values (btrim(p_household_name), p_timezone)
  returning id into v_household;
  insert into public.profiles (user_id, display_name)
  values (p_user_id, btrim(p_display_name))
  on conflict (user_id) do update set display_name = excluded.display_name;
  insert into public.household_members (household_id, user_id, role)
  values (v_household, p_user_id, 'owner');
  insert into public.children (household_id, nickname)
  values (v_household, btrim(p_child_nickname));
  insert into public.notification_preferences (household_id, user_id)
  values (v_household, p_user_id);
  return v_household;
end;
$$;

create function public.households_exist()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.households)
$$;

-- ---------------------------------------------------------------------------------------------
-- Profile and household settings
-- ---------------------------------------------------------------------------------------------
create function public.update_my_profile(p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform public._fail('NB401', 'UNAUTHENTICATED');
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 40 then
    perform public._fail('NB422', 'VALIDATION', 'displayName', 'Use 1–40 characters.');
  end if;
  insert into public.profiles (user_id, display_name)
  values (v_uid, btrim(p_display_name))
  on conflict (user_id) do update set display_name = excluded.display_name;
end;
$$;

create function public.update_household(
  p_household_id uuid,
  p_display_name text,
  p_timezone text,
  p_default_feed_method public.event_subtype,
  p_default_volume_unit public.volume_unit
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_household_id) then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 60 then
    perform public._fail('NB422', 'VALIDATION', 'displayName', 'Use 1–60 characters.');
  end if;
  if not public.is_valid_timezone(p_timezone) then
    perform public._fail('NB422', 'VALIDATION', 'timezone', 'Unknown time zone.');
  end if;
  if p_default_feed_method is not null and p_default_feed_method not in ('BOTTLE', 'NURSING') then
    perform public._fail('NB422', 'VALIDATION', 'defaultFeedMethod', 'Choose bottle or nursing.');
  end if;
  update public.households
  set display_name = btrim(p_display_name),
      timezone = p_timezone,
      default_feed_method = p_default_feed_method,
      default_volume_unit = p_default_volume_unit
  where id = p_household_id;
end;
$$;

-- AUTOMATIC is only offered by the app when a provider is configured; switching modes never
-- re-sends anything (the dispatcher ignores events older than 30 minutes).
create function public.set_notification_mode(p_household_id uuid, p_mode public.notification_mode)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_household_id) then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;
  update public.households set notification_mode = p_mode where id = p_household_id;
end;
$$;

create function public.upsert_child(
  p_household_id uuid,
  p_child_id uuid,
  p_nickname text,
  p_archived boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_owner(p_household_id) then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;
  if char_length(btrim(coalesce(p_nickname, ''))) not between 1 and 40 then
    perform public._fail('NB422', 'VALIDATION', 'nickname', 'Use 1–40 characters.');
  end if;
  if p_child_id is null then
    insert into public.children (household_id, nickname)
    values (p_household_id, btrim(p_nickname))
    returning id into v_id;
  else
    update public.children
    set nickname = btrim(p_nickname),
        archived_at = case when p_archived then coalesce(archived_at, now()) else null end
    where id = p_child_id and household_id = p_household_id
    returning id into v_id;
    if v_id is null then
      perform public._fail('NB404', 'NOT_FOUND');
    end if;
    if p_archived and not exists (
      select 1 from public.children where household_id = p_household_id and archived_at is null
    ) then
      perform public._fail('NB422', 'VALIDATION', 'archived', 'Keep at least one active child.');
    end if;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- NFC tags
-- ---------------------------------------------------------------------------------------------
-- GET-safe resolver: read-only. Returns null for unknown tokens AND for tags of other households,
-- so a scan cannot distinguish "doesn't exist" from "not yours".
create function public.resolve_tag(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tag public.nfc_tags%rowtype;
  v_child public.children%rowtype;
  v_h public.households%rowtype;
begin
  if auth.uid() is null or p_token is null or p_token !~ '^[0-9a-hjkmnp-tv-z]{26}$' then
    return null;
  end if;
  select * into v_tag from public.nfc_tags where token = p_token;
  if not found or not public.is_member(v_tag.household_id) then
    return null;
  end if;
  select * into v_child from public.children where id = v_tag.child_id;
  select * into v_h from public.households where id = v_tag.household_id;
  return jsonb_build_object(
    'status', case when v_tag.revoked_at is null then 'ACTIVE' else 'REVOKED' end,
    'role', public.my_role(v_tag.household_id),
    'tag', jsonb_build_object(
      'id', v_tag.id, 'token', v_tag.token, 'purpose', v_tag.purpose, 'label', v_tag.label,
      'testedAt', v_tag.tested_at
    ),
    'child', jsonb_build_object('id', v_child.id, 'nickname', v_child.nickname,
                                'archived', v_child.archived_at is not null),
    'household', jsonb_build_object(
      'id', v_h.id,
      'timezone', v_h.timezone,
      'notificationMode', v_h.notification_mode,
      'defaultFeedMethod', v_h.default_feed_method,
      'defaultVolumeUnit', v_h.default_volume_unit
    )
  );
end;
$$;

create function public.create_tag(
  p_token text,
  p_child_id uuid,
  p_purpose public.care_intent,
  p_label text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_id uuid;
begin
  select household_id into v_household from public.children
  where id = p_child_id and archived_at is null;
  if not found or not public.is_member(v_household) then
    perform public._fail('NB404', 'NOT_FOUND', 'childId');
  end if;
  if not public.is_parent_or_owner(v_household) then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;
  if char_length(btrim(coalesce(p_label, ''))) not between 1 and 60 then
    perform public._fail('NB422', 'VALIDATION', 'label', 'Use 1–60 characters.');
  end if;
  if p_token !~ '^[0-9a-hjkmnp-tv-z]{26}$' then
    perform public._fail('NB422', 'VALIDATION', 'token', 'Invalid tag token.');
  end if;
  insert into public.nfc_tags (token, household_id, child_id, purpose, label, created_by)
  values (p_token, v_household, p_child_id, p_purpose, btrim(p_label), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Edit label / child / purpose without rewriting the physical sticker. Revoked tags are final.
create function public.update_tag(
  p_tag_id uuid,
  p_label text,
  p_child_id uuid,
  p_purpose public.care_intent
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag public.nfc_tags%rowtype;
begin
  select * into v_tag from public.nfc_tags where id = p_tag_id for update;
  if not found or not public.is_member(v_tag.household_id) then
    perform public._fail('NB404', 'NOT_FOUND');
  end if;
  if not public.is_parent_or_owner(v_tag.household_id) then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;
  if v_tag.revoked_at is not null then
    perform public._fail('NB410', 'TAG_REVOKED');
  end if;
  if char_length(btrim(coalesce(p_label, ''))) not between 1 and 60 then
    perform public._fail('NB422', 'VALIDATION', 'label', 'Use 1–60 characters.');
  end if;
  if not exists (
    select 1 from public.children
    where id = p_child_id and household_id = v_tag.household_id and archived_at is null
  ) then
    perform public._fail('NB422', 'VALIDATION', 'childId', 'Unknown child.');
  end if;
  update public.nfc_tags
  set label = btrim(p_label),
      child_id = p_child_id,
      purpose = p_purpose,
      -- A changed purpose/child must be re-tested on the physical sticker.
      tested_at = case when purpose = p_purpose and child_id = p_child_id then tested_at else null end
  where id = p_tag_id;
end;
$$;

create function public.revoke_tag(p_tag_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag public.nfc_tags%rowtype;
begin
  select * into v_tag from public.nfc_tags where id = p_tag_id for update;
  if not found or not public.is_member(v_tag.household_id) then
    perform public._fail('NB404', 'NOT_FOUND');
  end if;
  if not public.is_parent_or_owner(v_tag.household_id) then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;
  if v_tag.revoked_at is null then
    update public.nfc_tags set revoked_at = now(), revoked_by = auth.uid() where id = p_tag_id;
  end if;
end;
$$;

-- Explicit "routing works" confirmation from the scan-test panel (a POST, never on GET).
create function public.mark_tag_tested(p_tag_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag public.nfc_tags%rowtype;
begin
  select * into v_tag from public.nfc_tags where id = p_tag_id for update;
  if not found or not public.is_member(v_tag.household_id) then
    perform public._fail('NB404', 'NOT_FOUND');
  end if;
  if not public.is_parent_or_owner(v_tag.household_id) then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;
  if v_tag.revoked_at is not null then
    perform public._fail('NB410', 'TAG_REVOKED');
  end if;
  update public.nfc_tags set tested_at = coalesce(tested_at, now()) where id = p_tag_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Invites and members
-- ---------------------------------------------------------------------------------------------
create function public.create_invite(
  p_household_id uuid,
  p_email text,
  p_role public.member_role,
  p_display_name text,
  p_token_hash text,
  p_ttl_hours integer default 168
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_owner(p_household_id) then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    perform public._fail('NB422', 'VALIDATION', 'email', 'Enter a valid email address.');
  end if;
  if p_ttl_hours not between 1 and 336 then
    perform public._fail('NB422', 'VALIDATION', 'ttl', 'Invalid expiry.');
  end if;
  if exists (
    select 1 from public.household_members m
    join auth.users u on u.id = m.user_id
    where m.household_id = p_household_id and lower(u.email) = v_email and m.disabled_at is null
  ) then
    perform public._fail('NB409', 'ALREADY_MEMBER', 'email', 'That person is already a member.');
  end if;
  -- Re-inviting the same email retires older open invites for it.
  update public.household_invites
  set revoked_at = now()
  where household_id = p_household_id and email = v_email
    and accepted_at is null and revoked_at is null;
  insert into public.household_invites (household_id, email, role, display_name, token_hash, created_by, expires_at)
  values (p_household_id, v_email, p_role, nullif(btrim(p_display_name), ''), p_token_hash, auth.uid(),
          now() + make_interval(hours => p_ttl_hours))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.household_invites%rowtype;
begin
  select * into v_inv from public.household_invites where id = p_invite_id for update;
  if not found or not public.is_owner(v_inv.household_id) then
    perform public._fail('NB404', 'NOT_FOUND');
  end if;
  update public.household_invites set revoked_at = coalesce(revoked_at, now()) where id = p_invite_id;
end;
$$;

-- The signed-in user accepts with the raw token's SHA-256; their verified email must match.
create function public.accept_invite(p_token_hash text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.household_invites%rowtype;
begin
  if v_uid is null then
    perform public._fail('NB401', 'UNAUTHENTICATED');
  end if;
  select * into v_inv from public.household_invites where token_hash = p_token_hash for update;
  if not found or v_inv.revoked_at is not null or v_inv.expires_at < now() then
    perform public._fail('NB404', 'INVITE_INVALID');
  end if;
  if v_inv.accepted_at is not null then
    if v_inv.accepted_by = v_uid then
      return v_inv.household_id; -- idempotent re-accept
    end if;
    perform public._fail('NB404', 'INVITE_INVALID');
  end if;
  if v_inv.email <> v_email then
    perform public._fail('NB403', 'INVITE_EMAIL_MISMATCH');
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 40 then
    perform public._fail('NB422', 'VALIDATION', 'displayName', 'Use 1–40 characters.');
  end if;
  insert into public.profiles (user_id, display_name)
  values (v_uid, btrim(p_display_name))
  on conflict (user_id) do update set display_name = excluded.display_name;
  insert into public.household_members (household_id, user_id, role)
  values (v_inv.household_id, v_uid, v_inv.role)
  on conflict (household_id, user_id) do update set role = excluded.role, disabled_at = null;
  insert into public.notification_preferences (household_id, user_id)
  values (v_inv.household_id, v_uid)
  on conflict do nothing;
  update public.household_invites
  set accepted_at = now(), accepted_by = v_uid
  where id = v_inv.id;
  return v_inv.household_id;
end;
$$;

create function public.set_member_role(p_household_id uuid, p_user_id uuid, p_role public.member_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_household_id) then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;
  update public.household_members set role = p_role
  where household_id = p_household_id and user_id = p_user_id;
  if not found then
    perform public._fail('NB404', 'NOT_FOUND');
  end if;
  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id and role = 'owner' and disabled_at is null
  ) then
    perform public._fail('NB422', 'VALIDATION', 'role', 'The family needs at least one owner.');
  end if;
end;
$$;

create function public.set_member_disabled(p_household_id uuid, p_user_id uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_household_id) then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;
  if p_user_id = auth.uid() and p_disabled then
    perform public._fail('NB422', 'VALIDATION', 'userId', 'You cannot deactivate yourself.');
  end if;
  update public.household_members
  set disabled_at = case when p_disabled then coalesce(disabled_at, now()) else null end
  where household_id = p_household_id and user_id = p_user_id;
  if not found then
    perform public._fail('NB404', 'NOT_FOUND');
  end if;
  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id and role = 'owner' and disabled_at is null
  ) then
    perform public._fail('NB422', 'VALIDATION', 'userId', 'The family needs at least one active owner.');
  end if;
  if p_disabled then
    -- A deactivated adult stops receiving automatic texts immediately.
    update public.notification_outbox set state = 'CANCELED', reason = 'MEMBER_DISABLED'
    where household_id = p_household_id and user_id = p_user_id and state in ('PENDING', 'FAILED_RETRYABLE');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Notification preferences (own row). Phone numbers / consent are handled by server code with
-- the service role because they are encrypted in the application.
-- ---------------------------------------------------------------------------------------------
create function public.update_my_notification_prefs(
  p_household_id uuid,
  p_auto_sms_enabled boolean,
  p_categories public.care_intent[],
  p_include_own_entries boolean,
  p_quiet_hours_enabled boolean,
  p_quiet_start time,
  p_quiet_end time
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_parent_or_owner(p_household_id) then
    perform public._fail('NB403', 'FORBIDDEN');
  end if;
  insert into public.notification_preferences (
    household_id, user_id, auto_sms_enabled, categories, include_own_entries,
    quiet_hours_enabled, quiet_start, quiet_end
  )
  values (
    p_household_id, auth.uid(), coalesce(p_auto_sms_enabled, false),
    coalesce(p_categories, '{}'), coalesce(p_include_own_entries, true),
    coalesce(p_quiet_hours_enabled, false), coalesce(p_quiet_start, '22:00'), coalesce(p_quiet_end, '06:00')
  )
  on conflict (household_id, user_id) do update set
    auto_sms_enabled = excluded.auto_sms_enabled,
    categories = excluded.categories,
    include_own_entries = excluded.include_own_entries,
    quiet_hours_enabled = excluded.quiet_hours_enabled,
    quiet_start = excluded.quiet_start,
    quiet_end = excluded.quiet_end;
end;
$$;

-- Masked overview: you see your own status; the owner sees every adult's status. Never digits
-- beyond the last four.
create function public.get_notification_overview(p_household_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner boolean := public.is_owner(p_household_id);
begin
  if not public.is_member(p_household_id) then
    perform public._fail('NB404', 'NOT_FOUND');
  end if;
  return jsonb_build_object(
    'mode', (select notification_mode from public.households where id = p_household_id),
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', m.user_id,
        'displayName', coalesce(pr.display_name, 'Member'),
        'role', m.role,
        'isMe', m.user_id = v_uid,
        'autoSmsEnabled', coalesce(p.auto_sms_enabled, false),
        'categories', coalesce(to_jsonb(p.categories), '["WET","POOP","BOTH","FEED"]'::jsonb),
        'includeOwnEntries', coalesce(p.include_own_entries, true),
        'quietHoursEnabled', coalesce(p.quiet_hours_enabled, false),
        'quietStart', to_char(coalesce(p.quiet_start, '22:00'::time), 'HH24:MI'),
        'quietEnd', to_char(coalesce(p.quiet_end, '06:00'::time), 'HH24:MI'),
        'phoneLast4', c.phone_last4,
        'verified', c.verified_at is not null,
        'consentAt', c.consent_at,
        'optedOut', c.opted_out_at is not null
      ) order by m.joined_at)
      from public.household_members m
      left join public.profiles pr on pr.user_id = m.user_id
      left join public.notification_preferences p on p.household_id = m.household_id and p.user_id = m.user_id
      left join public.notification_contacts c on c.household_id = m.household_id and c.user_id = m.user_id
      where m.household_id = p_household_id
        and m.disabled_at is null
        and m.role in ('owner', 'parent')
        and (v_owner or m.user_id = v_uid)
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------
revoke all on function public.get_my_context() from public, anon;
revoke all on function public.bootstrap_household(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.households_exist() from public, anon, authenticated;
revoke all on function public.update_my_profile(text) from public, anon;
revoke all on function public.update_household(uuid, text, text, public.event_subtype, public.volume_unit) from public, anon;
revoke all on function public.set_notification_mode(uuid, public.notification_mode) from public, anon, authenticated;
revoke all on function public.upsert_child(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.resolve_tag(text) from public, anon;
revoke all on function public.create_tag(text, uuid, public.care_intent, text) from public, anon;
revoke all on function public.update_tag(uuid, text, uuid, public.care_intent) from public, anon;
revoke all on function public.revoke_tag(uuid) from public, anon;
revoke all on function public.mark_tag_tested(uuid) from public, anon;
revoke all on function public.create_invite(uuid, text, public.member_role, text, text, integer) from public, anon;
revoke all on function public.revoke_invite(uuid) from public, anon;
revoke all on function public.accept_invite(text, text) from public, anon;
revoke all on function public.set_member_role(uuid, uuid, public.member_role) from public, anon;
revoke all on function public.set_member_disabled(uuid, uuid, boolean) from public, anon;
revoke all on function public.update_my_notification_prefs(uuid, boolean, public.care_intent[], boolean, boolean, time, time) from public, anon;
revoke all on function public.get_notification_overview(uuid) from public, anon;

grant execute on function public.get_my_context() to authenticated;
grant execute on function public.update_my_profile(text) to authenticated;
grant execute on function public.update_household(uuid, text, text, public.event_subtype, public.volume_unit) to authenticated;
grant execute on function public.upsert_child(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.resolve_tag(text) to authenticated;
grant execute on function public.create_tag(text, uuid, public.care_intent, text) to authenticated;
grant execute on function public.update_tag(uuid, text, uuid, public.care_intent) to authenticated;
grant execute on function public.revoke_tag(uuid) to authenticated;
grant execute on function public.mark_tag_tested(uuid) to authenticated;
grant execute on function public.create_invite(uuid, text, public.member_role, text, text, integer) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.accept_invite(text, text) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, public.member_role) to authenticated;
grant execute on function public.set_member_disabled(uuid, uuid, boolean) to authenticated;
grant execute on function public.update_my_notification_prefs(uuid, boolean, public.care_intent[], boolean, boolean, time, time) to authenticated;
grant execute on function public.get_notification_overview(uuid) to authenticated;
-- set_notification_mode is called by the server only after it has checked provider config;
-- it still enforces owner-only via auth.uid(), so the server calls it with the user's session.
grant execute on function public.set_notification_mode(uuid, public.notification_mode) to authenticated;
