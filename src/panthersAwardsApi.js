/* =========================================================================
   PANTHERS AWARDS · add from the workspace (SuperAdmin and Coach)
   Writes to the Panthers app's own tables, using only their required
   fields. Row-level security there already lets SuperAdmin, Admin and
   Coach insert and update both tables.
   ========================================================================= */
import { supabase } from './supabase';

export async function teamsForStudent(studentId) {
  const { data: members } = await supabase
    .from('team_members')
    .select('team_id,active')
    .eq('student_id', studentId);
  const ids = [...new Set((members || []).filter(m => m.active !== false).map(m => m.team_id).filter(Boolean))];
  let query = supabase.from('teams').select('team_id,team_name,active').order('team_name');
  query = ids.length ? query.in('team_id', ids) : query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return { teams: data || [], own: ids.length > 0 };
}

/* The reward names already used in Panthers, most used first. */
export async function rewardTypes() {
  const { data, error } = await supabase
    .from('student_rewards')
    .select('reward_type')
    .eq('active', true)
    .limit(2000);
  if (error) return [];
  const counts = new Map();
  (data || []).forEach(r => {
    const t = String(r.reward_type || '').trim();
    if (t) counts.set(t, (counts.get(t) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

export async function addCoachAward({ studentId, teamId, rewardType, date }, email) {
  const { data, error } = await supabase
    .from('student_rewards')
    .insert({
      student_id: studentId,
      team_id: teamId || null,
      reward_type: rewardType,
      reward_title: rewardType,
      reward_date: date,
      awarded_by_email: email,
      visible_to_parent_student: true,
      active: true
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function playerOfMonthExists({ studentId, teamId, monthKey }) {
  const { data } = await supabase
    .from('players_of_month')
    .select('id')
    .eq('student_id', studentId)
    .eq('team_id', teamId)
    .eq('month_key', monthKey)
    .eq('active', true)
    .limit(1);
  return Boolean(data && data.length);
}

export async function addPlayerOfMonth({ studentId, teamId, monthKey }, email) {
  const { data, error } = await supabase
    .from('players_of_month')
    .insert({ student_id: studentId, team_id: teamId, month_key: monthKey, selected_by_email: email, active: true })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

/* Undo = switch off (both tables allow staff updates; deletes are admin-only). */
export async function withdrawAward(kind, id) {
  const table = kind === 'month' ? 'players_of_month' : 'student_rewards';
  const { error } = await supabase.from(table).update({ active: false }).eq('id', id);
  if (error) throw error;
}
