-- v33 · Publish to portfolio
-- School awards keep working exactly as before (enter, submit, review).
-- They appear on the student's portfolio only after the Key Stage Office,
-- Head of Year, Admin or SuperAdmin publishes them. Until then staff see
-- them as usual; students and parents do not.
--
-- Awards already approved before this change are marked as published, so
-- nothing disappears from portfolios that families can already see.

alter table public.award_nominations
  add column if not exists published_to_portfolio boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists published_by_email text;

update public.award_nominations
   set published_to_portfolio = true,
       published_at = coalesce(reviewed_at, entered_at, now())
 where status = 'approved' and published_to_portfolio = false and published_at is null;

create index if not exists award_nominations_published
  on public.award_nominations (student_id) where published_to_portfolio;

-- Students and parents see only published awards.
drop policy if exists "nominations family read" on public.award_nominations;
create policy "nominations family read" on public.award_nominations for select to authenticated
  using (
    status = 'approved'
    and published_to_portfolio
    and public.can_manage_portfolio(student_id)
    and exists (select 1 from public.awards a where a.id = award_id and a.show_on_portfolio)
  );

-- Who may publish this award: Admin / SuperAdmin, or a Key Stage Office /
-- Head of Year role that covers the student's year group.
create or replace function public.award_can_publish(yg text, cls text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.award_is_admin()
      or exists (
        select 1 from public.award_my_roles() r
        where r.award_role in ('key_stage_office', 'head_of_year')
          and public.award_role_covers(r, yg, cls)
      );
$$;
revoke all on function public.award_can_publish(text, text) from public;
grant execute on function public.award_can_publish(text, text) to authenticated;

create or replace function public.award_nomination_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a public.awards;
  used int;
  my_subjects text[];
  any_open boolean;
  approver boolean := public.award_is_approver() or coalesce(auth.role(), '') = 'service_role';
begin
  -- Publishing to the portfolio (award_publish) changes only the publish
  -- fields; skip the entry checks for that.
  if tg_op = 'UPDATE' and coalesce(current_setting('award.publishing', true), '') = 'on' then
    return new;
  end if;
  -- Publish fields are set only through award_publish.
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.published_to_portfolio := false;
      new.published_at := null;
      new.published_by_email := null;
    else
      new.published_to_portfolio := old.published_to_portfolio;
      new.published_at := old.published_at;
      new.published_by_email := old.published_by_email;
    end if;
  end if;

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

-- Publish (or unpublish) approved awards. Returns how many changed; awards
-- outside the person's year groups, or not yet approved, are left alone.
create or replace function public.award_publish(p_ids uuid[], p_publish boolean default true)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform set_config('award.publishing', 'on', true);
  update public.award_nominations
     set published_to_portfolio = p_publish,
         published_at = case when p_publish then now() else null end,
         published_by_email = case when p_publish then public.award_email() else null end
   where id = any (p_ids)
     and status = 'approved'
     and published_to_portfolio is distinct from p_publish
     and public.award_can_publish(year_group, class_name);
  get diagnostics n = row_count;
  perform set_config('award.publishing', 'off', true);
  return n;
end;
$$;
revoke all on function public.award_publish(uuid[], boolean) from public;
grant execute on function public.award_publish(uuid[], boolean) to authenticated;

select 'publish to portfolio ready' as status,
       count(*) filter (where status = 'approved' and published_to_portfolio) as published,
       count(*) filter (where status = 'approved' and not published_to_portfolio) as waiting_to_publish
from public.award_nominations;
