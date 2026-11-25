-- School-wide portfolio settings + per-student community access override.
--   portfolio_settings: community_default ('open' | 'closed'), right_click ('enabled' | 'disabled')
--   student_journey_profiles.community_mode: NULL = follow school default, 'open' | 'closed' = override
create table if not exists public.portfolio_settings (
  key text primary key,
  value text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.portfolio_settings enable row level security;

insert into public.portfolio_settings (key, value) values
  ('community_default', 'open'),
  ('right_click', 'enabled')
on conflict (key) do nothing;

alter table public.student_journey_profiles
  add column if not exists community_mode text
  check (community_mode is null or community_mode in ('open', 'closed'));

-- Students closed individually today keep that as an override.
update public.student_journey_profiles set community_mode = 'closed'
where community_closed = true and community_mode is null;

-- Effective access: the student's override, else the school default.
create or replace function public.portfolio_community_open(p_student_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select community_mode from public.student_journey_profiles where student_id = p_student_id),
    (select value from public.portfolio_settings where key = 'community_default'),
    'open'
  ) = 'open';
$$;

-- Readable by everyone (the portfolio page needs right_click).
create or replace function public.portfolio_get_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.portfolio_settings;
$$;

create or replace function public.portfolio_set_setting(p_key text, p_value text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_portfolio_superadmin() then
    raise exception 'Only the SuperAdmin can change this setting';
  end if;
  if p_key = 'community_default' and p_value not in ('open', 'closed') then
    raise exception 'Invalid value';
  elsif p_key = 'right_click' and p_value not in ('enabled', 'disabled') then
    raise exception 'Invalid value';
  elsif p_key not in ('community_default', 'right_click') then
    raise exception 'Unknown setting';
  end if;
  insert into public.portfolio_settings (key, value, updated_by, updated_at)
  values (p_key, p_value, public.award_email(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  return public.portfolio_get_settings();
end;
$$;

-- '' or NULL = follow the school default.
create or replace function public.portfolio_set_community_mode(p_student_id text, p_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_mode text := nullif(trim(coalesce(p_mode, '')), '');
begin
  if not public.is_portfolio_superadmin() then
    raise exception 'Only the SuperAdmin can change this setting';
  end if;
  if v_mode is not null and v_mode not in ('open', 'closed') then
    raise exception 'Invalid value';
  end if;
  insert into public.student_journey_profiles (student_id, community_mode, community_closed)
  values (p_student_id, v_mode, coalesce(v_mode = 'closed', false))
  on conflict (student_id) do update
    set community_mode = v_mode, community_closed = coalesce(v_mode = 'closed', false), updated_at = now();
  return jsonb_build_object(
    'mode', v_mode,
    'open', public.portfolio_community_open(p_student_id),
    'default', (select value from public.portfolio_settings where key = 'community_default')
  );
end;
$$;

-- Only the SuperAdmin (or the service role) may change community fields directly.
create or replace function public.guard_community_visible()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_portfolio_superadmin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.community_visible := false;
    new.community_closed := false;
    new.community_mode := null;
  else
    new.community_visible := old.community_visible;
    new.community_closed := old.community_closed;
    new.community_mode := old.community_mode;
  end if;
  return new;
end;
$$;

grant execute on function public.portfolio_get_settings() to anon, authenticated;
grant execute on function public.portfolio_community_open(text) to authenticated, service_role;
grant execute on function public.portfolio_set_setting(text, text) to authenticated;
grant execute on function public.portfolio_set_community_mode(text, text) to authenticated;

-- right_click_admin: right-click for Admin / SuperAdmin ('enabled' | 'disabled');
-- right_click covers everyone else.
insert into public.portfolio_settings (key, value) values ('right_click_admin', 'enabled')
on conflict (key) do nothing;
-- (portfolio_set_setting re-created to accept 'right_click_admin'; see migration portfolio_settings_right_click_admin)
