-- =========================================================================
-- WHO CAN EDIT & SAVE A PORTFOLIO? · by role, for everyone (nothing saved)
-- Every "save" is tried as that person and then undone.
-- If Supabase warns about RLS / destructive: choose "Run without RLS".
--   Student    → their own portfolio
--   Parent     → their linked child
--   Coach      → one of their own players (from the teams they coach)
--   Admin / SuperAdmin → a sample student
-- =========================================================================
create temp table if not exists edit_check (
  role text, email text, tried text, outcome text
);
truncate edit_check;

do $$
declare
  sample_sid text;
  r record;
  t record;
  uid uuid; sid text; there int; saved int; msg text;
begin
  select e.student_id into sample_sid
  from public.student_journey_entries e
  join public.student_journey_profiles p on p.student_id = e.student_id
  where e.verification_status in ('draft','submitted')
  limit 1;

  for r in
    select 'Student'::text as role, lower(au.email) as email, au.student_id as sid
    from public.app_users au
    where au.active and au.student_id is not null and au.email is not null
    union all
    select 'Parent', lower(l.parent_email), l.student_id
    from public.parent_student_links l
    where l.active and l.parent_email is not null
    union all
    select case
             when lower(au.role) = 'superadmin' then 'SuperAdmin'
             when lower(au.role) = 'admin' then 'Admin'
             else 'Coach' end,
           lower(au.email), null
    from public.app_users au
    where au.active and au.email is not null
      and (lower(au.role) in ('superadmin','admin') or lower(au.role) like '%coach%')
  loop
    select u.id into uid from auth.users u where lower(u.email) = r.email limit 1;
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid, 'email', r.email, 'role', 'authenticated')::text, true);

    sid := r.sid;
    if r.role = 'Coach' then
      /* one of this coach's own players who has a portfolio */
      select tm.student_id into sid
      from public.team_members tm
      join public.student_journey_profiles p on p.student_id = tm.student_id
      where tm.active is true and public.can_access_team(tm.team_id)
      order by exists (select 1 from public.student_journey_entries e
                       where e.student_id = tm.student_id
                         and e.verification_status in ('draft','submitted')) desc
      limit 1;
    elsif r.role in ('Admin', 'SuperAdmin') then
      sid := sample_sid;
    end if;

    for t in
      select * from (values
        ('Profile', 'student_journey_profiles', ''),
        ('Journey moments', 'student_journey_entries', ' and verification_status in (''draft'',''submitted'')')
      ) v(label, tbl, extra)
    loop
      if uid is null then
        insert into edit_check values (r.role, r.email, t.label, 'No sign-in yet');
        continue;
      end if;
      if sid is null then
        insert into edit_check values (r.role, r.email, t.label, 'Nothing to test');
        continue;
      end if;

      execute format('select count(*) from public.%I where student_id = $1%s', t.tbl, t.extra)
        into there using sid;
      if there = 0 then
        insert into edit_check values (r.role, r.email, t.label, 'Nothing to test');
        continue;
      end if;

      saved := 0; msg := null;
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', uid, 'email', r.email, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.email', r.email, true);
        perform set_config('request.jwt.claim.sub', uid::text, true);
        set local role authenticated;
        execute format('update public.%I set student_id = student_id where student_id = $1%s', t.tbl, t.extra)
          using sid;
        get diagnostics saved = row_count;
        raise exception using message = '__undo__';   -- always undo
      exception when others then
        if sqlerrm <> '__undo__' then msg := sqlerrm; end if;
      end;

      insert into edit_check values (r.role, r.email, t.label,
        case when msg is not null then 'Blocked: ' || msg
             when saved = there then 'Can save'
             else 'Cannot save (rule does not allow it)' end);
    end loop;
  end loop;
end $$;

select role, tried, outcome, count(*) as people
from edit_check
where outcome not in ('No sign-in yet', 'Nothing to test')
group by role, tried, outcome
order by array_position(array['Student','Parent','Coach','Admin','SuperAdmin'], role), tried, outcome;
