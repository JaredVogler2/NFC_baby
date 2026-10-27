-- Volatility corrections reported by `supabase db lint` (plpgsql_check). No behaviour change.

-- _fail only raises an error; it reads and writes nothing, so STABLE is accurate. This lets the
-- read-only (STABLE) functions that call it (get_dashboard, get_notification_overview, …) be
-- classified correctly.
alter function public._fail(text, text, text, text) stable;

-- is_valid_timezone backs a CHECK constraint, so it must be IMMUTABLE. Probe the zone with a
-- fixed instant (to_timestamp(0) and timezone(text, timestamptz) are both immutable) instead of
-- now(), which is only STABLE.
create or replace function public.is_valid_timezone(tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if tz is null or length(tz) > 64 then
    return false;
  end if;
  perform to_timestamp(0) at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;
