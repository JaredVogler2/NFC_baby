-- NFC Baby — membership helpers, Row Level Security and grants.
-- Model: browsers talk to PostgREST with the signed-in user's JWT. They may READ their own
-- household's rows (filtered by RLS). They can never write tables directly: every mutation goes
-- through a SECURITY DEFINER function that derives actor + household server-side and checks role.

-- ---------------------------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so policies can consult household_members without recursion)
-- ---------------------------------------------------------------------------------------------
create function public.my_role(hh uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.household_members m
  where m.household_id = hh
    and m.user_id = (select auth.uid())
    and m.disabled_at is null
$$;

create function public.is_member(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_role(hh) is not null
$$;

-- owner / parent: full family-record rights (edit anyone's entries, tags, audit, export)
create function public.is_parent_or_owner(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.my_role(hh) in ('owner', 'parent'), false)
$$;

create function public.is_owner(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.my_role(hh) = 'owner', false)
$$;

create function public.shares_household_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.user_id = (select auth.uid())
      and mine.disabled_at is null
      and theirs.user_id = other
  )
$$;

-- ---------------------------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.household_members enable row level security;
alter table public.children enable row level security;
alter table public.nfc_tags enable row level security;
alter table public.care_events enable row level security;
alter table public.feeding_details enable row level security;
alter table public.care_event_audit enable row level security;
alter table public.household_invites enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_contacts enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_tests enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Read policies (authenticated only). No INSERT/UPDATE/DELETE policies exist on purpose.
-- ---------------------------------------------------------------------------------------------
create policy households_read on public.households
  for select to authenticated using (public.is_member(id));

create policy profiles_read on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_household_with(user_id));

create policy members_read on public.household_members
  for select to authenticated using (public.is_member(household_id));

create policy children_read on public.children
  for select to authenticated using (public.is_member(household_id));

create policy tags_read on public.nfc_tags
  for select to authenticated using (public.is_member(household_id));

create policy events_read on public.care_events
  for select to authenticated using (public.is_member(household_id));

create policy feeding_read on public.feeding_details
  for select to authenticated
  using (exists (
    select 1 from public.care_events e
    where e.id = feeding_details.event_id and public.is_member(e.household_id)
  ));

create policy audit_read on public.care_event_audit
  for select to authenticated using (public.is_parent_or_owner(household_id));

create policy invites_read on public.household_invites
  for select to authenticated using (public.is_owner(household_id));

create policy prefs_read on public.notification_preferences
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_owner(household_id));

create policy outbox_read on public.notification_outbox
  for select to authenticated using (public.is_member(household_id));

create policy tests_read on public.notification_tests
  for select to authenticated using (public.is_owner(household_id));

-- notification_contacts: intentionally NO policies → no browser role can read or write it.

-- ---------------------------------------------------------------------------------------------
-- Grants: anon gets nothing; authenticated gets SELECT only (RLS filters rows).
-- ---------------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on
  public.households,
  public.profiles,
  public.household_members,
  public.children,
  public.nfc_tags,
  public.care_events,
  public.feeding_details,
  public.care_event_audit,
  public.household_invites,
  public.notification_preferences,
  public.notification_outbox,
  public.notification_tests
to authenticated;

-- Contacts table: revoke even SELECT for browser roles (defense in depth on top of RLS).
revoke all on public.notification_contacts from anon, authenticated;

grant execute on function public.my_role(uuid) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_parent_or_owner(uuid) to authenticated;
grant execute on function public.is_owner(uuid) to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;
grant execute on function public.is_valid_timezone(text) to authenticated;

-- Future tables/functions created by migrations are not auto-exposed to browser roles.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
