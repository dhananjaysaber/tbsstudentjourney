-- =====================================================================
-- TBS Student Portfolio · Award Builder (run AFTER 20261005)
--
--   award_lists        subjects, curriculum areas, Learner Profile
--                      attributes (SuperAdmin manages them in Settings)
--   award_staff        Key Stage Office, Heads of Year, Class Teachers
--                      and the year groups / classes they cover
--   awards             each award set up by SuperAdmin / Admin: options,
--                      terms, open–close window, year groups, who may
--                      view / enter / edit / delete, limit, approval
--   award_nominations  one row per student per award option, with an
--                      optional reason; draft → submitted → approved
--
-- Safe to re-run. Adds new tables and functions only; no existing data
-- is changed or removed. Supabase may still show its generic warning:
-- choose "Run".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------
create or replace function public.award_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- Admin or SuperAdmin of the shared (Panthers) login.
create or replace function public.award_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users u
    where lower(u.email) = public.award_email()
      and u.active
      and lower(u.role) in ('admin', 'superadmin')
  );
$$;

create or replace function public.award_is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users u
    where lower(u.email) = public.award_email()
      and u.active
      and lower(u.role) = 'superadmin'
  );
$$;

-- ---------------------------------------------------------------------
-- 1. Year group and class
--
--    The class is exactly what students.year_group says, e.g. "Yr6C".
--    Nothing is guessed: a student recorded as "Year 6" is listed as
--    "Year 6" until their year_group is corrected in the student table.
--
--    award_year_of() only groups classes into their year, so Heads of
--    Year and reports can work by year: "Yr6A" … "Yr6D" → "Year 6".
-- ---------------------------------------------------------------------
create or replace function public.award_year_of(yg text)
returns text language sql immutable as $$
  select case
    when yg is null or trim(yg) = '' then null
    when yg ~* '^\s*(yr|year)\s*[0-9]+' then 'Year ' || substring(yg from '[0-9]+')
    when yg ~* '^\s*reception' then 'Reception'
    when yg ~* '^\s*nursery' then 'Nursery'
    else trim(yg)
  end;
$$;

create or replace function public.award_student_year(sid text)
returns text language sql stable security definer set search_path = public as $$
  select public.award_year_of(s.year_group) from public.students s where s.student_id = sid;
$$;

create or replace function public.award_student_class(sid text)
returns text language sql stable security definer set search_path = public as $$
  select nullif(trim(s.year_group), '') from public.students s where s.student_id = sid;
$$;

-- ---------------------------------------------------------------------
-- 2. Lists (Settings)
-- ---------------------------------------------------------------------
create table if not exists public.award_lists (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('subject', 'curriculum_area', 'learner_profile')),
  label       text not null,
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists award_lists_unique on public.award_lists (kind, lower(label));
-- Which year groups an item applies to (empty = every year), e.g. Hindi only in Years 3–9.
alter table public.award_lists add column if not exists year_groups text[] not null default '{}';

insert into public.award_lists (kind, label, sort_order)
select v.kind, v.label, v.n
from (values
  ('curriculum_area','English',1),('curriculum_area','Mathematics',2),('curriculum_area','Science',3),
  ('curriculum_area','Humanities',4),('curriculum_area','Languages',5),('curriculum_area','Arts',6),
  ('curriculum_area','Computing',7),('curriculum_area','Physical Education',8),
  ('subject','English',1),('subject','Mathematics',2),('subject','Science',3),('subject','History',4),
  ('subject','Geography',5),('subject','French',6),('subject','Spanish',7),('subject','Hindi',8),
  ('subject','Art',9),('subject','Music',10),('subject','Drama',11),('subject','Computing',12),
  ('subject','Design & Technology',13),('subject','Physical Education',14),
  ('learner_profile','Inquirers',1),('learner_profile','Knowledgeable',2),('learner_profile','Thinkers',3),
  ('learner_profile','Communicators',4),('learner_profile','Principled',5),('learner_profile','Open-minded',6),
  ('learner_profile','Caring',7),('learner_profile','Risk-takers',8),('learner_profile','Balanced',9),
  ('learner_profile','Reflective',10)
) as v(kind, label, n)
where not exists (select 1 from public.award_lists l where l.kind = v.kind and lower(l.label) = lower(v.label));

alter table public.award_lists enable row level security;
drop policy if exists "award lists read" on public.award_lists;
create policy "award lists read" on public.award_lists for select to authenticated using (true);
drop policy if exists "award lists superadmin" on public.award_lists;
create policy "award lists superadmin" on public.award_lists for all to authenticated
  using (public.award_is_superadmin()) with check (public.award_is_superadmin());
grant select, insert, update, delete on public.award_lists to authenticated;

-- ---------------------------------------------------------------------
-- 3. Award staff (accounts are created by the journey-award-staff
--    Edge Function, which also adds a "Staff" sign-in if needed)
-- ---------------------------------------------------------------------
create table if not exists public.award_staff (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  full_name    text not null default '',
  award_role   text not null check (award_role in ('key_stage_office', 'head_of_year', 'class_teacher')),
  year_groups  text[] not null default '{}',
  class_names  text[] not null default '{}',
  active       boolean not null default true,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists award_staff_email on public.award_staff (lower(email));
-- Optional: limit a teacher to certain subjects / curriculum areas (empty = any).
alter table public.award_staff add column if not exists subjects text[] not null default '{}';

alter table public.award_staff enable row level security;
drop policy if exists "award staff read" on public.award_staff;
create policy "award staff read" on public.award_staff for select to authenticated
  using (public.award_is_admin() or lower(email) = public.award_email());
drop policy if exists "award staff admin" on public.award_staff;
create policy "award staff admin" on public.award_staff for all to authenticated
  using (public.award_is_admin()) with check (public.award_is_admin());
grant select, insert, update, delete on public.award_staff to authenticated;

create or replace function public.award_my_staff()
returns public.award_staff language sql stable security definer set search_path = public as $$
  select s.* from public.award_staff s
  where lower(s.email) = public.award_email() and s.active
  limit 1;
$$;

-- Key Stage Office, Admin and SuperAdmin approve nominations.
create or replace function public.award_is_approver()
returns boolean language sql stable security definer set search_path = public as $$
  select public.award_is_admin()
      or coalesce((public.award_my_staff()).award_role = 'key_stage_office', false);
$$;

-- ---------------------------------------------------------------------
-- 4. Awards
-- ---------------------------------------------------------------------
create table if not exists public.awards (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  description        text not null default '',
  choose_first       text not null default 'none'
                     check (choose_first in ('none', 'subject', 'curriculum_area', 'learner_profile')),
  options            text[] not null default '{Awarded}',
  terms              text[] not null default '{Term 1}',
  academic_year      text not null,
  opens_on           date not null,
  closes_on          date not null,
  closed_early_at    timestamptz,
  year_groups        text[] not null default '{}',
  permissions        jsonb not null default '{
    "key_stage_office": {"view": true, "enter": true, "edit": true, "delete": true},
    "head_of_year":     {"view": true, "enter": true, "edit": true, "delete": false},
    "class_teacher":    {"view": true, "enter": true, "edit": false, "delete": false}
  }'::jsonb,
  show_on_portfolio  boolean not null default true,
  needs_approval     boolean not null default false,  -- no approval step (kept for later use)
  limit_count        int check (limit_count is null or limit_count > 0),
  limit_scope        text not null default 'class' check (limit_scope in ('class', 'year_group')),
  status             text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order         int not null default 0,
  created_by_email   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint awards_window check (closes_on >= opens_on)
);

alter table public.awards enable row level security;
drop policy if exists "awards read" on public.awards;
create policy "awards read" on public.awards for select to authenticated
  using (status <> 'draft' or public.award_is_admin());
drop policy if exists "awards admin" on public.awards;
create policy "awards admin" on public.awards for all to authenticated
  using (public.award_is_admin()) with check (public.award_is_admin());
grant select, insert, update, delete on public.awards to authenticated;

create or replace function public.award_is_open(a public.awards)
returns boolean language sql stable as $$
  select a.status = 'published'
     and a.closed_early_at is null
     and (now() at time zone 'Asia/Kolkata')::date between a.opens_on and a.closes_on;
$$;

-- May the signed-in person do <action> for a student in this year group / class?
create or replace function public.award_can(a public.awards, action text, yg text, cls text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me public.award_staff;
begin
  if public.award_is_admin() then
    return true;
  end if;
  me := public.award_my_staff();
  if me.id is null then
    return false;
  end if;
  if a.status = 'draft' then
    return false;
  end if;
  if coalesce((a.permissions -> me.award_role ->> action)::boolean, false) is not true then
    return false;
  end if;
  -- Entering and changing only while the award is open (the Key Stage Office may tidy up after).
  if action in ('enter', 'edit', 'delete') and not public.award_is_open(a)
     and me.award_role <> 'key_stage_office' then
    return false;
  end if;
  if cardinality(a.year_groups) > 0 and yg is not null and not (yg = any (a.year_groups)) then
    return false;
  end if;
  if me.award_role = 'key_stage_office' then
    return cardinality(me.year_groups) = 0 or yg = any (me.year_groups);
  elsif me.award_role = 'head_of_year' then
    return yg = any (me.year_groups);
  else
    return cls = any (me.class_names);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Nominations
-- ---------------------------------------------------------------------
create table if not exists public.award_nominations (
  id                 uuid primary key default gen_random_uuid(),
  award_id           uuid not null references public.awards(id) on delete cascade,
  student_id         text not null,
  student_name       text not null default '',
  year_group         text,
  class_name         text,
  category           text not null default '',
  option_label       text not null,
  term               text not null,
  academic_year      text not null,
  reason             text not null default '',   -- teacher's comment (optional)
  status             text not null default 'draft'
                     check (status in ('draft', 'submitted', 'approved', 'rejected')),
  entered_by_email   text,
  entered_by_name    text,
  entered_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  reviewed_by_email  text,
  reviewed_by_name   text,
  reviewed_at        timestamptz,
  review_note        text
);

create unique index if not exists award_nominations_unique
  on public.award_nominations (award_id, student_id, category, option_label, term, academic_year);
create index if not exists award_nominations_student on public.award_nominations (student_id, status);
create index if not exists award_nominations_award on public.award_nominations (award_id, term, academic_year);

-- Fill in the student's name / year / class, keep status honest, enforce limits.
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

drop trigger if exists trg_award_nomination_guard on public.award_nominations;
create trigger trg_award_nomination_guard
  before insert or update on public.award_nominations
  for each row execute function public.award_nomination_guard();

alter table public.award_nominations enable row level security;

drop policy if exists "nominations staff read" on public.award_nominations;
create policy "nominations staff read" on public.award_nominations for select to authenticated
  using (
    public.award_is_admin()
    or exists (select 1 from public.awards a where a.id = award_id
               and public.award_can(a, 'view', year_group, class_name))
  );

-- Students and their parents see approved awards that are meant for the portfolio.
drop policy if exists "nominations family read" on public.award_nominations;
create policy "nominations family read" on public.award_nominations for select to authenticated
  using (
    status = 'approved'
    and public.can_manage_portfolio(student_id)
    and exists (select 1 from public.awards a where a.id = award_id and a.show_on_portfolio)
  );

drop policy if exists "nominations enter" on public.award_nominations;
create policy "nominations enter" on public.award_nominations for insert to authenticated
  with check (
    exists (select 1 from public.awards a where a.id = award_id
            and public.award_can(a, 'enter',
                  public.award_student_year(award_nominations.student_id),
                  public.award_student_class(award_nominations.student_id)))
  );

-- Edit: anyone with Edit, or the person who entered it while it is still a draft / waiting.
drop policy if exists "nominations edit" on public.award_nominations;
create policy "nominations edit" on public.award_nominations for update to authenticated
  using (
    public.award_is_approver()
    or exists (select 1 from public.awards a where a.id = award_id and (
         public.award_can(a, 'edit', year_group, class_name)
         or (lower(award_nominations.entered_by_email) = public.award_email()
             and award_nominations.status in ('draft', 'submitted', 'approved')
             and public.award_can(a, 'enter', year_group, class_name))))
  )
  with check (true);

drop policy if exists "nominations delete" on public.award_nominations;
create policy "nominations delete" on public.award_nominations for delete to authenticated
  using (
    exists (select 1 from public.awards a where a.id = award_id and (
      public.award_can(a, 'delete', year_group, class_name)
      or (lower(award_nominations.entered_by_email) = public.award_email()
          and award_nominations.status in ('draft', 'submitted', 'approved')
          and public.award_can(a, 'enter', year_group, class_name))))
  );

grant select, insert, update, delete on public.award_nominations to authenticated;

-- ---------------------------------------------------------------------
-- 6. Class lists for staff (students are read through these functions,
--    limited to the classes each person covers)
-- ---------------------------------------------------------------------
create or replace function public.award_classes()
returns table (year_group text, class_name text, students bigint)
language sql stable security definer set search_path = public as $$
  with me as (select * from public.award_my_staff()),
  roll as (
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
      or exists (select 1 from me where
           (me.award_role = 'key_stage_office' and (cardinality(me.year_groups) = 0 or r.yg = any (me.year_groups)))
        or (me.award_role = 'head_of_year' and r.yg = any (me.year_groups))
        or (me.award_role = 'class_teacher' and r.cls = any (me.class_names)))
    )
  group by 1, 2
  order by 1, 2;
$$;

create or replace function public.award_class_roster(p_class text)
returns table (student_id text, full_name text, year_group text, class_name text, profile_photo_url text)
language sql stable security definer set search_path = public as $$
  select s.student_id, s.full_name, public.award_year_of(s.year_group),
         public.award_student_class(s.student_id), s.profile_photo_url
  from public.students s
  where s.active
    and public.award_student_class(s.student_id) = p_class
    and exists (select 1 from public.award_classes() c where c.class_name = p_class)
  order by s.full_name;
$$;

-- Every year group and class in the school (for setting up staff).
create or replace function public.award_all_classes()
returns table (year_group text, class_name text, students bigint)
language sql stable security definer set search_path = public as $$
  select public.award_year_of(s.year_group), public.award_student_class(s.student_id), count(*)
  from public.students s
  where s.active and public.award_is_admin() and s.year_group is not null
  group by 1, 2
  order by 1, 2;
$$;

-- ---------------------------------------------------------------------
-- 7. Approve / reject many at once (Approvals tab, bulk action)
-- ---------------------------------------------------------------------
create or replace function public.award_review(p_ids uuid[], p_status text, p_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
  reviewer text;
begin
  if not public.award_is_approver() then
    raise exception 'Only the Key Stage Office or an Admin can review awards.';
  end if;
  if p_status not in ('approved', 'rejected', 'submitted') then
    raise exception 'Unknown status %', p_status;
  end if;
  select coalesce(nullif(u.full_name, ''), s.full_name, public.award_email()) into reviewer
  from (select 1) x
  left join public.app_users u on lower(u.email) = public.award_email()
  left join public.award_staff s on lower(s.email) = public.award_email();

  update public.award_nominations
     set status = p_status,
         reviewed_by_email = public.award_email(),
         reviewed_by_name = reviewer,
         reviewed_at = now(),
         review_note = p_note
   where id = any (p_ids) and status <> 'draft';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.award_review(uuid[], text, text) from public;
grant execute on function public.award_review(uuid[], text, text) to authenticated;
grant execute on function public.award_classes() to authenticated;
grant execute on function public.award_class_roster(text) to authenticated;
grant execute on function public.award_all_classes() to authenticated;
grant execute on function public.award_is_admin() to authenticated;
grant execute on function public.award_is_approver() to authenticated;
grant execute on function public.award_my_staff() to authenticated;
grant execute on function public.award_year_of(text) to authenticated;
