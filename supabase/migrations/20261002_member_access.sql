-- =====================================================================
-- TBS Student Portfolio · member access model (run AFTER 20261001)
--
-- Policy:
--   · Visitors (not signed in) see initials only. Nothing is public.
--   · Members (parents, students, staff who can sign in) see every
--     student's name and photo, and can open a portfolio when:
--       – it is their own / their child's, or
--       – the SuperAdmin has opened it to the TBS community, or
--       – the SuperAdmin approved their access request (time-limited).
--   · Only the SuperAdmin reviews requests and changes access.
--
-- Safe to re-run. Supabase will warn about "destructive operations"
-- because section 1 removes the directory-listing columns added by the
-- previous migration (they held share tokens, which the new policy no
-- longer allows). No student, portfolio or evidence data is touched.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------
create or replace function public.is_portfolio_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users u
    where lower(u.email) = lower(auth.jwt() ->> 'email')
      and u.active
      and lower(u.role) = 'superadmin'
  );
$$;

revoke all on function public.is_portfolio_superadmin() from public;
grant execute on function public.is_portfolio_superadmin() to authenticated;

-- ---------------------------------------------------------------------
-- 1. Retire public directory listing (from 20261001)
-- ---------------------------------------------------------------------
drop trigger if exists trg_clear_directory_token on public.student_journey_sharing;
drop function if exists public.clear_directory_token();
alter table public.student_journey_sharing drop column if exists directory_token;
alter table public.student_journey_sharing drop column if exists directory_listed;

-- ---------------------------------------------------------------------
-- 2. "Open to the TBS community" — SuperAdmin-controlled
-- ---------------------------------------------------------------------
alter table public.student_journey_profiles
  add column if not exists community_visible boolean not null default false;

comment on column public.student_journey_profiles.community_visible is
  'SuperAdmin only: any signed-in TBS member may open this portfolio.';

-- Families can still edit their profile, but only a SuperAdmin (or the
-- service role used by Edge Functions) can change community_visible.
create or replace function public.guard_community_visible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_portfolio_superadmin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.community_visible := false;
  else
    new.community_visible := old.community_visible;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_community_visible on public.student_journey_profiles;
create trigger trg_guard_community_visible
  before insert or update on public.student_journey_profiles
  for each row execute function public.guard_community_visible();

-- ---------------------------------------------------------------------
-- 3. Access requests: members or visitors, SuperAdmin-only review
-- ---------------------------------------------------------------------
alter table public.portfolio_access_requests
  add column if not exists requester_type text not null default 'visitor',
  add column if not exists requester_user_id uuid,
  add column if not exists student_hint text;

alter table public.portfolio_access_requests
  drop constraint if exists portfolio_access_requests_requester_type_check;
alter table public.portfolio_access_requests
  add constraint portfolio_access_requests_requester_type_check
  check (requester_type in ('visitor', 'member'));

drop policy if exists "read own portfolio requests" on public.portfolio_access_requests;
drop policy if exists "review own portfolio requests" on public.portfolio_access_requests;
drop policy if exists "superadmin reads requests" on public.portfolio_access_requests;
drop policy if exists "superadmin reviews requests" on public.portfolio_access_requests;
drop policy if exists "member reads own requests" on public.portfolio_access_requests;

create policy "superadmin reads requests"
  on public.portfolio_access_requests
  for select to authenticated
  using (public.is_portfolio_superadmin());

create policy "superadmin reviews requests"
  on public.portfolio_access_requests
  for update to authenticated
  using (public.is_portfolio_superadmin())
  with check (public.is_portfolio_superadmin());

-- Members may see the status of requests they made themselves.
create policy "member reads own requests"
  on public.portfolio_access_requests
  for select to authenticated
  using (
    requester_type = 'member'
    and lower(requester_email) = lower(auth.jwt() ->> 'email')
  );

-- ---------------------------------------------------------------------
-- 4. Access grants (created when the SuperAdmin approves a member)
-- ---------------------------------------------------------------------
create table if not exists public.portfolio_access_grants (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  member_email text not null,
  request_id uuid references public.portfolio_access_requests(id) on delete set null,
  granted_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz
);

create index if not exists portfolio_access_grants_lookup_idx
  on public.portfolio_access_grants (student_id, lower(member_email));

alter table public.portfolio_access_grants enable row level security;

drop policy if exists "superadmin manages grants" on public.portfolio_access_grants;
create policy "superadmin manages grants"
  on public.portfolio_access_grants
  for all to authenticated
  using (public.is_portfolio_superadmin())
  with check (public.is_portfolio_superadmin());

drop policy if exists "member reads own grants" on public.portfolio_access_grants;
create policy "member reads own grants"
  on public.portfolio_access_grants
  for select to authenticated
  using (lower(member_email) = lower(auth.jwt() ->> 'email'));

grant select, insert, update on public.portfolio_access_grants to authenticated;

-- can_manage_portfolio(text) is kept: 20261005 (coach quotes) uses it again.
-- (An earlier version of this file dropped it.)
