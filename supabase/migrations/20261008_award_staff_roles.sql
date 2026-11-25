-- =====================================================================
-- TBS Student Portfolio · Award Builder, part 3 (run AFTER 20261007)
--
--   One person, several roles. e.g. Ms Rao teaches Yr8A and Yr8B
--   (Class Teacher) and is Head of Year 7.
--
--   award_staff        the person (name, email, active)
--   award_staff_roles  NEW · one row per role with its own scope:
--                      classes, year groups and optional subjects
--
-- Existing staff keep their current role: it is copied into the new
-- table. Safe to re-run. Nothing is deleted.
-- =====================================================================

-- 1. Roles table ------------------------------------------------------
create table if not exists public.award_staff_roles (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references public.award_staff(id) on delete cascade,
  award_role   text not null check (award_role in ('key_stage_office', 'head_of_year', 'class_teacher')),
  year_groups  text[] not null default '{}',
  class_names  text[] not null default '{}',
  subjects     text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists award_staff_roles_one_each
  on public.award_staff_roles (staff_id, award_role);

-- The person record no longer needs a role of its own.
alter table public.award_staff alter column award_role drop not null;

-- Copy each person's existing role across (once).
insert into public.award_staff_roles (staff_id, award_role, year_groups, class_names, subjects)
select s.id, s.award_role, s.year_groups, s.class_names, coalesce(s.subjects, '{}')
from public.award_staff s
where s.award_role is not null
  and not exists (select 1 from public.award_staff_roles r
                  where r.staff_id = s.id and r.award_role = s.award_role);

alter table public.award_staff_roles enable row level security;
drop policy if exists "award roles read" on public.award_staff_roles;
create policy "award roles read" on public.award_staff_roles for select to authenticated
  using (
    public.award_is_admin()
    or exists (select 1 from public.award_staff s
               where s.id = staff_id and lower(s.email) = public.award_email())
  );
drop policy if exists "award roles admin" on public.award_staff_roles;
create policy "award roles admin" on public.award_staff_roles for all to authenticated
  using (public.award_is_admin()) with check (public.award_is_admin());
grant select, insert, update, delete on public.award_staff_roles to authenticated;

-- 2. Helpers ----------------------------------------------------------
-- All active roles of the signed-in person.
create or replace function public.award_my_roles()
returns setof public.award_staff_roles
language sql stable security definer set search_path = public as $$
  select r.*
  from public.award_staff_roles r
  join public.award_staff s on s.id = r.staff_id
  where lower(s.email) = public.award_email() and s.active;
$$;

-- Does a role cover a student in this year group / class?
create or replace function public.award_role_covers(r public.award_staff_roles, yg text, cls text)
returns boolean language sql immutable as $$
  select case r.award_role
    when 'key_stage_office' then cardinality(r.year_groups) = 0 or yg = any (r.year_groups)
    when 'head_of_year'     then yg = any (r.year_groups)
    else                         cls = any (r.class_names)
  end;
$$;

create or replace function public.award_is_approver()
returns boolean language sql stable security definer set search_path = public as $$
  select public.award_is_admin()
      or exists (select 1 from public.award_my_roles() r where r.award_role = 'key_stage_office');
$$;

-- May the signed-in person do <action> for a student in this year / class?
-- True if ANY of their roles allows it.
create or replace function public.award_can(a public.awards, action text, yg text, cls text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  r public.award_staff_roles;
begin
  if public.award_is_admin() then
    return true;
  end if;
  if a.status = 'draft' then
    return false;
  end if;
  if cardinality(a.year_groups) > 0 and yg is not null and not (yg = any (a.year_groups)) then
    return false;
  end if;
  for r in select * from public.award_my_roles() loop
    continue when coalesce((a.permissions -> r.award_role ->> action)::boolean, false) is not true;
    -- Entering and changing only while the award is open (the Key Stage Office may tidy up after).
    continue when action in ('enter', 'edit', 'delete') and not public.award_is_open(a)
                  and r.award_role <> 'key_stage_office';
    if public.award_role_covers(r, yg, cls) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- Classes the signed-in person can see (union of all their roles).
create or replace function public.award_classes()
returns table (year_group text, class_name text, students bigint)
language sql stable security definer set search_path = public as $$
  with roll as (
    select public.award_year_of(s.year_group) as yg,
           public.award_student_class(s.student_id) as cls
    from public.students s
    where s.active
  )
  select r.yg, r.cls, count(*)
  from roll r
  where r.yg is not null
    and (
      public.award_is_admin()
      or exists (select 1 from public.award_my_roles() m where public.award_role_covers(m, r.yg, r.cls))
    )
  group by 1, 2
  order by 1, 2;
$$;

-- 3. Entry checks (subjects now come from the person's roles) ----------
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
  -- several roles; the roles that cover this student decide. If any of
  -- them has no subject limit, every subject is allowed.
  if tg_op = 'INSERT' and coalesce(auth.role(), '') <> 'service_role' and not public.award_is_admin()
     and a.choose_first in ('subject', 'curriculum_area') then
    select bool_or(cardinality(r.subjects) = 0),
           array_agg(distinct x) filter (where x is not null)
      into any_open, my_subjects
    from public.award_my_roles() r
    left join lateral unnest(r.subjects) x on true
    where public.award_role_covers(r, new.year_group, new.class_name);
    if coalesce(any_open, true) is not true
       and not (lower(new.category) = any (select lower(y) from unnest(coalesce(my_subjects, '{}')) y)) then
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


grant execute on function public.award_my_roles() to authenticated;
grant execute on function public.award_is_approver() to authenticated;

select 'OK' as award_builder_part_3;
