-- =====================================================================
-- TBS Student Portfolio · Coaches manage Journey moments (run AFTER 20261011)
--   Coaches (any Panthers coach role: "Coach", "Head Coach", …) can add,
--   import (ManageBac), edit and publish Journey moments and their photos
--   for any student — the same as students do for themselves.
--   · They can't verify: what a coach saves is a draft or goes to TBS
--     for verification ("submitted"), like a student's moment.
--   · Verified moments stay with Admin / SuperAdmin.
-- Existing rules for students, parents and admins are unchanged.
-- Safe to re-run.
-- =====================================================================

-- 1. Who is a coach ----------------------------------------------------
create or replace function public.journey_is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.active = true
      and lower(coalesce(au.role, '')) like '%coach%'
      and (
        au.id = auth.uid()
        or lower(trim(coalesce(au.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
  );
$$;
revoke all on function public.journey_is_coach() from public;
grant execute on function public.journey_is_coach() to authenticated;

-- 2. journey_can_manage (uploads to Drive check this) -------------------
--    Same as before, plus coaches.
create or replace function public.journey_can_manage(p_student_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    /* SuperAdmin / Admin: every student */
    exists (
      select 1 from public.app_users au
      where au.active = true
        and lower(coalesce(au.role, '')) in ('superadmin', 'admin')
        and (
          au.id = auth.uid()
          or lower(trim(coalesce(au.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
    )
    /* Student: their own Journey */
    or exists (
      select 1 from public.app_users au
      where au.active = true
        and au.student_id = p_student_id
        and (
          au.id = auth.uid()
          or lower(trim(coalesce(au.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
    )
    /* Parent: linked child */
    or exists (
      select 1 from public.parent_student_links psl
      where psl.active = true
        and psl.student_id = p_student_id
        and lower(trim(coalesce(psl.parent_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
    /* Coach: any student (NEW) */
    or public.journey_is_coach();
$$;

-- 3. Journey moments ----------------------------------------------------
drop policy if exists "Journey coaches read entries" on public.student_journey_entries;
create policy "Journey coaches read entries" on public.student_journey_entries
  for select to authenticated
  using (public.journey_is_coach());

drop policy if exists "Journey coaches create entries" on public.student_journey_entries;
create policy "Journey coaches create entries" on public.student_journey_entries
  for insert to authenticated
  with check (public.journey_is_coach() and verification_status in ('draft', 'submitted'));

drop policy if exists "Journey coaches update entries" on public.student_journey_entries;
create policy "Journey coaches update entries" on public.student_journey_entries
  for update to authenticated
  using (public.journey_is_coach() and verification_status in ('draft', 'submitted', 'rejected', 'verified'))
  with check (public.journey_is_coach() and verification_status in ('draft', 'submitted'));

drop policy if exists "Journey coaches delete entries" on public.student_journey_entries;
create policy "Journey coaches delete entries" on public.student_journey_entries
  for delete to authenticated
  using (public.journey_is_coach() and verification_status in ('draft', 'submitted', 'rejected'));

-- 4. Photos and files on those moments -----------------------------------
drop policy if exists "Journey coaches read evidence" on public.student_journey_evidence;
create policy "Journey coaches read evidence" on public.student_journey_evidence
  for select to authenticated
  using (public.journey_is_coach());

drop policy if exists "Journey coaches create evidence" on public.student_journey_evidence;
create policy "Journey coaches create evidence" on public.student_journey_evidence
  for insert to authenticated
  with check (
    public.journey_is_coach()
    and coalesce(is_public, false) = false
    and exists (
      select 1 from public.student_journey_entries e
      where e.id = student_journey_evidence.entry_id
        and e.student_id = student_journey_evidence.student_id
    )
  );

drop policy if exists "Journey coaches update evidence" on public.student_journey_evidence;
create policy "Journey coaches update evidence" on public.student_journey_evidence
  for update to authenticated
  using (public.journey_is_coach() and entry_id is not null)
  with check (public.journey_is_coach() and entry_id is not null and coalesce(is_public, false) = false);

drop policy if exists "Journey coaches delete evidence" on public.student_journey_evidence;
create policy "Journey coaches delete evidence" on public.student_journey_evidence
  for delete to authenticated
  using (public.journey_is_coach() and entry_id is not null);

select
  'OK' as coach_journey_access,
  (select bool_or(pg_get_functiondef(p.oid) ilike '%journey_is_coach%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'journey_can_manage') as coaches_can_manage_students;
