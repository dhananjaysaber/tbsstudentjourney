-- School setting: show the Panthers "Team ranking" card on portfolios ('on' | 'off').
insert into public.portfolio_settings (key, value) values ('team_ranking', 'on')
on conflict (key) do nothing;

create or replace function public.portfolio_set_setting(p_key text, p_value text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_portfolio_superadmin() then
    raise exception 'Only the SuperAdmin can change this setting';
  end if;
  if p_key = 'community_default' and p_value not in ('open', 'closed') then
    raise exception 'Invalid value';
  elsif p_key in ('right_click', 'right_click_admin') and p_value not in ('enabled', 'disabled') then
    raise exception 'Invalid value';
  elsif p_key = 'team_ranking' and p_value not in ('on', 'off') then
    raise exception 'Invalid value';
  elsif p_key not in ('community_default', 'right_click', 'right_click_admin', 'team_ranking') then
    raise exception 'Unknown setting';
  end if;
  insert into public.portfolio_settings (key, value, updated_by, updated_at)
  values (p_key, p_value, public.award_email(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  return public.portfolio_get_settings();
end;
$$;
