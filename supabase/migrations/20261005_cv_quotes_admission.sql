-- =====================================================================
-- TBS Student Portfolio · CV upgrade (run AFTER 20261004)
--
--   1. students.admission_date      → "At TBS since Apr 2022 · 4 yrs"
--   2. student_coach_quotes         → app drafts, a coach approves
--   3. About me edit stamp          → "Edited by Coach Sharma · 4 Oct"
--   4. Coaches may edit About me    → alongside Admin / SuperAdmin
--
-- Safe to re-run. Adds columns and one new table; no existing data is
-- changed or removed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helper: portfolio staff = Admin, SuperAdmin or any Coach role
-- ---------------------------------------------------------------------
create or replace function public.is_portfolio_staff()
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
      and (
        lower(u.role) in ('admin', 'superadmin')
        or lower(u.role) like '%coach%'
      )
  );
$$;

revoke all on function public.is_portfolio_staff() from public;
grant execute on function public.is_portfolio_staff() to authenticated;

-- Helper (also in 20261001; repeated here so this file runs on its own):
-- the student themself, a linked parent, or Admin / SuperAdmin.
create or replace function public.can_manage_portfolio(sid text)
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
      and (
        lower(u.role) in ('admin', 'superadmin')
        or u.student_id = sid
      )
  )
  or exists (
    select 1 from public.parent_student_links l
    where lower(l.parent_email) = lower(auth.jwt() ->> 'email')
      and l.active
      and l.student_id = sid
  );
$$;

revoke all on function public.can_manage_portfolio(text) from public;
grant execute on function public.can_manage_portfolio(text) to authenticated;

-- ---------------------------------------------------------------------
-- 1. Admission date (filled from the school's Excel — see
--    supabase/ADMISSION_DATE_IMPORT.md)
-- ---------------------------------------------------------------------
alter table public.students
  add column if not exists admission_date date;

comment on column public.students.admission_date is
  'Date the student joined TBS. Shown on the CV as "At TBS since".';

-- ---------------------------------------------------------------------
-- 2. Coach quotes
--    status: draft     → written by the app from Panthers records,
--                        waiting in the Approvals tab
--            approved  → printed on the CV with the coach's name
--            rejected  → never shown
-- ---------------------------------------------------------------------
create table if not exists public.student_coach_quotes (
  id                 uuid primary key default gen_random_uuid(),
  student_id         text not null,
  team_id            text,
  quote_text         text not null,
  status             text not null default 'draft'
                     check (status in ('draft', 'approved', 'rejected')),
  origin             text not null default 'app_draft'
                     check (origin in ('app_draft', 'coach')),
  source_note        text,
  drafted_by_email   text,
  drafted_at         timestamptz not null default now(),
  reviewed_by_email  text,
  reviewed_by_name   text,
  reviewed_by_role   text,
  reviewed_at        timestamptz,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- One open draft per student at a time.
create unique index if not exists student_coach_quotes_one_draft
  on public.student_coach_quotes (student_id)
  where status = 'draft' and active;

create index if not exists student_coach_quotes_student
  on public.student_coach_quotes (student_id, status);

alter table public.student_coach_quotes enable row level security;

drop policy if exists "staff manage coach quotes" on public.student_coach_quotes;
create policy "staff manage coach quotes"
  on public.student_coach_quotes
  for all
  to authenticated
  using (public.is_portfolio_staff())
  with check (public.is_portfolio_staff());

-- Students and linked parents see only approved quotes.
drop policy if exists "family reads approved quotes" on public.student_coach_quotes;
create policy "family reads approved quotes"
  on public.student_coach_quotes
  for select
  to authenticated
  using (status = 'approved' and active and public.can_manage_portfolio(student_id));

-- ---------------------------------------------------------------------
-- 3. About me edit stamp
-- ---------------------------------------------------------------------
alter table public.student_journey_profiles
  add column if not exists about_edited_by_email text,
  add column if not exists about_edited_by_name  text,
  add column if not exists about_edited_by_role  text,
  add column if not exists about_edited_at       timestamptz;

-- ---------------------------------------------------------------------
-- 4. Coaches may read and edit About me (Admins already can)
-- ---------------------------------------------------------------------
drop policy if exists "portfolio staff read profiles" on public.student_journey_profiles;
create policy "portfolio staff read profiles"
  on public.student_journey_profiles
  for select
  to authenticated
  using (public.is_portfolio_staff());

drop policy if exists "portfolio staff insert profiles" on public.student_journey_profiles;
create policy "portfolio staff insert profiles"
  on public.student_journey_profiles
  for insert
  to authenticated
  with check (public.is_portfolio_staff());

drop policy if exists "portfolio staff update profiles" on public.student_journey_profiles;
create policy "portfolio staff update profiles"
  on public.student_journey_profiles
  for update
  to authenticated
  using (public.is_portfolio_staff())
  with check (public.is_portfolio_staff());
