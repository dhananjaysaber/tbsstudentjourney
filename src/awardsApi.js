/* =========================================================================
   AWARD BUILDER · data layer (migration 20261006 + journey-award-staff)
   Every read is tolerant: before the migration runs, awards simply
   don't appear and the portfolio behaves exactly as in v31.
   ========================================================================= */
import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';

export const AWARD_ROLES = {
  key_stage_office: 'Key Stage Office',
  head_of_year: 'Head of Year',
  class_teacher: 'Tutor',
  subject_teacher: 'Teacher'
};

export const CHOOSE_FIRST = {
  none: 'Nothing (tick students)',
  subject: 'Subject',
  curriculum_area: 'Curriculum area',
  learner_profile: 'Learner Profile attribute'
};

export const TERMS = ['Term 1', 'Term 2', 'Term 3', 'Full year'];
export const ACTIONS = ['view', 'enter', 'edit', 'delete'];

/* Academic year runs Aug–Jul at TBS: Oct 2026 → "2026–27". */
export function currentAcademicYear(date = new Date()) {
  const y = date.getFullYear();
  const start = date.getMonth() >= 7 ? y : y - 1;
  return `${start}–${String(start + 1).slice(2)}`;
}

export function academicYearOptions() {
  const now = currentAcademicYear();
  const start = Number(now.slice(0, 4));
  return [start - 1, start, start + 1].map(y => `${y}–${String(y + 1).slice(2)}`);
}

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/* 'draft' | 'open' | 'soon' | 'closed' | 'archived' */
export function awardState(award) {
  if (!award) return 'draft';
  if (award.status === 'archived') return 'archived';
  if (award.status === 'draft') return 'draft';
  if (award.closed_early_at) return 'closed';
  const today = todayIso();
  if (today < award.opens_on) return 'soon';
  if (today > award.closes_on) return 'closed';
  return 'open';
}

export function daysLeft(award) {
  const end = new Date(`${award.closes_on}T23:59:59`);
  return Math.max(0, Math.ceil((end - new Date()) / 86400000));
}

function rows(result) {
  if (result.error) throw result.error;
  return result.data || [];
}

/* ---------------- who am I ---------------- */

const ROLE_ORDER = ['key_stage_office', 'head_of_year', 'class_teacher', 'subject_teacher'];

/* The signed-in person's award roles (one person can hold several).
 * Returns null when they have none. Shape:
 *   { email, full_name, roles: [{ award_role, class_names, year_groups, subjects }],
 *     award_role: highest role, isKso: boolean } */
export async function loadMyAwardRole() {
  try {
    const { data: me } = await supabase.auth.getUser();
    const email = me?.user?.email;
    if (!email) return null;
    const { data, error } = await supabase
      .from('award_staff')
      .select('*, award_staff_roles(*)')
      .ilike('email', email)
      .eq('active', true)
      .maybeSingle();
    if (error || !data) {
      // Before migration 20261008: one role stored on the person.
      const legacy = await supabase.rpc('award_my_staff');
      const row = legacy.data?.id ? legacy.data : null;
      return row?.award_role
        ? { ...row, roles: [row], isKso: row.award_role === 'key_stage_office' }
        : null;
    }
    const roles = [...(data.award_staff_roles || [])].sort(
      (a, b) => ROLE_ORDER.indexOf(a.award_role) - ROLE_ORDER.indexOf(b.award_role)
    );
    if (!roles.length) return null;
    return { ...data, roles, award_role: roles[0].award_role, isKso: roles.some(r => r.award_role === 'key_stage_office') };
  } catch {
    return null;
  }
}

/* Does one role cover a class in a year? (Mirrors award_role_covers in SQL.) */
export function roleCovers(role, yearGroup, className) {
  if (role.award_role === 'key_stage_office') return !(role.year_groups || []).length || role.year_groups.includes(yearGroup);
  if (role.award_role === 'head_of_year') return (role.year_groups || []).includes(yearGroup);
  return (role.class_names || []).includes(className); // Tutor and Teacher: their classes
}

/* ---------------- lists ---------------- */

export async function loadLists() {
  try {
    const list = rows(
      await supabase.from('award_lists').select('*').order('kind').order('sort_order').order('label')
    );
    return list;
  } catch {
    return [];
  }
}

export async function saveListItem(item) {
  const payload = {
    kind: item.kind,
    label: String(item.label || '').trim(),
    sort_order: item.sort_order ?? 0,
    active: item.active !== false,
    ...(Array.isArray(item.year_groups) ? { year_groups: item.year_groups } : {})
  };
  if (!payload.label) throw new Error('Please type a name.');
  const result = item.id
    ? await supabase.from('award_lists').update(payload).eq('id', item.id).select().single()
    : await supabase.from('award_lists').insert(payload).select().single();
  if (result.error) throw result.error;
  return result.data;
}

/* ---------------- awards ---------------- */

export async function loadAwards({ includeArchived = false } = {}) {
  try {
    let q = supabase.from('awards').select('*');
    if (!includeArchived) q = q.neq('status', 'archived');
    return rows(await q.order('sort_order').order('created_at'));
  } catch (error) {
    if (/relation|does not exist|schema cache/i.test(error?.message || '')) return null;
    throw error;
  }
}

export async function saveAward(award, email) {
  const payload = {
    name: String(award.name || '').trim(),
    description: String(award.description || '').trim(),
    choose_first: award.choose_first || 'none',
    options: (award.options || []).map(o => String(o).trim()).filter(Boolean),
    terms: award.terms?.length ? award.terms : ['Term 1'],
    academic_year: award.academic_year || currentAcademicYear(),
    opens_on: award.opens_on,
    closes_on: award.closes_on,
    closed_early_at: award.closed_early_at || null,
    year_groups: award.year_groups || [],
    permissions: award.permissions,
    show_on_portfolio: award.show_on_portfolio !== false,
    needs_approval: false, // no approval step: awards count as soon as they are submitted
    limit_count: award.limit_count ? Number(award.limit_count) : null,
    limit_scope: award.limit_scope || 'class',
    status: award.status || 'draft',
    sort_order: award.sort_order || 0,
    term_focus: Object.fromEntries(
      Object.entries(award.term_focus || {}).filter(([t, v]) => v && (award.terms || []).includes(t))
    ),
    updated_at: new Date().toISOString()
  };
  if (!payload.name) throw new Error('Please give the award a name.');
  if (!payload.options.length) throw new Error('Add at least one option, e.g. “Gold”.');
  if (!payload.opens_on || !payload.closes_on) throw new Error('Please choose open and close dates.');
  if (payload.closes_on < payload.opens_on) throw new Error('The close date must be after the open date.');

  const write = body =>
    award.id
      ? supabase.from('awards').update(body).eq('id', award.id).select().single()
      : supabase.from('awards').insert({ ...body, created_by_email: email }).select().single();
  let result = await write(payload);
  // Before migration 20261009 there is no term_focus column yet.
  if (result.error && /term_focus/i.test(result.error.message || '')) {
    const { term_focus, ...rest } = payload;
    result = await write(rest);
  }
  if (result.error) throw result.error;
  return result.data;
}

/* ---------------- classes & rosters ---------------- */

export async function loadMyClasses() {
  return rows(await supabase.rpc('award_classes'));
}

export async function loadAllClasses() {
  return rows(await supabase.rpc('award_all_classes'));
}

export async function loadRoster(className) {
  return rows(await supabase.rpc('award_class_roster', { p_class: className }));
}

/* ---------------- nominations ---------------- */

/* category: a subject / area to load just that column; omit (undefined)
 * to load every column for the class (grid view). */
export async function loadClassNominations({ awardId, className, category, term, academicYear }) {
  let q = supabase
    .from('award_nominations')
    .select('*')
    .eq('award_id', awardId)
    .eq('class_name', className)
    .eq('term', term)
    .eq('academic_year', academicYear);
  if (category !== undefined) q = q.eq('category', category || '');
  return rows(await q);
}

export const sheetKey = (studentId, category, option) => `${studentId}|${category || ''}|${option}`;

/* Save a class sheet. ticks: Map sheetKey → { reason }.
 * Only changed cells are written. editable: Set of categories this person
 * may change (null = all); other columns are never touched. */
export async function saveClassSheet({ award, existing, ticks, term, academicYear, status, me, editable = null }) {
  const canTouch = category => !editable || editable.has(category || '');
  const byKey = new Map(existing.map(n => [sheetKey(n.student_id, n.category, n.option_label), n]));
  const upserts = [];
  const removals = [];

  ticks.forEach((value, key) => {
    const [studentId, category, option] = key.split('|');
    if (!canTouch(category)) return;
    const found = byKey.get(key);
    const reason = value.reason || '';
    if (found) {
      const promote = status !== 'draft' && found.status === 'draft';
      if (reason === (found.reason || '') && !promote) return; // unchanged
      upserts.push({ id: found.id, reason, ...(promote ? { status } : {}) });
      return;
    }
    upserts.push({
      award_id: award.id,
      student_id: studentId,
      category: category || '',
      option_label: option,
      term,
      academic_year: academicYear,
      reason,
      status,
      entered_by_name: me.name
    });
  });

  existing.forEach(n => {
    const key = sheetKey(n.student_id, n.category, n.option_label);
    if (!ticks.has(key) && canTouch(n.category) && ['draft', 'submitted', 'approved'].includes(n.status)) removals.push(n.id);
  });

  for (const row of upserts) {
    const { id, ...rest } = row;
    const result = id
      ? await supabase.from('award_nominations').update(rest).eq('id', id)
      : await supabase.from('award_nominations').insert(rest);
    if (result.error) throw result.error;
  }
  if (removals.length) {
    const { error } = await supabase.from('award_nominations').delete().in('id', removals);
    if (error) throw error;
  }
  return { saved: upserts.length, removed: removals.length };
}

export async function loadNominations({ awardId, term, academicYear, yearGroup, className, status, studentId } = {}) {
  let q = supabase.from('award_nominations').select('*').order('student_name').order('id');
  if (studentId) q = q.eq('student_id', studentId);
  if (awardId) q = q.eq('award_id', awardId);
  if (term) q = q.eq('term', term);
  if (academicYear) q = q.eq('academic_year', academicYear);
  if (yearGroup) q = q.eq('year_group', yearGroup);
  if (className) q = q.eq('class_name', className);
  if (status) q = Array.isArray(status) ? q.in('status', status) : q.eq('status', status);
  const all = [];
  for (let from = 0; ; from += 1000) {
    const page = rows(await q.range(from, from + 999));
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

export async function countPendingAwards() {
  try {
    const { count, error } = await supabase
      .from('award_nominations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'submitted');
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

export async function reviewNominations(ids, status, note = null) {
  const { data, error } = await supabase.rpc('award_review', { p_ids: ids, p_status: status, p_note: note });
  if (error) throw error;
  return data || 0;
}

/* Publish to portfolio (migration 20261016). Returns how many changed. */
export async function publishNominations(ids, publish = true) {
  const { data, error } = await supabase.rpc('award_publish', { p_ids: ids, p_publish: publish });
  if (error) {
    if (/award_publish|function .* does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Run migration 20261016_award_publish_portfolio.sql in Supabase first.');
    }
    throw error;
  }
  return data || 0;
}

export async function deleteNomination(id) {
  const { error } = await supabase.from('award_nominations').delete().eq('id', id);
  if (error) throw error;
}

/* Approved school awards for one student's portfolio / CV. */
export async function loadStudentSchoolAwards(studentId) {
  try {
    /* Only awards published to the portfolio (migration 20261016). Before
     * that migration runs the column is missing, so fall back to approved. */
    let { data, error } = await supabase
      .from('award_nominations')
      .select('id,award_id,category,option_label,term,academic_year,focus,reason,reviewed_at,entered_at,entered_by_name,awards(name,show_on_portfolio,options,choose_first)')
      .eq('student_id', studentId)
      .eq('status', 'approved')
      .eq('published_to_portfolio', true)
      .order('academic_year', { ascending: false });
    if (error && /published_to_portfolio/i.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('award_nominations')
        .select('id,award_id,category,option_label,term,academic_year,focus,reason,reviewed_at,entered_at,entered_by_name,awards(name,show_on_portfolio,options,choose_first)')
        .eq('student_id', studentId)
        .eq('status', 'approved')
        .order('academic_year', { ascending: false }));
    }
    if (error && /focus/i.test(error.message || '')) {
      const retry = await supabase
        .from('award_nominations')
        .select('id,award_id,category,option_label,term,academic_year,reason,reviewed_at,entered_at,entered_by_name,awards(name,show_on_portfolio,options,choose_first)')
        .eq('student_id', studentId)
        .eq('status', 'approved');
      return (retry.data || []).filter(row => row.awards?.show_on_portfolio !== false);
    }
    if (error) return [];
    return (data || []).filter(row => row.awards?.show_on_portfolio !== false);
  } catch {
    return [];
  }
}

/* ---------------- staff ---------------- */

export async function loadAwardStaff() {
  try {
    const list = await supabase.from('award_staff').select('*, award_staff_roles(*)').order('full_name');
    if (!list.error) {
      return (list.data || []).map(p => ({
        ...p,
        roles: [...(p.award_staff_roles || [])].sort(
          (a, b) => ROLE_ORDER.indexOf(a.award_role) - ROLE_ORDER.indexOf(b.award_role)
        )
      }));
    }
    // Before migration 20261008: one role stored on the person.
    return rows(await supabase.from('award_staff').select('*').order('full_name')).map(p => ({
      ...p,
      roles: p.award_role ? [{ award_role: p.award_role, class_names: p.class_names, year_groups: p.year_groups, subjects: p.subjects || [] }] : []
    }));
  } catch {
    return [];
  }
}

/* Import many staff at once. Returns [{ email, ok, error?, created? }]. */
export async function importAwardStaff(people, rolesMode = 'merge') {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${supabaseUrl}/functions/v1/journey-award-staff`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${data?.session?.access_token || supabaseAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ people, roles_mode: rolesMode })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || 'The import could not run just now.');
  return json.results || [];
}

/* Minimal CSV reader (quotes, commas, new lines inside quotes). */
export function parseCsv(text) {
  const rowsOut = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text || '').replace(/^\ufeff/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rowsOut.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rowsOut.push(row);
  return rowsOut;
}

export async function saveAwardStaff(person, rolesMode = 'replace') {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${supabaseUrl}/functions/v1/journey-award-staff`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${data?.session?.access_token || supabaseAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ...person, roles_mode: rolesMode })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || 'Could not save this person just now.');
  return json;
}

/* ---------------- report helpers ---------------- */

export function nominationLabel(n, award) {
  const single = (award?.options || []).length <= 1;
  const opt = single ? '' : n.option_label;
  return [opt, n.category].filter(Boolean).join(' · ') || n.option_label;
}

export function toCsv(rowsIn) {
  const esc = v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rowsIn.map(r => r.map(esc).join(',')).join('\r\n');
}

export function downloadCsv(name, rowsIn) {
  const blob = new Blob([toCsv(rowsIn)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* How many nominations an award holds (any status). */
export async function countAwardNominations(awardId) {
  const { count, error } = await supabase
    .from('award_nominations')
    .select('id', { count: 'exact', head: true })
    .eq('award_id', awardId);
  if (error) throw error;
  return count || 0;
}

/* Permanently delete an award and every nomination in it. */
export async function deleteAward(awardId) {
  const { error } = await supabase.from('awards').delete().eq('id', awardId);
  if (error) throw error;
}
