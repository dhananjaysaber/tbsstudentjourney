create table if not exists public.portfolio_display_settings(
  scope text primary key,  -- 'default' or a student_id
  mode text not null check (mode in ('carousel','spiral','blog')),
  updated_by text,
  updated_at timestamptz default now());
alter table public.portfolio_display_settings enable row level security;

create or replace function public.portfolio_can_set_display() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.app_users u where lower(u.email)=public.award_email() and u.active and u.role in ('Admin','SuperAdmin')) $$;

create or replace function public.portfolio_get_display_mode(p_student_id text default '') returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('can_set', public.portfolio_can_set_display(),
    'default', (select mode from public.portfolio_display_settings where scope='default'),
    'override', (select mode from public.portfolio_display_settings where scope=coalesce(p_student_id,'') and coalesce(p_student_id,'')<>'' and scope<>'default')) $$;

create or replace function public.portfolio_set_display_mode(p_scope text, p_mode text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.portfolio_can_set_display() then raise exception 'Not allowed'; end if;
  if coalesce(p_scope,'')='' then raise exception 'Scope required'; end if;
  if coalesce(p_mode,'')='' then
    if p_scope='default' then raise exception 'Default cannot be cleared'; end if;
    delete from public.portfolio_display_settings where scope=p_scope; return;
  end if;
  insert into public.portfolio_display_settings(scope,mode,updated_by,updated_at) values(p_scope,p_mode,public.award_email(),now())
  on conflict(scope) do update set mode=excluded.mode, updated_by=excluded.updated_by, updated_at=now();
end $$;

revoke all on function public.portfolio_can_set_display(), public.portfolio_get_display_mode(text), public.portfolio_set_display_mode(text,text) from public;
grant execute on function public.portfolio_can_set_display(), public.portfolio_get_display_mode(text), public.portfolio_set_display_mode(text,text) to anon, authenticated;
