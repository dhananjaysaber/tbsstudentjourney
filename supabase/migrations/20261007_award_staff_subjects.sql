-- =====================================================================
-- TBS Student Portfolio · Award Builder, part 2 (run AFTER 20261006)
--   · Lists & settings: subjects / curriculum areas / Learner Profile
--     items can apply to chosen year groups only (empty = every year)
--   · Staff & classes: a teacher can optionally be limited to subjects
--   · Staff import: classes can be assigned after importing
-- Safe to re-run. Adds two columns and updates one function.
-- =====================================================================

alter table public.award_lists add column if not exists year_groups text[] not null default '{}';
alter table public.award_staff add column if not exists subjects text[] not null default '{}';

create or replace function public.award_nomination_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a public.awards;
  used int;
  my_subjects text[];
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

  -- Staff limited to certain subjects (Staff & classes) award only those.
  if tg_op = 'INSERT' and coalesce(auth.role(), '') <> 'service_role' and not public.award_is_admin() then
    select coalesce(st.subjects, '{}') into my_subjects
    from public.award_staff st where lower(st.email) = public.award_email() and st.active;
    if a.choose_first in ('subject', 'curriculum_area') and cardinality(coalesce(my_subjects, '{}')) > 0
       and not (lower(new.category) = any (select lower(x) from unnest(my_subjects) x)) then
      raise exception 'You can give % awards only for: %.', a.name, array_to_string(my_subjects, ', ');
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

select 'OK' as award_builder_part_2;
