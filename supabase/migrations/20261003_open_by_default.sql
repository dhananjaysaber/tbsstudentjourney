-- =====================================================================
-- TBS Student Portfolio · open to members by default (run AFTER 20261002)
--
-- Every portfolio now opens for signed-in TBS members (parents, students,
-- staff). Only approved moments and public evidence are ever shown.
-- The SuperAdmin can CLOSE an individual portfolio (e.g. at a family's
-- request); closed portfolios need an approved access request.
--
-- Additive only — no data is changed or removed.
-- =====================================================================

alter table public.student_journey_profiles
  add column if not exists community_closed boolean not null default false;

comment on column public.student_journey_profiles.community_closed is
  'SuperAdmin only: when true, other members must request access to this portfolio.';

-- Families can edit their profile, but only the SuperAdmin (or the
-- service role used by Edge Functions) can open/close community access.
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
    new.community_closed := false;
  else
    new.community_visible := old.community_visible;
    new.community_closed := old.community_closed;
  end if;
  return new;
end;
$$;

-- Fast server-side search for the workspace "Browse portfolios" screen.
create index if not exists students_active_year_idx on public.students (active, year_group);
