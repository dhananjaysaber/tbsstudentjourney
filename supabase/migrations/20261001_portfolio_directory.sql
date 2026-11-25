-- =====================================================================
-- TBS Student Portfolio · public directory + access requests
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Directory consent on the existing sharing row
--
-- Share tokens are stored hashed, so the landing page cannot open a
-- public portfolio unless the family/admin explicitly lists it. When they
-- tick "List in the TBS Student Portfolio directory" while creating a
-- link, the link token is stored here so the directory can open it.
-- Unticking (or revoking) clears it.
-- ---------------------------------------------------------------------
alter table public.student_journey_sharing
  add column if not exists directory_listed boolean not null default false,
  add column if not exists directory_token text;

comment on column public.student_journey_sharing.directory_listed is
  'Owner consent: show this portfolio (photo + link) on the public landing page.';
comment on column public.student_journey_sharing.directory_token is
  'Raw share token, kept ONLY while directory_listed = true.';

-- Never keep a raw token without consent.
create or replace function public.clear_directory_token()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.directory_listed, false) = false or new.revoked_at is not null then
    new.directory_token := null;
    new.directory_listed := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_directory_token on public.student_journey_sharing;
create trigger trg_clear_directory_token
  before insert or update on public.student_journey_sharing
  for each row execute function public.clear_directory_token();

-- ---------------------------------------------------------------------
-- 2. Access requests for private portfolios
-- Inserted only by the journey-access-request Edge Function (service role).
-- ---------------------------------------------------------------------
create table if not exists public.portfolio_access_requests (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  requester_name text not null check (char_length(requester_name) between 2 and 120),
  requester_email text not null check (char_length(requester_email) between 5 and 200),
  relationship text,
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  reviewer_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  request_ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists portfolio_access_requests_student_idx
  on public.portfolio_access_requests (student_id, status);
create index if not exists portfolio_access_requests_created_idx
  on public.portfolio_access_requests (created_at desc);
create index if not exists portfolio_access_requests_email_idx
  on public.portfolio_access_requests (lower(requester_email), created_at desc);

-- Who may see / act on a student's requests:
--   · Admin / SuperAdmin (all students)
--   · a linked parent
--   · the student themself
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

alter table public.portfolio_access_requests enable row level security;

drop policy if exists "read own portfolio requests" on public.portfolio_access_requests;
create policy "read own portfolio requests"
  on public.portfolio_access_requests
  for select to authenticated
  using (public.can_manage_portfolio(student_id));

drop policy if exists "review own portfolio requests" on public.portfolio_access_requests;
create policy "review own portfolio requests"
  on public.portfolio_access_requests
  for update to authenticated
  using (public.can_manage_portfolio(student_id))
  with check (public.can_manage_portfolio(student_id));

-- No insert/delete policies: the public can only create requests through
-- the Edge Function, which validates and rate-limits them.

-- Reviewers may only change the review fields.
revoke update on public.portfolio_access_requests from authenticated;
grant select on public.portfolio_access_requests to authenticated;
grant update (status, reviewer_note, reviewed_by, reviewed_at)
  on public.portfolio_access_requests to authenticated;
