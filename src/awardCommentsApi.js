/* =========================================================================
   AWARD COMMENT LINES (migration 20261014)
   SuperAdmin and Coaches write the lines shown on award cards. The
   portfolio picks one line per award: matched by award type and, for
   Coach's Awards and school awards, by criterion (e.g. "Effort").
   Before the migration runs, reads return nothing and cards fall back
   to a plain factual line.
   ========================================================================= */
import { supabase } from './supabase';

export const COMMENT_CATEGORIES = [
  { id: 'coach_award', label: 'Coach’s Award', kind: 'reward', hasCriteria: true, panthers: true },
  { id: 'player_of_month', label: 'Player of the Month', kind: 'month', hasCriteria: false, panthers: true },
  { id: 'player_of_match', label: 'Player of the Match', kind: 'match', hasCriteria: false, panthers: true },
  { id: 'school', label: 'School awards', kind: 'school', hasCriteria: true, panthers: false }
];

export const CATEGORY_FOR_KIND = { reward: 'coach_award', month: 'player_of_month', match: 'player_of_match', school: 'school' };

/* Starter lines, offered once so the lists aren't empty. Editable. */
export const SUGGESTED_LINES = {
  coach_award: {
    Effort: [
      'Recognised by the coaches for giving full effort in every session.',
      'Awarded for a work rate that set the standard for the squad.'
    ],
    Improvement: [
      'Recognised for steady, visible improvement across the season.',
      'Awarded for turning practice into real progress.'
    ],
    Teamwork: [
      'Recognised for putting the team first, on and off the court.',
      'Awarded for encouraging others and playing for the team.'
    ],
    Leadership: [
      'Recognised for leading by example in training and in matches.'
    ],
    Attitude: [
      'Recognised for a positive attitude and commitment to every session.'
    ]
  },
  player_of_month: {
    '': ['Chosen by the coaches from the whole squad for consistent commitment this month.']
  },
  player_of_match: {
    '': ['Named Player of the Match by the coaching staff.']
  },
  school: {
    '': ['Recognised by the school for living the Learner Profile.']
  }
};

let cache = null;

/* Active lines for the portfolio (anyone, including public links). */
export async function loadCommentLines({ fresh = false } = {}) {
  if (cache && !fresh) return cache;
  cache = (async () => {
    try {
      const { data, error } = await supabase
        .from('award_comment_lines')
        .select('id,category,criteria,body,active,sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch {
      return [];
    }
  })();
  return cache;
}

/* All lines, including hidden ones, for the settings page. */
export async function loadAllCommentLines() {
  const { data, error } = await supabase
    .from('award_comment_lines')
    .select('*')
    .order('category')
    .order('criteria', { nullsFirst: true })
    .order('sort_order')
    .order('created_at');
  if (error) {
    if (/relation .*award_comment_lines|does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Run migration 20261014_award_comment_lines.sql in Supabase first.');
    }
    throw error;
  }
  return data || [];
}

export async function addCommentLine({ category, criteria, body }, email) {
  const { data, error } = await supabase
    .from('award_comment_lines')
    .insert({ category, criteria: criteria ? criteria.trim() : null, body: body.trim(), active: true, created_by: email || null })
    .select()
    .single();
  if (error) throw error;
  cache = null;
  return data;
}

export async function updateCommentLine(id, patch) {
  const { data, error } = await supabase
    .from('award_comment_lines')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  cache = null;
  return data;
}

export async function deleteCommentLine(id) {
  const { error } = await supabase.from('award_comment_lines').delete().eq('id', id);
  if (error) throw error;
  cache = null;
}

/* ---------------------------------------------------------------- picking -- */

const FILLER = /\b(best|most|the|award|awards|coach'?s|coaches|of|for|and|player|outstanding|top)\b/gi;

/* "Best Effort" → "Effort"; used when no configured criterion matches. */
export function criterionFromTitle(title = '') {
  const cleaned = String(title).replace(/[’']/g, "'").replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || String(title).trim();
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/* The criterion an award belongs to: a configured criterion whose name
 * appears in the award's title (longest match wins), else from the title. */
export function criterionFor(award, lines) {
  const category = CATEGORY_FOR_KIND[award.kind];
  const text = `${award.title || ''} ${award.kind === 'school' ? award.label || '' : ''} ${award.criteriaHint || ''}`.toLowerCase();
  const names = [...new Set(lines.filter(l => l.category === category && l.criteria).map(l => l.criteria))]
    .sort((a, b) => b.length - a.length);
  const hit = names.find(name => text.includes(name.toLowerCase()));
  if (hit) return hit;
  if (award.kind === 'reward') return criterionFromTitle(award.title);
  return '';
}

/* One line per award, stable for that award, varied across students. */
export function pickLine(award, lines, offset = 0) {
  const category = CATEGORY_FOR_KIND[award.kind];
  if (!category || !lines?.length) return '';
  const criterion = criterionFor(award, lines).toLowerCase();
  const own = lines.filter(l => l.category === category);
  const matched = criterion ? own.filter(l => (l.criteria || '').toLowerCase() === criterion) : [];
  const pool = matched.length ? matched : own.filter(l => !l.criteria);
  if (!pool.length) return '';
  /* Start from a per-student point in the list, then step through it so the
   * same student's repeat awards read different lines. */
  return pool[(hash(String(award.seed || award.id || award.title)) + offset) % pool.length].body;
}

/* ------------------------------------------------------------- comments -- */

/* Who signs a line from the Award comments list: the organisation, never a
 * person, so nobody is credited with words they didn't write. */
export function orgFor(award) {
  return award.kind === 'school' ? 'The British School' : 'TBS Panthers';
}

/* One comment for every award, used on the portfolio and in the PDF:
 *   1. the giver's own words (coach comment / teacher's reason), signed
 *      with their name when we know it;
 *   2. else a line from Award comments for its category and criterion,
 *      signed by the organisation.
 * Adds { criterion, comment, commentBy }. comment is '' only when neither
 * exists (the card then shows its plain factual line). */
export function withComments(awards = [], lines = []) {
  const seen = new Map();
  const seed = awards.map(a => a.id).join('|');
  return awards.map(award => {
    const criterion = criterionFor(award, lines);
    const own = String(award.comment || '').replace(/\s+/g, ' ').trim();
    if (own) return { ...award, criterion, comment: own, commentBy: award.commentBy || orgFor(award) };
    const key = `${award.kind}:${criterion.toLowerCase()}`;
    const offset = seen.get(key) || 0;
    seen.set(key, offset + 1);
    const line = pickLine({ ...award, seed: `${seed}:${key}` }, lines, offset);
    return { ...award, criterion, comment: line, commentBy: line ? orgFor(award) : '' };
  });
}
