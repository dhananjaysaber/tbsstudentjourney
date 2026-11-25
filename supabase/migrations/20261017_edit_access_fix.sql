-- =====================================================================
-- TBS Student Portfolio · Who can edit & save (run AFTER 20261016)
--
-- 1. FIX: the "public visibility" guard crashed for everyone who isn't
--    an Admin ("record new has no field is_public / profile_public"),
--    so students, parents and coaches couldn't save. Same protection,
--    now safe on every table.
-- 2. PARENTS: can add and edit their child's moments (and photos), the
--    same as the student. Verified moments still go back to TBS for
--    re-verification when changed.
-- 3. COACHES: only the students in the teams they coach (Panthers
--    can_access_team), for the profile (About me) and moments. They no
--    longer see or edit other students. Admin / SuperAdmin unchanged.
--
-- Students' own rules are unchanged. Safe to re-run.
-- =====================================================================

begin;

-- 1. Visibility guard that works on every table --------------------------
create or replace function public.journey_guard_public_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  field text := case when tg_table_name = 'student_journey_profiles' then 'profile_public' else 'is_public' end;
begin
  -- Admin / SuperAdmin or the trusted backend
  if public.journey_is_privileged() then
    return new;
  end if;

  -- Read the field by name, so a table without it can't crash the save
  if (to_jsonb(new) ->> field) is distinct from (to_jsonb(old) ->> field) then
    raise exception 'Only a Journey administrator can change public visibility';
  end if;

  return new;
end;
$$;

-- 2. Coach → only their own players ---------------------------------------
create or replace function public.journey_coach_can(p_student_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.journey_is_coach()
     and exists (
       select 1
       from public.team_members tm
       where tm.student_id = p_student_id
         and tm.active is true
         and public.can_access_team(tm.team_id)
     );
$$;
revoke all on function public.journey_coach_can(text) from public;
grant execute on function public.journey_coach_can(text) to authenticated;

-- Drive uploads check this: coaches now only for their players
create or replace function public.journey_can_manage(p_student_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.app_users au
      where au.active = true
        and lower(coalesce(au.role, '')) in ('superadmin', 'admin')
        and (
          au.id = auth.uid()
          or lower(trim(coalesce(au.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
    )
    or exists (
      select 1 from public.app_users au
      where au.active = true
        and au.student_id = p_student_id
        and (
          au.id = auth.uid()
          or lower(trim(coalesce(au.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
    )
    or exists (
      select 1 from public.parent_student_links psl
      where psl.active = true
        and psl.student_id = p_student_id
        and lower(trim(coalesce(psl.parent_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
    or public.journey_coach_can(p_student_id);
$$;

-- Moments: coaches (their players only)
drop policy if exists "Journey coaches read entries" on public.student_journey_entries;
create policy "Journey coaches read entries" on public.student_journey_entries
  for select to authenticated
  using (public.journey_coach_can(student_id));

drop policy if exists "Journey coaches create entries" on public.student_journey_entries;
create policy "Journey coaches create entries" on public.student_journey_entries
  for insert to authenticated
  with check (public.journey_coach_can(student_id) and verification_status in ('draft', 'submitted'));

drop policy if exists "Journey coaches update entries" on public.student_journey_entries;
create policy "Journey coaches update entries" on public.student_journey_entries
  for update to authenticated
  using (public.journey_coach_can(student_id))
  with check (public.journey_coach_can(student_id) and verification_status in ('draft', 'submitted', 'verified'));

drop policy if exists "Journey coaches delete entries" on public.student_journey_entries;
create policy "Journey coaches delete entries" on public.student_journey_entries
  for delete to authenticated
  using (public.journey_coach_can(student_id) and verification_status in ('draft', 'submitted', 'rejected'));

-- Photos on moments: coaches (their players only)
drop policy if exists "Journey coaches read evidence" on public.student_journey_evidence;
create policy "Journey coaches read evidence" on public.student_journey_evidence
  for select to authenticated
  using (public.journey_coach_can(student_id));

drop policy if exists "Journey coaches create evidence" on public.student_journey_evidence;
create policy "Journey coaches create evidence" on public.student_journey_evidence
  for insert to authenticated
  with check (
    public.journey_coach_can(student_id)
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

drop policy if exists "Journey coaches update evidence" on public.student_journey_evidence;
create policy "Journey coaches update evidence" on public.student_journey_evidence
  for update to authenticated
  using (public.journey_coach_can(student_id))
  with check (public.journey_coach_can(student_id) and coalesce(is_public, false) = false);

drop policy if exists "Journey coaches delete evidence" on public.student_journey_evidence;
create policy "Journey coaches delete evidence" on public.student_journey_evidence
  for delete to authenticated
  using (public.journey_coach_can(student_id));

-- Profile (About me): coaches only for their players; Admins keep their own rule
drop policy if exists "portfolio staff read profiles" on public.student_journey_profiles;
drop policy if exists "portfolio staff insert profiles" on public.student_journey_profiles;
drop policy if exists "portfolio staff update profiles" on public.student_journey_profiles;

drop policy if exists "Journey coaches read profiles" on public.student_journey_profiles;
create policy "Journey coaches read profiles" on public.student_journey_profiles
  for select to authenticated
  using (public.journey_coach_can(student_id));

drop policy if exists "Journey coaches create profiles" on public.student_journey_profiles;
create policy "Journey coaches create profiles" on public.student_journey_profiles
  for insert to authenticated
  with check (public.journey_coach_can(student_id));

drop policy if exists "Journey coaches update profiles" on public.student_journey_profiles;
create policy "Journey coaches update profiles" on public.student_journey_profiles
  for update to authenticated
  using (public.journey_coach_can(student_id))
  with check (public.journey_coach_can(student_id));

-- 3. Parents: their child's moments and photos, like the student ----------
-- (The app saves a parent's moment the same way as the student's; the
--  verification guard still sends changed verified moments back to TBS
--  and blocks moments that staff manage.)
drop policy if exists "Journey parents add child moments" on public.student_journey_entries;
create policy "Journey parents add child moments" on public.student_journey_entries
  for insert to authenticated
  with check (public.journey_is_parent_of(student_id));

drop policy if exists "Journey parents edit child moments" on public.student_journey_entries;
create policy "Journey parents edit child moments" on public.student_journey_entries
  for update to authenticated
  using (public.journey_is_parent_of(student_id))
  with check (public.journey_is_parent_of(student_id));

drop policy if exists "Journey parents remove child moments" on public.student_journey_entries;
create policy "Journey parents remove child moments" on public.student_journey_entries
  for delete to authenticated
  using (public.journey_is_parent_of(student_id) and source_type in ('student', 'parent'));

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
          and e.source_type in ('student', 'parent')
      )
    )
  );

drop policy if exists "Journey parents edit child photos" on public.student_journey_evidence;
create policy "Journey parents edit child photos" on public.student_journey_evidence
  for update to authenticated
  using (public.journey_is_parent_of(student_id))
  with check (public.journey_is_parent_of(student_id) and coalesce(is_public, false) = false);

drop policy if exists "Journey parents remove child photos" on public.student_journey_evidence;
create policy "Journey parents remove child photos" on public.student_journey_evidence
  for delete to authenticated
  using (public.journey_is_parent_of(student_id));

-- The verification guard: parents may edit their child's student/parent
-- moments (before, only the student could). Everything else unchanged.
do $$
declare
  body text;
begin
  select pg_get_functiondef(p.oid) into body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'student_journey_guard_entry_verification';

  if body is not null and position('old.source_type <> ''student''' in body) > 0 then
    body := replace(body,
      'if old.source_type <> ''student'' then',
      'if old.source_type not in (''student'', ''parent'') then');
    execute body;
  end if;
end $$;

commit;

select 'OK' as edit_access_fix,
  (select count(*) from pg_policies where schemaname = 'public'
     and policyname in ('Journey coaches update profiles', 'Journey parents edit child moments')) as new_rules_2;
