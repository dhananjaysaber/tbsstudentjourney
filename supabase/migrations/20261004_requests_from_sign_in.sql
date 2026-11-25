-- =====================================================================
-- Requests from the sign-in page
-- People outside TBS can now ask for access from the sign-in page
-- without choosing a student first. They type the student's name; the
-- request is saved with no student yet (student_hint holds the name) and
-- the SuperAdmin matches it to the right student before approving.
-- Safe to run more than once.
-- =====================================================================

alter table public.portfolio_access_requests
  alter column student_id drop not null;

create index if not exists portfolio_access_requests_unmatched_idx
  on public.portfolio_access_requests (created_at desc)
  where student_id is null;
