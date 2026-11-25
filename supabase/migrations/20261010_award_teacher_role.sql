-- =====================================================================
-- TBS Student Portfolio · Award Builder, part 5 (run AFTER 20261009)
--   Two teaching roles:
--   · Tutor   (stored as 'class_teacher', unchanged) — their form class,
--             every subject unless limited
--   · Teacher (NEW 'subject_teacher') — the classes they teach, only
--             their own subjects (subjects required)
--   Existing Class Teachers simply show as Tutors. Each award gets
--   Teacher permissions copied from its Tutor permissions.
-- Safe to re-run. Nothing is deleted.
-- =====================================================================

-- 1. Allow the new role ----------------------------------------------
alter table public.award_staff_roles drop constraint if exists award_staff_roles_award_role_check;
alter table public.award_staff_roles add constraint award_staff_roles_award_role_check
  check (award_role in ('key_stage_office', 'head_of_year', 'class_teacher', 'subject_teacher'));

alter table public.award_staff drop constraint if exists award_staff_award_role_check;
alter table public.award_staff add constraint award_staff_award_role_check
  check (award_role is null or award_role in ('key_stage_office', 'head_of_year', 'class_teacher', 'subject_teacher'));

-- 2. Permissions for Teachers on every award (copied from Tutors) -------
update public.awards
set permissions = permissions || jsonb_build_object(
      'subject_teacher',
      coalesce(permissions -> 'class_teacher', '{"view": true, "enter": true, "edit": false, "delete": false}'::jsonb))
where not (permissions ? 'subject_teacher');

alter table public.awards alter column permissions set default '{
  "key_stage_office": {"view": true, "enter": true, "edit": true, "delete": true},
  "head_of_year":     {"view": true, "enter": true, "edit": true, "delete": false},
  "class_teacher":    {"view": true, "enter": true, "edit": false, "delete": false},
  "subject_teacher":  {"view": true, "enter": true, "edit": false, "delete": false}
}'::jsonb;

-- 3. Which students a role covers ---------------------------------------
create or replace function public.award_role_covers(r public.award_staff_roles, yg text, cls text)
returns boolean language sql immutable as $$
  select case r.award_role
    when 'key_stage_office' then cardinality(r.year_groups) = 0 or yg = any (r.year_groups)
    when 'head_of_year'     then yg = any (r.year_groups)
    else                         cls = any (r.class_names)   -- Tutor and Teacher: their classes
  end;
$$;

-- 4. Entry checks: Teachers award only their subjects --------------------
create or replace function public.award_nomination_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a public.awards;
  used int;
  my_subjects text[];
  any_open boolean;
  approver boolean := public.award_is_approver() or coalesce(auth.role(), '') = 'service_role';
begin
  select * into a from public.awards where id = new.award_id;
  if a.id is null then
    raise exception 'This award no longer exists.';
  end if;

  select s.full_name, public.award_year_of(s.year_group) into new.student_name, new.year_group
  from public.students s where s.student_id = new.student_id;
  new.class_name := public.award_student_class(new.student_id);
  new.updated_at := now();
  new.reason := left(trim(coalesce(new.reason, '')), 400);
  -- The term's Learner Profile focus at the time of the award (kept even if
  -- the award's focus is changed later).
  if tg_op = 'INSERT' or new.term is distinct from old.term then
    new.focus := nullif(a.term_focus ->> new.term, '');
  end if;

  if not (new.option_label = any (a.options)) then
    raise exception '"%" is not an option for %.', new.option_label, a.name;
  end if;
  if not (new.term = any (a.terms)) then
    raise exception '% is not open for %.', a.name, new.term;
  end if;

  -- Subjects / areas can differ by year group (Lists & settings).
  if a.choose_first <> 'none' and new.category <> '' and exists (
       select 1 from public.award_lists l
       where l.kind = a.choose_first and lower(l.label) = lower(new.category)
         and cardinality(l.year_groups) > 0
         and not (new.year_group = any (l.year_groups))) then
    raise exception '% is not offered in %.', new.category, new.year_group;
  end if;

  -- Staff limited to certain subjects award only those. A person may hold
  -- several roles; the roles that cover this student decide. If a Tutor,
  -- Head of Year or KSO role without a subject limit covers the student,
  -- every subject is allowed.
  if tg_op = 'INSERT' and coalesce(auth.role(), '') <> 'service_role' and not public.award_is_admin()
     and a.choose_first in ('subject', 'curriculum_area') then
    -- A Teacher (subject teacher) always needs subjects; a Teacher role
    -- without subjects never opens every subject.
    select bool_or(cardinality(r.subjects) = 0 and r.award_role <> 'subject_teacher'),
           array_agg(distinct x) filter (where x is not null)
      into any_open, my_subjects
    from public.award_my_roles() r
    left join lateral unnest(r.subjects) x on true
    where public.award_role_covers(r, new.year_group, new.class_name);
    if coalesce(any_open, true) is not true
       and not (lower(new.category) = any (select lower(y) from unnest(coalesce(my_subjects, '{}')) y)) then
      raise exception 'You can give % awards only for: %.', a.name,
        coalesce(nullif(array_to_string(my_subjects, ', '), ''), 'no subjects yet (ask the office to add yours in Staff & classes)');
    end if;
  end if;

  -- Only approvers decide; everyone else's "approved" means "submitted".
  if not approver then
    if tg_op = 'UPDATE' and old.status in ('approved', 'rejected') and new.status is distinct from old.status then
      raise exception 'This award has already been reviewed by the Key Stage Office.';
    end if;
    if new.status = 'rejected' then
      if tg_op = 'UPDATE' then
        new.status := old.status;
      else
        new.status := 'submitted';
      end if;
    end if;
    if new.status = 'approved' and a.needs_approval then
      new.status := 'submitted';
    end if;
  end if;
  if new.status = 'submitted' and not a.needs_approval then
    new.status := 'approved';
    new.reviewed_at := coalesce(new.reviewed_at, now());
  end if;

  if tg_op = 'INSERT' then
    new.entered_by_email := public.award_email();
  end if;

  -- Optional limit, e.g. one Sportsperson per class.
  if a.limit_count is not null and new.status <> 'rejected' then
    select count(*) into used
    from public.award_nominations n
    where n.award_id = new.award_id
      and n.id <> new.id
      and n.status <> 'rejected'
      and n.category = new.category
      and n.option_label = new.option_label
      and n.term = new.term
      and n.academic_year = new.academic_year
      and case when a.limit_scope = 'class'
               then n.class_name is not distinct from new.class_name
               else n.year_group is not distinct from new.year_group end;
    if used >= a.limit_count then
      raise exception 'Limit reached: % allows % per %.', a.name, a.limit_count,
        case when a.limit_scope = 'class' then 'class' else 'year group' end;
    end if;
  end if;
  return new;
end;
$$;

select 'OK' as award_builder_part_5;
