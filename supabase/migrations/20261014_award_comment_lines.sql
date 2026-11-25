-- v33 · Award comment lines
-- SuperAdmin and Coaches write the lines shown on award cards in the
-- portfolio, per award type (and per criterion, e.g. Coach's Award → Effort).
-- The portfolio picks one line per award, so the wording is the school's own.

create table if not exists public.award_comment_lines (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('coach_award', 'player_of_month', 'player_of_match', 'school')),
  criteria text,                       -- e.g. 'Effort'; null = any award of this type
  body text not null check (char_length(trim(body)) between 10 and 240),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists award_comment_lines_category_idx
  on public.award_comment_lines (category, lower(coalesce(criteria, '')));

-- Who may edit: SuperAdmin and Admin (all types); Coaches (Panthers types only).
create or replace function public.award_comment_can_edit(p_category text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Self-contained (does not need migration 12): reads app_users directly.
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
revoke all on function public.award_comment_can_edit(text) from public;
grant execute on function public.award_comment_can_edit(text) to authenticated;

alter table public.award_comment_lines enable row level security;

drop policy if exists "Award comment lines are readable" on public.award_comment_lines;
drop policy if exists "Award comment lines: public reads active" on public.award_comment_lines;
create policy "Award comment lines: public reads active"
  on public.award_comment_lines for select
  to anon
  using (active);

drop policy if exists "Award comment lines: signed-in read" on public.award_comment_lines;
create policy "Award comment lines: signed-in read"
  on public.award_comment_lines for select
  to authenticated
  using (active or public.award_comment_can_edit(category));

drop policy if exists "Award comment lines: editors add" on public.award_comment_lines;
create policy "Award comment lines: editors add"
  on public.award_comment_lines for insert
  to authenticated
  with check (public.award_comment_can_edit(category));

drop policy if exists "Award comment lines: editors change" on public.award_comment_lines;
create policy "Award comment lines: editors change"
  on public.award_comment_lines for update
  to authenticated
  using (public.award_comment_can_edit(category))
  with check (public.award_comment_can_edit(category));

drop policy if exists "Award comment lines: editors remove" on public.award_comment_lines;
create policy "Award comment lines: editors remove"
  on public.award_comment_lines for delete
  to authenticated
  using (public.award_comment_can_edit(category));

grant select on public.award_comment_lines to anon, authenticated;
grant insert, update, delete on public.award_comment_lines to authenticated;

select 'award_comment_lines ready' as status, count(*) as lines from public.award_comment_lines;
