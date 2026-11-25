-- v33 · Award comments: Admin can edit too (all award types, like SuperAdmin).
-- Coaches stay limited to the Panthers types. Safe to run more than once.
create or replace function public.award_comment_can_edit(p_category text)
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
      and lower(trim(coalesce(au.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      and (
        lower(coalesce(au.role, '')) in ('superadmin', 'admin')
        or (
          p_category in ('coach_award', 'player_of_month', 'player_of_match')
          and lower(coalesce(au.role, '')) like '%coach%'
        )
      )
  );
$$;

select 'award comments: admin access' as status,
       count(*) filter (where lower(role) in ('superadmin', 'admin') and active) as admins,
       count(*) filter (where lower(role) like '%coach%' and active) as coaches
from public.app_users;
