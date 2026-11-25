/* One description of the CV, used by both the on-screen preview (CvView)
 * and the downloadable PDF (CvPdf), so the two always say the same thing. */

import { cvCoachQuote } from './coachVoice';
import { skillCounts, SKILL_GROUPS } from './skills';

const DOMAIN_LABELS = {
  sport: 'Sport',
  service: 'Service',
  academic: 'Academic',
  arts: 'Arts',
  creativity: 'Creativity',
  leadership: 'Leadership',
  activity: 'Activity',
  personal: 'Personal growth',
  creative_arts: 'Creative arts',
  co_curricular: 'Co-curricular',
  community: 'Community',
  other: 'Other'
};

export const labelOf = value =>
  DOMAIN_LABELS[value] ||
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/^./, ch => ch.toUpperCase());

export const list = value =>
  Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

const toDate = value => {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};


/* "Who I am, how I learn": the three skill groups, counted from verified
 * moments only (same as the portfolio page). Only groups with something
 * shown are included. */
function growthGroups(verified) {
  const labels = { profile: 'Learner Profile', atl: 'ATL skills', cas: 'What it showed' };
  return ['profile', 'atl', 'cas']
    .map(id => {
      const group = SKILL_GROUPS.find(g => g.id === id);
      if (!group) return null;
      const rows = group.skills
        .map(skill => ({
          label: skill,
          count: verified.filter(item => list(item.skills).some(s => s.toLowerCase() === skill.toLowerCase())).length
        }))
        .filter(row => row.count > 0)
        .sort((a, b) => b.count - a.count);
      const top = Math.max(1, ...rows.map(row => row.count));
      return rows.length
        ? { id, label: labels[id], total: group.skills.length, rows: rows.map(row => ({ ...row, share: row.count / top })) }
        : null;
    })
    .filter(Boolean);
}

/* Verified moments per calendar year, most recent first. */
function verifiedYears(verified) {
  const counts = new Map();
  verified.forEach(item => {
    const date = toDate(item.event_date);
    if (date) counts.set(date.getFullYear(), (counts.get(date.getFullYear()) || 0) + 1);
  });
  const rows = [...counts.entries()].sort((a, b) => b[0] - a[0]);
  const top = Math.max(1, ...rows.map(([, c]) => c));
  return rows.map(([year, count]) => ({ year, count, share: count / top }));
}

export function academicYearOf(value) {
  const date = toDate(value);
  if (!date) return '';
  const y = date.getFullYear();
  return date.getMonth() + 1 >= 7 ? `${y}–${String(y + 1).slice(-2)}` : `${y - 1}–${String(y).slice(-2)}`;
}

export const currentAcademicYear = () => academicYearOf(new Date().toISOString().slice(0, 10));

export const monthYearShort = value => {
  const date = toDate(value);
  return date ? date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';
};

const monthYearLong = value => {
  const date = toDate(value);
  return date ? date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';
};

const dayMonthYear = value => {
  const date = toDate(value);
  return date ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
};

/* "Apr 2022 · 4 yrs" from the admission date (whole years to today). */
export function sinceLabel(admissionDate, today = new Date()) {
  const date = toDate(admissionDate);
  if (!date) return null;
  let years = today.getFullYear() - date.getFullYear();
  const beforeAnniversary =
    today.getMonth() < date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() < date.getDate());
  if (beforeAnniversary) years -= 1;
  years = Math.max(0, years);
  return {
    since: monthYearShort(admissionDate),
    years,
    yearsLabel: years < 1 ? 'new this year' : `${years} yr${years === 1 ? '' : 's'}`
  };
}

const firstSentence = text => {
  const value = clean(text);
  const match = value.match(/^(.{20,220}?[.!?])(\s|$)/);
  return match ? match[1] : value.length > 220 ? `${value.slice(0, 217).trim()}…` : value;
};

const trimTo = (text, max) => {
  const value = clean(text);
  return value.length > max ? `${value.slice(0, max - 1).replace(/[\s,;:.]+\S*$/, '')}…` : value;
};

const teamShort = name => clean(String(name || '').replace(/^Panthers\s+/i, '')) || 'TBS Panthers';

function seasonSpan(seasons = []) {
  const list = [...seasons].filter(Boolean).sort();
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  const first = list[0].split('–')[0];
  const last = list[list.length - 1].split('–')[1] || '';
  return `${first}–${last}`;
}

/* "Panthers in numbers": only facts from the official record, and only
 * ones that read well (attendance is shown from 60% and 5+ sessions). */
function teamStats(team) {
  const out = [];
  const pct = team.attendancePercent;
  if (pct != null && pct >= 60 && (team.knownAttendance || 0) >= 5) out.push(`${pct}% attendance`);
  if (team.selectedGames) out.push(`${team.selectedGames} match squad${team.selectedGames === 1 ? '' : 's'}`);
  const pom = team.playerOfMatch || 0;
  if (pom) out.push(pom === 1 ? 'Player of the Match' : `${pom}× Player of the Match`);
  const potm = (team.playerOfMonth || []).length;
  if (potm) out.push(potm === 1 ? 'Player of the Month' : `${potm}× Player of the Month`);
  return out;
}

/* awards: the list from collectAwards() (portfolio Awards section). */
export function buildCvModel({
  student = {},
  profile = {},
  items = [],
  panthers = { teams: [] },
  awards = [],
  approvedQuote = null,
  qrUrl = ''
}) {
  const name = clean(student.full_name) || clean(profile.preferred_name) || 'Student';
  const preferred = clean(profile.preferred_name);
  const showPreferred = preferred && preferred.toLowerCase() !== name.split(' ')[0].toLowerCase() ? preferred : '';
  const languages = list(profile.languages);
  const since = sinceLabel(student.admission_date);

  const facts = [
    student.year_group
      ? {
          label: 'Year group',
          value: (() => {
            const yg = String(student.year_group).trim();
            const m = yg.match(/^yr\s*(\d+)\s*([a-z])$/i);
            return m ? `Year ${m[1]} · ${yg}` : yg;
          })()
        }
      : null,
    since ? { label: 'At TBS since', value: since.since, accent: since.yearsLabel } : null,
    { label: 'Academic year', value: currentAcademicYear() },
    languages.length
      ? {
          label: 'Languages',
          value: languages.slice(0, 3).join(' · ') + (languages.length > 3 ? ` +${languages.length - 3}` : '')
        }
      : null
  ].filter(Boolean);

  const teams = panthers?.teams || [];
  const verified = items.filter(item => ['verified', 'approved'].includes(item.verification_status));
  const verifiedShare = items.length ? Math.round((verified.length / items.length) * 100) : null;

  const numbers = [
    items.length ? { value: String(items.length), label: 'Moments recorded' } : null,
    teams.length ? { value: String(teams.length), label: teams.length === 1 ? 'Panthers team' : 'Panthers teams' } : null,
    awards.length ? { value: String(awards.length), label: awards.length === 1 ? 'Award' : 'Awards' } : null,
    verifiedShare != null ? { value: `${verifiedShare}%`, label: 'Verified by TBS' } : null
  ].filter(Boolean);

  /* Awards as rich cards: what, where, the result and the words said about
   * it. Up to six cards; any more are listed in one line underneath. */
  const awardRows = awards.map(award => ({
    id: award.id,
    kind: award.kind,
    label: award.kind === 'reward' ? 'Coach award' : award.label,
    heading:
      award.kind === 'month'
        ? `${award.label} · ${award.title}`
        : award.kind === 'match'
          ? `${award.label}${/^vs /i.test(award.title || '') ? ' ' : ' · '}${award.title}`
          : award.kind === 'school'
            ? award.title && award.title !== award.label ? `${award.label} · ${award.title}` : award.label
            : award.title || award.label,
    title: award.kind === 'month' ? award.title : award.title || award.label,
    meta: [
      award.kind === 'school' ? award.team : teamShort(award.team),
      award.kind === 'month' ? '' : dayMonthYear(award.date),
      award.kind === 'match' ? award.location : ''
    ]
      .filter(Boolean)
      .join(' · '),
    badge:
      award.kind === 'school'
        ? 'SCHOOL AWARD'
        : award.kind === 'month'
        ? 'MONTHLY'
        : award.outcome
          ? `${award.outcome.toUpperCase()}${award.score ? ` · ${award.score}` : ''}`
          : '',
    /* A factual line; Coach's Awards need none (the heading says it). */
    story: award.kind === 'reward' ? '' : clean(award.story || award.narrative),
    /* The same comment as the portfolio card (see withComments). */
    quote: clean(award.comment),
    quoteBy: award.comment ? clean(award.commentBy) : '',
    report: award.kind === 'match' && award.report && award.report !== award.comment ? clean(award.report) : ''
  }));
  const awardCards = awardRows.slice(0, 6);
  const awardMore = awardRows.slice(6).map(award =>
    award.kind === 'match'
      ? `Player of the Match ${award.title}`
      : award.kind === 'school' && award.title === award.label
        ? award.label
        : `${award.label} · ${award.title}`
  );

  const byYear = new Map();
  [...items]
    .sort((a, b) => String(b.event_date || '').localeCompare(String(a.event_date || '')))
    .forEach(item => {
      const year = academicYearOf(item.event_date) || 'Other';
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push({
        id: item.id,
        date: monthYearShort(item.event_date),
        title: clean(item.title) || 'Journey moment',
        meta: [labelOf(item.domain), clean(item.organisation), clean(item.level)].filter(Boolean).join(' · '),
        text: trimTo(item.description, 260),
        reflection: item.reflection ? firstSentence(item.reflection) : '',
        tags: list(item.skills).slice(0, 4),
        verified: ['verified', 'approved'].includes(item.verification_status)
      });
    });

  const quote = cvCoachQuote({ approved: approvedQuote, panthers });

  return {
    name,
    preferred: showPreferred,
    initials: name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join(''),
    headline: clean(profile.headline),
    facts,
    about: clean(profile.about_me),
    strengths: list(profile.strengths).slice(0, 6),
    interests: list(profile.interests).slice(0, 8),
    proud: clean(profile.proud_moment),
    goals: clean(profile.goals),
    nextChapter: clean(profile.aspirations),
    numbers,
    awards: awardRows,
    awardCards,
    awardMore,
    skills: skillCounts(items, 5),
    growth: growthGroups(verified),
    verifiedYears: verifiedYears(verified),
    teams: teams.map(team => ({
      id: team.team_id,
      name: teamShort(team.team_name),
      seasons: seasonSpan(team.seasons),
      stats: teamStats(team)
    })),
    quote,
    experience: [...byYear.entries()].map(([year, rows]) => ({
      year: year === 'Other' ? 'Other experiences' : year,
      rows
    })),
    qrUrl,
    issued: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    fileName: `${name.replace(/[\\/:*?"<>|]+/g, '')} - TBS Student Journey Portfolio.pdf`,
  };
}
