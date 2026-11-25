-- =====================================================================
-- TBS Student Portfolio · Edit any moment, whoever added it (run AFTER 20261017)
--
-- A student (and their parent, and their coach) can now edit and save
-- every moment on the student's Journey, including ones an Admin added
-- for them (e.g. a ManageBac import). Before, those were "staff-managed"
-- and only Admins could touch them.
--
-- Unchanged protections:
--   · Changing a VERIFIED moment sends it back to TBS ("submitted").
--   · Only Admin / SuperAdmin verify or make anything public.
--   · Verified moments added by staff can't be deleted by students,
--     parents or coaches (only Admins).
-- Safe to re-run.
-- =====================================================================

begin;

-- 1. The verification guard: no more "staff-managed" block --------------
do $$
declare
  body text;
begin
  select pg_get_functiondef(p.oid) into body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'student_journey_guard_entry_verification';

  if body is not null then
    body := replace(body, 'if old.source_type not in (''student'', ''parent'') then', 'if false then');
    body := replace(body, 'if old.source_type <> ''student'' then', 'if false then');
    execute body;
  end if;
end $$;

-- 2. Photos: students can manage photos on any of their own moments -------
drop policy if exists "Journey students create own evidence" on public.student_journey_evidence;
create policy "Journey students create own evidence" on public.student_journey_evidence
  for insert to authenticated
  with check (
    student_id = public.journey_current_student_id()
    and (
      (entry_id is null and media_role in ('profile_photo', 'hero_banner'))
      or exists (
        select 1 from public.student_journey_entries e
        where e.id = student_journey_evidence.entry_id
          and e.student_id = public.journey_current_student_id()
      )
    )
  );

drop policy if exists "Journey students update own evidence" on public.student_journey_evidence;
create policy "Journey students update own evidence" on public.student_journey_evidence
  for update to authenticated
  using (student_id = public.journey_current_student_id())
  with check (
    student_id = public.journey_current_student_id()
    and (
      (entry_id is null and media_role in ('profile_photo', 'hero_banner'))
      or exists (
        select 1 from public.student_journey_entries e
        where e.id = student_journey_evidence.entry_id
          and e.student_id = public.journey_current_student_id()
      )
    )
  );

drop policy if exists "Journey students delete own evidence" on public.student_journey_evidence;
create policy "Journey students delete own evidence" on public.student_journey_evidence
  for delete to authenticated
  using (student_id = public.journey_current_student_id());

-- Parents: photos on any of their child's moments
drop policy if exists "Journey parents add child photos" on public.student_journey_evidence;
create policy "Journey parents add child photos" on public.student_journey_evidence
  for insert to authenticated
  with check (
    public.journey_is_parent_of(student_id)
    and coalesce(is_public, false) = false
    and (
      (entry_id is null and media_role in ('profile_photo', 'hero_banner'))
      or exists (
        select 1 from public.student_journey_entries e
        where e.id = student_journey_evidence.entry_id
          and e.student_id = student_journey_evidence.student_id
      )
    )
  );

-- 3. Removing moments: any moment that isn't a staff-verified record ------
drop policy if exists "Journey students remove own moments" on public.student_journey_entries;
create policy "Journey students remove own moments" on public.student_journey_entries
  for delete to authenticated
  using (
    student_id = public.journey_current_student_id()
    and not (source_type = 'staff' and verification_status = 'verified')
  );

drop policy if exists "Journey parents remove child moments" on public.student_journey_entries;
create policy "Journey parents remove child moments" on public.student_journey_entries
  for delete to authenticated
  using (
    public.journey_is_parent_of(student_id)
    and not (source_type = 'staff' and verification_status = 'verified')
  );

commit;

select 'OK' as edit_any_moment,
  (select position('if false then' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'student_journey_guard_entry_verification') as staff_moments_editable;
