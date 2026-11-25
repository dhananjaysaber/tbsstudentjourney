import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AwardSetup,
  AwardEntry,
  AwardStaff,
  AwardLists,
  AwardPublish,
  schoolAwardCards
} from './components/Awards';
import { loadMyAwardRole } from './awardsApi';
import AwardReports from './components/AwardReports';
import ManageBacImport from './components/ManageBacImport';
import {
  GuideIntro,
  GuideLink,
  GuidePanel,
  IdeaPicker,
  PhotoPicker,
  ReflectionChecklist,
  TYPE_INFO,
  WordCount,
  guideIntroSkipped,
  wordCount,
  guidePanelOpen,
  setGuidePanelOpen
} from './components/JourneyGuide';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Loader2,
  MessageSquareQuote,
  Trophy,
  Lightbulb,
  Clock3,
  Compass,
  Inbox,
  LayoutDashboard,
  UserRound,
  Eye,
  FileText,
  Globe2,
  Image as ImageIcon,
  Link as LinkIcon,
  LogOut,
  Pause,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Info,
  Star,
  Trash2,
  Users,
  X,
  ChevronLeft,
  MousePointerClick,
  ChevronRight,
  BarChart3,
  Settings2,
  ListChecks
} from 'lucide-react';
import { isPhoto } from './lib/isPhoto';
import { SkillChip } from './lib/skillIcons';

import { supabase, hasSupabaseConfig } from './supabase';
import {
  signOut,
  getAccount,
  getParentChildren,
  searchStudents,
  loadJourney,
  saveProfile,
  saveEntry,
  deleteEntry,
  uploadJourneyMedia,
  addExternalEvidence,
  reviewEntry,
  setPublicEntry,
  setProfilePublic,
  setEvidencePublic,
  setCoverEvidence,
  setEntryMediaPublic,
  copyEvidenceToEntry,
  removeEvidence,
  loadPublicShare,
  loadPendingEntries,
  loadPortfolioSettings,
  setPortfolioSetting,
  loadCommunityMode,
  setCommunityMode,
  privateEvidenceBlobUrl,
  cachedEvidenceBlobUrl,
  preloadEvidence,
  publicEvidenceUrl,
  countPendingAccessRequests,
  setCommunityClosed,
  loadMemberPortfolio,
  hasOpenOrApprovedQuote,
  createQuoteDraft,
  loadQuoteDrafts,
  reviewQuote,
  studentsNeedingQuotes
} from './journeyApi';
import { latestCoachWords, draftCoachQuote, cvCoachQuote } from './lib/coachVoice';
import {
  SKILL_GROUPS,
  MAX_SKILLS,
  suggestSkills,
  STORY_PROMPTS,
  REFLECTION_PROMPTS
} from './lib/skills';

import JourneySpiral from './components/JourneySpiral';
import JourneyCarousel from './components/JourneyCarousel';
import AwardComments from './components/AwardComments';
import PanthersAwardAdd from './components/PanthersAwardAdd';
import { loadCommentLines, withComments } from './awardCommentsApi';
import HeroPortrait from './components/HeroPortrait';
import Landing, { RequestAccess } from './components/landing/Landing';
import ThemeToggle from './components/ThemeToggle';
import MemoryWall from './components/MemoryWall';
import CvView from './components/CvView';
import AccessRequests from './components/AccessRequests';
import BrowsePortfolios from './components/BrowsePortfolios';
import './components/Workspace.css';
import { scrollToSection, setPageScrollLocked } from './lib/smoothScroll';
import { friendlyError } from './lib/friendly';
import { TBS_LOGO_WHITE, useColourLogo } from './lib/brand';

const TBS_LOGO =
  'https://tbspanthers.british-school.org/wp-content/uploads/2024/12/TBS.png';

const PANTHERS_LOGO =
  'https://tbspanthers.british-school.org/wp-content/uploads/2025/10/TBSPanthers-Logo-512px.png';

const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Awaiting approval',
  verified: 'Verified',
  rejected: 'Not approved'
};

const DOMAIN_OPTIONS = [
  { value: 'academic', label: 'Academic' },
  { value: 'sport', label: 'Sport' },
  { value: 'creative_arts', label: 'Creative Arts' },
  { value: 'leadership', label: 'Leadership' },
  { value: 'service', label: 'Service' },
  { value: 'co_curricular', label: 'Co-curricular' },
  { value: 'personal', label: 'Personal Growth' },
  { value: 'other', label: 'Other' }
];

const LEVEL_OPTIONS = [
  'School',
  'Local',
  'District',
  'State',
  'National',
  'International',
  'Other'
];

const ENTRY_TYPES = [
  { value: 'achievement', label: 'Achievement' },
  { value: 'award', label: 'Award' },
  { value: 'project', label: 'Project' },
  { value: 'activity', label: 'Activity' },
  { value: 'role', label: 'Role' },
  { value: 'reflection', label: 'Reflection' },
  { value: 'milestone', label: 'Milestone' }
];

const emptyProfile = {
  preferred_name: '',
  headline: '',
  about_me: '',
  interests: [],
  strengths: [],
  languages: [],
  goals: '',
  aspirations: '',
  proud_moment: '',
  closing_thought: '',
  profile_photo_url: '',
  banner_image_url: ''
};

const isAdmin = role =>
  ['admin', 'superadmin'].includes(String(role || '').toLowerCase());

const isSuperAdmin = role => String(role || '').toLowerCase() === 'superadmin';

/* Any Panthers coach role ("Coach", "Head Coach", …). */
const isCoach = role => /coach/i.test(String(role || ''));

const arr = value =>
  Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

const showArr = value =>
  Array.isArray(value) ? value.join(', ') : value || '';

/* Follow the exact `evidence:<id>` saved on the profile first, so a newly
 * uploaded photo shows immediately. Fall back to the newest evidence row
 * with the matching media_role. */
/* A portfolio is "not ready" until the student has written an
 * introduction (headline) or an About me. */
/* Show the Panthers section only when there are real records, not just a
 * team membership with nothing logged yet. */
function hasPanthersData(panthers) {
  return (panthers?.teams || []).some(
    team =>
      team.knownAttendance > 0 ||
      team.selectedGames > 0 ||
      team.publishedResults > 0 ||
      team.playerOfMatch > 0 ||
      team.ratingCount > 0 ||
      (team.reports || []).length > 0 ||
      (team.rewards || []).length > 0 ||
      (team.playerOfMonth || []).length > 0
  );
}

/* Is the signed-in viewer the SuperAdmin? (They can review any portfolio
 * in full, even before the student has finished their About me.) */
function useViewerIsSuperAdmin() {
  const [superAdmin, setSuperAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = (await supabase?.auth.getSession()) || { data: {} };
        const email = data?.session?.user?.email;
        if (!email) return;
        const account = await getAccount(email);
        if (alive) setSuperAdmin(isSuperAdmin(account?.role));
      } catch {
        /* not signed in, or no account: normal view */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return superAdmin;
}

function portfolioNotReady(profile) {
  return !String(profile?.headline || '').trim() && !String(profile?.about_me || '').trim();
}

function resolveProfileEvidence(ref, evidence = [], role) {
  const value = String(ref || '');
  const evidenceId = value.startsWith('evidence:') ? value.slice(9) : '';

  if (evidenceId) {
    const exact = evidence.find(item => item.id === evidenceId && item.active !== false);
    if (exact) return exact;
  }

  return (
    evidence
      .filter(item => item.active !== false && item.media_role === role)
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      )[0] || null
  );
}

function domainLabel(value) {
  return DOMAIN_OPTIONS.find(item => item.value === value)?.label || value || 'Journey';
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return value;
  }
}

function academicYear(dateValue) {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return m >= 7 ? `${y}–${String(y + 1).slice(-2)}` : `${y - 1}–${String(y).slice(-2)}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return bytesToHex(new Uint8Array(digest));
}

function randomShareToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function withTimeout(promise, ms = 12000, label = 'Request') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(
      () => reject(new Error(`${label} took too long. Please try again.`)),
      ms
    );
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    window.clearTimeout(timer);
  });
}

/*
 * Creates / refreshes the secure public-share token without changing the
 * student's existing privacy model. student_journey_sharing only accepts
 * private / tbs / public for default_visibility; "selected" is not valid.
 * Existing sharing preferences are preserved rather than deleting the row.
 */
async function createSecureShare(studentId, expiresAt) {
  if (!studentId) {
    throw new Error('Please choose a student before creating a link.');
  }

  const token = randomShareToken();
  const hash = await sha256Hex(token);
  const now = new Date().toISOString();

  const existingResult = await withTimeout(
    supabase
      .from('student_journey_sharing')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1),
    12000,
    'Loading sharing settings'
  );

  if (existingResult.error) throw existingResult.error;
  const existing = existingResult.data?.[0] || null;

  const { data: userData } = await withTimeout(
    supabase.auth.getUser(),
    10000,
    'Checking your session'
  );

  const allowedVisibility = ['private', 'tbs', 'public'];
  const preservedVisibility = allowedVisibility.includes(existing?.default_visibility)
    ? existing.default_visibility
    : 'private';

  const payload = {
    public_profile_enabled: true,
    public_slug:
      existing?.public_slug ||
      `${String(studentId).toLowerCase()}-${hash.slice(0, 8)}`,
    default_visibility: preservedVisibility,
    section_visibility: {
      ...(existing?.section_visibility || {}),
      profile: existing?.section_visibility?.profile ?? true,
      journey: existing?.section_visibility?.journey ?? true,
      evidence: existing?.section_visibility?.evidence ?? true,
      panthers: existing?.section_visibility?.panthers ?? true
    },
    allow_search_engines: Boolean(existing?.allow_search_engines),
    share_token_hash: hash,
    expires_at: expiresAt,
    revoked_at: null,
    published_at: now,
    updated_at: now
  };

  let writeResult;

  if (existing) {
    writeResult = await withTimeout(
      supabase
        .from('student_journey_sharing')
        .update(payload)
        .eq('student_id', studentId),
      12000,
      'Creating secure link'
    );
  } else {
    writeResult = await withTimeout(
      supabase.from('student_journey_sharing').insert({
        student_id: studentId,
        ...payload,
        created_by: userData?.user?.id || null,
        created_at: now
      }),
      12000,
      'Creating secure link'
    );
  }

  if (writeResult.error) throw writeResult.error;
  return token;
}

async function safeRows(query, label) {
  try {
    const { data, error } = await query;
    if (error) {
      console.warn(`Panthers ${label}:`, error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.warn(`Panthers ${label}:`, error?.message || error);
    return [];
  }
}

function classifyAttendance(status) {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return 'unknown';
  if (
    value.includes('present') ||
    value.includes('attended') ||
    value === 'yes' ||
    value.includes('late') ||
    value.includes('excused') ||
    value.includes('medical')
  ) {
    // Panthers treats an approved/excused absence as meeting the attendance record.
    return 'attended';
  }
  if (
    value.includes('absent') ||
    value === 'no' ||
    value.includes('unavailable')
  ) {
    return 'missed';
  }
  return 'unknown';
}

/*
 * Reads existing Panthers operational data only.
 * No schema changes, no duplicate sports database.
 * If a role cannot read a Panthers table because of RLS,
 * Student Journey still loads and simply hides unavailable Panthers data.
 */
/* ---------- Player of the Match: the match behind the award ---------- */

/* Capitalise lowercase words in names typed by staff ("Sanskriti school" → "Sanskriti School"). */
function tidyName(value) {
  return String(value || '')
    .trim()
    .replace(/\b([a-z])([a-z]{2,})\b/g, (word, first, rest) =>
      ['of', 'the', 'and', 'for', 'vs'].includes(word) ? word : first.toUpperCase() + rest
    );
}

const isMatchAward = row => /match/i.test(`${row?.reward_type || ''} ${row?.reward_title || ''}`);

function placeOnly(value) {
  // "The Ardee School. Reporting at the TBS reception area." -> "The Ardee School"
  return String(value || '').split(/\.\s/)[0].replace(/\.$/, '').trim();
}

function matchScore(result) {
  if (!result) return '';
  if (result.score_display) return String(result.score_display).trim();
  const ours = result.our_score;
  const theirs = result.opponent_score;
  if (ours == null || theirs == null || (Number(ours) === 0 && Number(theirs) === 0)) return '';
  return `${ours}–${theirs}`;
}

function matchOutcome(result) {
  const status = String(result?.result_status || '').trim().toLowerCase();
  if (status === 'win' || status === 'won') return 'Win';
  if (status === 'loss' || status === 'lost') return 'Loss';
  if (status === 'draw' || status === 'drawn' || status === 'tie') return 'Draw';
  return ''; // Draft or unknown: not final, so no result or score is shown
}

/* Every Player of the Match award for a team, with its match details.
 * Comes from published results and from coach rewards of that type;
 * the same match is only counted once. */
function buildMatchAwards({ studentId, teamResults, teamRewards, scheduleMap }) {
  const awards = new Map();
  const keyOf = (scheduleId, date) => `${scheduleId || ''}|${String(date || '').slice(0, 10)}`;
  const findResult = (scheduleId, date) =>
    teamResults.find(
      row => row.schedule_id === scheduleId && String(row.occurrence_date || '') === String(date || '').slice(0, 10)
    ) || null;

  const add = (scheduleId, date, result, reward) => {
    const key = keyOf(scheduleId, date);
    const existing = awards.get(key);
    if (existing) {
      if (reward && !existing.comment) {
        existing.comment = String(reward.reward_comment || reward.comment || '').trim();
        existing.commentBy = reward.awarded_by_name || '';
      }
      return;
    }
    const schedule = scheduleMap.get(scheduleId) || {};
    const outcome = matchOutcome(result);
    awards.set(key, {
      key,
      date: String(date || schedule.event_date || '').slice(0, 10),
      title: schedule.title || '',
      eventType: schedule.event_type || '',
      location: placeOnly(schedule.location),
      opponent: tidyName(result?.opponent_name),
      outcome,
      score: outcome ? matchScore(result) : '',
      summary: String(result?.match_summary || '').trim(),
      comment: String(reward?.reward_comment || reward?.comment || '').trim(),
      commentBy: reward?.awarded_by_name || ''
    });
  };

  teamResults
    .filter(row => row.player_of_match_student_id === studentId)
    .forEach(row => add(row.schedule_id, row.occurrence_date, row, null));

  teamRewards
    .filter(isMatchAward)
    .forEach(row => {
      const date = row.occurrence_date || row.reward_date || String(row.awarded_at || '').slice(0, 10);
      add(row.schedule_id, date, findResult(row.schedule_id, date), row);
    });

  return [...awards.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/* "Named Player of the Match in Panthers vs Sanskriti School at Lower Field on 19 Sep 2026.
 *  Panthers won (159/9 - 165/2). “Tbs panthers won the match by 8 wickets.”" */
function describeMatchAward(award) {
  const title = award.title || (award.opponent ? `the match against ${award.opponent}` : 'a Panthers match');
  const against =
    award.opponent && !title.toLowerCase().includes(award.opponent.toLowerCase().split(' ')[0])
      ? ` against ${award.opponent}`
      : '';
  let text = `Named Player of the Match in ${title}${against}${award.location ? ` at ${award.location}` : ''}${
    award.date ? ` on ${formatDate(award.date)}` : ''
  }.`;
  if (award.outcome) {
    const verb = award.outcome === 'Win' ? 'won' : award.outcome === 'Loss' ? 'lost' : 'drew';
    text += ` Panthers ${verb}${award.score ? ` (${award.score})` : ''}.`;
  }
  const quote = award.comment || award.summary;
  if (quote) text += ` “${quote.replace(/\s+/g, ' ')}”`;
  return text;
}

function rewardDate(row) {
  return String(row.reward_date || row.occurrence_date || row.awarded_at || '').slice(0, 10);
}

function monthShort(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function monthLabel(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/* Raw Panthers rows for one student (read with the viewer's login).
 * The secure public link gets the same rows from the server instead. */
async function fetchPanthersRows(studentId) {

  const [memberships, rewards, monthAwards] = await Promise.all([
    safeRows(
      supabase
        .from('team_members')
        .select('team_id,student_id,active,joined_date,left_date')
        .eq('student_id', studentId),
      'team memberships'
    ),
    /* Coach rewards — only those marked visible to families. */
    safeRows(
      supabase
        .from('student_rewards')
        .select('id,student_id,team_id,reward_type,reward_title,reward_comment,comment,reward_date,occurrence_date,awarded_at,awarded_by_email')
        .eq('student_id', studentId)
        .eq('active', true)
        .eq('visible_to_parent_student', true),
      'rewards'
    ),
    /* Player of the Month */
    safeRows(
      supabase
        .from('players_of_month')
        .select('id,student_id,team_id,month_key,recognition_type,selected_at')
        .eq('student_id', studentId)
        .eq('active', true),
      'players of the month'
    )
  ]);

  /* Who wrote each reward comment, by name. Staff can read app_users; for
   * anyone else this returns nothing and the comment is signed by the team. */
  const writers = [...new Set(
    rewards
      .filter(row => String(row.reward_comment || row.comment || '').trim() && row.awarded_by_email)
      .map(row => String(row.awarded_by_email).toLowerCase())
  )];
  if (writers.length) {
    const people = await safeRows(
      supabase.from('app_users').select('email,full_name').in('email', writers),
      'award writers'
    );
    const nameOf = new Map(people.map(row => [String(row.email || '').toLowerCase(), String(row.full_name || '').trim()]));
    rewards.forEach(row => {
      row.awarded_by_name = nameOf.get(String(row.awarded_by_email || '').toLowerCase()) || '';
    });
  }

  /* Teams come from memberships, plus any team a reward or award was given in. */
  const teamIds = [
    ...new Set(
      [...memberships, ...rewards, ...monthAwards].map(row => row.team_id).filter(Boolean)
    )
  ];

  if (!teamIds.length) {
    return { memberships, rewards, monthAwards, teams: [], attendance: [], squads: [], results: [], reports: [], schedules: [], playerRatings: [] };
  }

  const [teams, attendance, squads, results, reports, schedules, playerRatings] = await Promise.all([
    safeRows(
      supabase
        .from('teams')
        .select(
          'team_id,team_name,activity,category,gender,club,team_image_url,team_banner_url,team_description,active'
        )
        .in('team_id', teamIds),
      'teams'
    ),
    safeRows(
      supabase
        .from('schedule_attendance')
        .select('schedule_id,occurrence_date,team_id,student_id,attendance_status,active')
        .eq('student_id', studentId)
        .eq('active', true)
        .in('team_id', teamIds),
      'attendance'
    ),
    safeRows(
      supabase
        .from('game_squad')
        .select(
          'schedule_id,occurrence_date,team_id,student_id,squad_status,position_or_role,visible_to_parents,publication_status,published_at,active'
        )
        .eq('student_id', studentId)
        .eq('active', true)
        .in('team_id', teamIds),
      'game squads'
    ),
    safeRows(
      supabase
        .from('game_results')
        .select(
          'schedule_id,occurrence_date,team_id,opponent_name,our_score,opponent_score,result_status,player_of_match_student_id,match_summary,published_to_parents,active,score_display'
        )
        .eq('active', true)
        .eq('published_to_parents', true)
        .in('team_id', teamIds),
      'published game results'
    ),
    safeRows(
      supabase
        .from('student_progress_reports')
        .select(
          'id,student_id,team_id,report_title,report_period,commitment_summary,strengths,areas_for_development,coach_comment,next_steps,report_date,visible_to_parent_student,active'
        )
        .eq('student_id', studentId)
        .eq('active', true)
        .eq('visible_to_parent_student', true)
        .in('team_id', teamIds),
      'progress reports'
    ),
    safeRows(
      supabase
        .from('schedules')
        .select(
          'schedule_id,team_id,title,event_type,event_date,start_time,location,schedule_status,active'
        )
        .eq('active', true)
        .in('team_id', teamIds),
      'schedules'
    ),
    safeRows(
      supabase
        .from('player_ratings')
        .select(
          'student_id,team_id,schedule_id,occurrence_date,points,criteria,rated_at,active'
        )
        .eq('active', true)
        .in('team_id', teamIds),
      'player ratings'
    )
  ]);

  return { memberships, rewards, monthAwards, teams, attendance, squads, results, reports, schedules, playerRatings };
}

/* Builds the Panthers record shown on the portfolio from raw rows. */
function buildPanthersJourney(studentId, rows) {
  const { memberships = [], rewards = [], monthAwards = [], teams = [], attendance = [], squads = [], results = [], reports = [], schedules = [], playerRatings = [] } = rows || {};
  const teamIds = [
    ...new Set(
      [...memberships, ...rewards, ...monthAwards].map(row => row.team_id).filter(Boolean)
    )
  ];

  if (!teamIds.length) {
    return {
      teams: [],
      totals: {
        rewards: rewards.length,
        playerOfMonth: monthAwards.length,
        teams: 0,
        attendanceRecords: 0,
        attended: 0,
        knownAttendance: 0,
        selectedGames: 0,
        publishedResults: 0,
        playerOfMatch: 0,
        progressReports: 0,
        ratingRecords: 0,
        activities: [],
        seasons: []
      }
    };
  }

  const teamMap = new Map(teams.map(team => [team.team_id, team]));
  const scheduleMap = new Map(schedules.map(item => [item.schedule_id, item]));

  const built = teamIds
    .map(teamId => {
      const team = teamMap.get(teamId) || { team_id: teamId, team_name: 'TBS Panthers' };
      const member = memberships.find(row => row.team_id === teamId) || {};
      const teamSchedules = schedules.filter(row => row.team_id === teamId);
      const teamAttendance = attendance.filter(row => {
        if (row.team_id !== teamId) return false;
        const schedule = scheduleMap.get(row.schedule_id);
        return String(schedule?.schedule_status || '').toLowerCase() !== 'cancelled';
      });
      const teamSquads = squads.filter(row => row.team_id === teamId);
      const teamResults = results.filter(row => row.team_id === teamId);
      const teamReports = reports
        .filter(row => row.team_id === teamId)
        .sort((a, b) => String(b.report_date || '').localeCompare(String(a.report_date || '')));
      const teamRatings = playerRatings.filter(row => row.team_id === teamId);
      const teamRewards = rewards
        .filter(row => row.team_id === teamId)
        .map(row => ({ ...row, date: rewardDate(row) }))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const matchAwards = buildMatchAwards({ studentId, teamResults, teamRewards, scheduleMap });
      const teamMonths = monthAwards
        .filter(row => row.team_id === teamId)
        .sort((a, b) => String(b.month_key || '').localeCompare(String(a.month_key || '')));

      const trainingAttendance = teamAttendance.filter(row => {
        const eventType = String(scheduleMap.get(row.schedule_id)?.event_type || '').toLowerCase();
        return eventType.includes('practice') || eventType.includes('training');
      });
      const attendanceBasis = trainingAttendance.length ? trainingAttendance : teamAttendance;

      const attended = attendanceBasis.filter(
        row => classifyAttendance(row.attendance_status) === 'attended'
      ).length;

      const missed = attendanceBasis.filter(
        row => classifyAttendance(row.attendance_status) === 'missed'
      ).length;

      const knownAttendance = attended + missed;
      const attendancePercent = knownAttendance
        ? Math.round((attended / knownAttendance) * 100)
        : null;

      // Match the Panthers CPanel ranking logic: total player-rating points,
      // sorted descending within the team, with equal totals sharing a rank.
      const ratingTotals = new Map();
      teamRatings.forEach(row => {
        const id = String(row.student_id || '');
        if (!id) return;
        const current = ratingTotals.get(id) || {
          student_id: id,
          total: 0,
          ratings: 0,
          criteria: new Set()
        };
        current.total += Number(row.points || 0);
        current.ratings += 1;
        if (row.criteria) current.criteria.add(String(row.criteria).trim());
        ratingTotals.set(id, current);
      });

      const rankedRatings = [...ratingTotals.values()].sort(
        (a, b) => b.total - a.total || a.student_id.localeCompare(b.student_id)
      );
      let lastScore = null;
      let currentRank = 0;
      rankedRatings.forEach((row, index) => {
        if (lastScore === null || row.total !== lastScore) currentRank = index + 1;
        row.rank = currentRank;
        lastScore = row.total;
      });
      const studentRating = rankedRatings.find(row => row.student_id === String(studentId));
      const playerRank = rankedRatings.length >= 2 && studentRating ? studentRating.rank : null;

      const publishedSquads = teamSquads.filter(
        row => row.visible_to_parents || String(row.publication_status || '').toLowerCase() === 'published'
      );

      const games = publishedSquads
        .map(row => {
          const schedule = scheduleMap.get(row.schedule_id);
          const result = teamResults.find(
            game =>
              game.schedule_id === row.schedule_id &&
              String(game.occurrence_date || '') === String(row.occurrence_date || '')
          );

          return {
            ...row,
            title: schedule?.title || 'Match / Competition',
            location: schedule?.location || '',
            event_date: row.occurrence_date || schedule?.event_date || '',
            opponent_name: result?.opponent_name || '',
            score_display:
              result?.score_display ||
              (result?.our_score != null && result?.opponent_score != null
                ? `${result.our_score}–${result.opponent_score}`
                : ''),
            result_status: result?.result_status || '',
            has_published_result: Boolean(result),
            player_of_match: result?.player_of_match_student_id === studentId
          };
        })
        .sort((a, b) => String(b.event_date || '').localeCompare(String(a.event_date || '')));

      const years = [...new Set(
        [
          academicYear(member.joined_date),
          academicYear(member.left_date),
          ...teamAttendance.map(row => academicYear(row.occurrence_date)),
          ...teamSquads.map(row => academicYear(row.occurrence_date)),
          ...teamSchedules.map(row => academicYear(row.event_date)),
          ...teamRewards.map(row => academicYear(row.date)),
          ...teamMonths.map(row => academicYear(row.month_key))
        ].filter(Boolean)
      )].sort();

      const timelineDates = [
        member.joined_date,
        member.left_date,
        ...teamAttendance.map(row => row.occurrence_date),
        ...teamSquads.map(row => row.occurrence_date),
        ...teamSchedules.map(row => row.event_date),
        ...teamReports.map(row => row.report_date),
        ...teamRatings.map(row => row.occurrence_date || row.rated_at?.slice(0, 10)),
        ...teamRewards.map(row => row.date),
        ...teamMonths.map(row => row.month_key)
      ]
        .filter(Boolean)
        .map(value => String(value).slice(0, 10))
        .sort();

      return {
        ...team,
        joined_date: member.joined_date,
        left_date: member.left_date,
        membership_active: member.active,
        seasons: years,
        firstRecordDate: timelineDates[0] || member.joined_date || '',
        lastRecordDate: timelineDates[timelineDates.length - 1] || member.left_date || '',
        attendanceRecords: attendanceBasis.length,
        attendanceScope: trainingAttendance.length ? 'training sessions' : 'recorded sessions',
        attended,
        missed,
        knownAttendance,
        attendancePercent,
        selectedGames: publishedSquads.length,
        publishedResults: games.filter(game => game.has_published_result).length,
        playerOfMatch: matchAwards.length,
        matchAwards,
        playerRank,
        rankedPlayers: rankedRatings.length,
        ratingTotalPoints: studentRating?.total || 0,
        ratingCount: studentRating?.ratings || 0,
        ratingCriteria: studentRating ? [...studentRating.criteria].filter(Boolean) : [],
        games,
        latestReport: teamReports[0] || null,
        reports: teamReports,
        // Player of the Match rewards are shown with their match, not twice.
        rewards: teamRewards.filter(row => !isMatchAward(row)),
        playerOfMonth: teamMonths
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aDate = a.firstRecordDate || '9999-12-31';
      const bDate = b.firstRecordDate || '9999-12-31';
      return String(aDate).localeCompare(String(bDate)) ||
        String(a.team_name || '').localeCompare(String(b.team_name || ''));
    });

  return {
    teams: built,
    totals: {
      teams: built.length,
      attendanceRecords: built.reduce((sum, team) => sum + team.attendanceRecords, 0),
      attended: built.reduce((sum, team) => sum + team.attended, 0),
      knownAttendance: built.reduce((sum, team) => sum + team.knownAttendance, 0),
      selectedGames: built.reduce((sum, team) => sum + team.selectedGames, 0),
      publishedResults: built.reduce((sum, team) => sum + team.publishedResults, 0),
      playerOfMatch: built.reduce((sum, team) => sum + team.playerOfMatch, 0),
      progressReports: reports.length,
      ratingRecords: playerRatings.filter(row => row.student_id === studentId).length,
      rewards: rewards.length,
      playerOfMonth: monthAwards.length,
      activities: [...new Set(built.map(team => team.activity).filter(Boolean))],
      seasons: [...new Set(built.flatMap(team => team.seasons || []).filter(Boolean))].sort()
    }
  };
}

async function loadPanthersJourney(studentId) {
  if (!studentId) return { teams: [], totals: {} };
  return buildPanthersJourney(studentId, await fetchPanthersRows(studentId));
}

/* Approvals → "Draft more": write quotes for Panthers students who have
 * no coach words and no quote yet. `checked` remembers students already
 * looked at this session so each click moves on to new ones. */
async function draftQuotesInBatch(checked, email, { maxDrafts = 12, maxScan = 30 } = {}) {
  const candidates = (await studentsNeedingQuotes(400)).filter(row => !checked.has(row.student_id));
  let made = 0;
  let scanned = 0;
  for (const row of candidates) {
    if (made >= maxDrafts || scanned >= maxScan) break;
    scanned += 1;
    checked.add(row.student_id);
    try {
      const panthers = await loadPanthersJourney(row.student_id);
      if (latestCoachWords(panthers)) continue;
      const draft = draftCoachQuote({ panthers, studentName: row.full_name });
      if (!draft) continue;
      await createQuoteDraft(row.student_id, draft, email);
      made += 1;
    } catch (error) {
      console.warn('Draft skipped for', row.student_id, error);
    }
  }
  return { made, scanned, remaining: Math.max(0, candidates.length - scanned) };
}

export default function App() {
  const params = new URLSearchParams(location.search);

  const token = location.pathname.startsWith('/p/')
    ? decodeURIComponent(location.pathname.split('/p/')[1] || '')
    : params.get('share');

  const previewStudent = params.get('previewStudent');

  if (token) return <PublicGate token={token} />;
  if (previewStudent) return <PrivatePreviewGate studentId={previewStudent} />;

  /* The student-space landing page is the front door for everyone.
   * Sign-in and the workspace live at /login (with /app kept as an alias). */
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/login' || path === '/app') return <PrivateApp />;

  /* Members only: another student's portfolio. */
  if (path.startsWith('/portfolio/')) {
    return <MemberPortfolioGate portfolioKey={decodeURIComponent(path.slice('/portfolio/'.length))} />;
  }

  return <HomeGate />;
}

/* "/": the student-space landing page for everyone. */
function HomeGate() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return undefined;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next || null));
    return () => data.subscription.unsubscribe();
  }, []);

  /* Coming back from a link that needed sign-in (e.g. a member portfolio). */
  useEffect(() => {
    if (!session) return;
    const next = new URLSearchParams(window.location.search).get('next');
    if (next && /^\/(?!\/)/.test(next) && next !== '/') window.location.replace(next);
  }, [session]);

  if (!hasSupabaseConfig) {
    return (
      <StatePage
        icon={<AlertCircle />}
        title="We’ll be back shortly"
        text="The TBS Student Portfolio is getting ready. Please check back in a little while."
      />
    );
  }

  if (session === undefined) return <Splash text="Opening TBS Student Portfolio…" />;

  /* Everyone sees the student-space landing page. Visitors see initials
   * only; opening or editing a portfolio asks them to sign in. */
  return <Landing />;
}

function PrivatePreviewGate({ studentId }) {
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: ''
  });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session;

        if (!session) {
          throw new Error('Your TBS session is no longer active. Please return to the dashboard and sign in again.');
        }

        const [journey, panthers] = await Promise.all([
          loadJourney(studentId),
          loadPanthersJourney(studentId)
        ]);

        if (!journey?.student) {
          throw new Error('This student portfolio could not be loaded.');
        }

        if (active) {
          setState({
            loading: false,
            data: { ...journey, panthers },
            error: ''
          });
        }
      } catch (error) {
        if (active) {
          setState({
            loading: false,
            data: null,
            error: friendlyError(error, 'This portfolio preview couldn’t open just now. Please try again.')
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [studentId]);

  if (state.loading) {
    return <Splash text="Opening private preview…" />;
  }

  if (state.error) {
    return (
      <StatePage
        icon={<AlertCircle />}
        title="Preview unavailable"
        text={state.error}
        action={
          <button className="primary" onClick={() => window.close()}>
            CLOSE PREVIEW
          </button>
        }
      />
    );
  }

  return <Portfolio data={toPublicShape(state.data, true)} preview />;
}

function MemberPortfolioGate({ portfolioKey }) {
  const [state, setState] = useState({ loading: true, data: null, error: '', access: '' });

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }

      try {
        const result = await loadMemberPortfolio(portfolioKey);
        /* The Panthers sports record, as on the private preview. */
        const panthers = await loadPanthersJourney(result.student?.student_id).catch(() => ({ teams: [], totals: {} }));
        if (alive) {
          setState({
            loading: false,
            error: '',
            access: result.access,
            data: {
              valid: true,
              student: result.student,
              profile: result.profile || {},
              entries: result.entries || [],
              evidence: result.evidence || [],
              approvedQuote: result.approvedQuote || null,
              schoolAwards: result.schoolAwards || [],
              panthers
            }
          });
        }
      } catch (error) {
        if (alive) {
          setState({ loading: false, data: null, error: friendlyError(error, 'This portfolio couldn’t open just now. Please try again.'), access: error.access || '' });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [portfolioKey]);

  if (state.loading) return <Splash text="Opening portfolio…" />;

  if (state.error) {
    return (
      <StatePage
        icon={<AlertCircle />}
        title={state.access === 'request' ? 'Access needed' : 'Portfolio unavailable'}
        text={
          state.access === 'request'
            ? 'This portfolio is private. Request access from the TBS Student Portfolio page and the SuperAdmin will review it.'
            : state.error
        }
        action={
          <button className="primary" onClick={() => window.location.assign('/')}>
            BACK TO ALL PORTFOLIOS
          </button>
        }
      />
    );
  }

  const canEdit = state.access === 'own' || state.access === 'staff';
  return (
    <Portfolio
      data={state.data}
      member
      editHref={
        canEdit && state.data?.student?.student_id
          ? `/login?edit=${encodeURIComponent(state.data.student.student_id)}`
          : null
      }
    />
  );
}

function PrivateApp() {
  const [session, setSession] = useState(null);
  const [boot, setBoot] = useState(true);
  const [asking, setAsking] = useState(false);
  const [account, setAccount] = useState(null);
  const [children, setChildren] = useState([]);
  const [selected, setSelected] = useState(null);
  const [accountState, setAccountState] = useState('idle');
  const [initialTab, setInitialTab] = useState('overview');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBoot(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.email) {
      setAccount(null);
      setChildren([]);
      setSelected(null);
      setAccountState('idle');
      return;
    }

    setAccountState('loading');

    (async () => {
      try {
        let nextAccount = await getAccount(session.user.email);
        const kids = await getParentChildren(session.user.email);

        if (!nextAccount && kids.length) {
          nextAccount = {
            email: session.user.email,
            full_name: 'Parent',
            role: 'Parent'
          };
        }

        const params = new URLSearchParams(window.location.search);

        /* "View all portfolios" signs in, then returns to the landing page.
         * Only same-site paths are accepted, and this happens once. */
        const next = params.get('next');
        if (nextAccount && next && /^\/(?!\/)/.test(next) && !next.startsWith('/login')) {
          window.location.replace(next);
          return;
        }

        setAccount(nextAccount);
        setChildren(kids);

        /* "Edit portfolio" from the landing page: open that student's Profile. */
        const edit = params.get('edit');
        const editable =
          edit &&
          (isAdmin(nextAccount?.role) ||
            nextAccount?.student_id === edit ||
            kids.some(kid => kid.student_id === edit));

        const tabParam = params.get('tab');
        if (tabParam === 'browse') setInitialTab('browse');

        if (editable) {
          setSelected(kids.find(kid => kid.student_id === edit) || { student_id: edit });
          setInitialTab('profile');
          window.history.replaceState(null, '', '/login');
        } else if (nextAccount?.student_id) {
          setSelected({ student_id: nextAccount.student_id });
        } else if (!isAdmin(nextAccount?.role) && kids.length === 1) {
          setSelected(kids[0]);
        }
      } catch (error) {
        console.error('Student Journey boot failed', error);
      } finally {
        setAccountState('ready');
      }
    })();
  }, [session?.user?.email]);

  if (!hasSupabaseConfig) {
    return (
      <StatePage
        icon={<AlertCircle />}
        title="We’ll be back shortly"
        text="The TBS Student Portfolio is getting ready. Please check back in a little while."
      />
    );
  }

  if (boot) return <Splash text="Opening Student Journey…" />;
  if (!session) {
    return (
      <>
        <Login onRequestAccess={() => setAsking(true)} />
        {asking && <RequestAccess general onClose={() => setAsking(false)} />}
      </>
    );
  }
  /* Wait for the account lookup — never flash "access not found" while it loads. */
  if (!account && accountState !== 'ready') return <Splash text="Opening Student Journey…" />;
  if (!account) return <AccessDenied email={session.user.email} />;

  return (
    <Portal
      initialTab={initialTab}
      session={session}
      account={account}
      children={children}
      selected={selected}
      setSelected={setSelected}
    />
  );
}

function Login({ onRequestAccess }) {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState('email');
  const [otp, setOtp] = useState(Array(6).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const refs = useRef([]);

  useEffect(() => {
    if (!resendIn) return;
    const timer = setInterval(() => {
      setResendIn(value => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  async function sendCode(event) {
    event?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) return;

    setBusy(true);
    setError('');

    try {
      /* First time here? The journey-first-signin function creates the
       * sign-in for people already in the shared records (users, students,
       * parents, award staff). If the function isn't reachable, carry on:
       * people who already have a sign-in are unaffected. */
      try {
        const { data: first } = await supabase.functions.invoke('journey-first-signin', { body: { email: clean } });
        if (first?.reason === 'not_on_school_list') throw new Error('not_on_school_list');
      } catch (firstErr) {
        if (firstErr?.message === 'not_on_school_list') throw firstErr;
      }

      const { error: sendError } = await supabase.auth.signInWithOtp({
        email: clean,
        options: { shouldCreateUser: false }
      });
      if (sendError) throw sendError;

      setEmail(clean);
      setOtp(Array(6).fill(''));
      setPhase('otp');
      setResendIn(45);
      setTimeout(() => refs.current[0]?.focus(), 120);
    } catch (err) {
      setError(friendlyError(err, 'We couldn’t send your sign-in code. Please check your email address and try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event) {
    event?.preventDefault();
    const token = otp.join('');
    if (token.length !== 6) return;

    setBusy(true);
    setError('');

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email'
      });
      if (verifyError) throw verifyError;
    } catch (err) {
      setError(friendlyError(err, 'That code didn’t work. Please check it and try again, or ask for a new one.'));
    } finally {
      setBusy(false);
    }
  }

  function digit(index, value) {
    const clean = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = clean;
    setOtp(next);
    if (clean && index < 5) refs.current[index + 1]?.focus();
  }

  function pasteOtp(event) {
    const code = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!code) return;
    event.preventDefault();
    setOtp(Array(6).fill('').map((_, index) => code[index] || ''));
  }

  return (
    <div className="loginPage">
      <section className="loginVisual">
        <div className="loginGlow" />

        <div className="panthersBrand">
          <img src={PANTHERS_LOGO} alt="TBS Panthers" />
          <div>
            <b>TBS PANTHERS</b>
            <span>THRIVE · BELIEVE · SUCCEED</span>
          </div>
        </div>

        <div className="loginSequence">
          <span>01</span><i />YOUR STORY STARTS HERE
        </div>

        <div className="loginVisualCopy">
          <small>THE BRITISH SCHOOL · NEW DELHI</small>
          <h1>Every experience<br />leaves a mark.</h1>
          <p>
            One place for the moments, reflections and achievements that shape your journey.
          </p>
          <div className="journeyPills">
            <span>SPORT</span><span>SERVICE</span><span>LEADERSHIP</span><span>CREATIVITY</span>
          </div>
        </div>

        <div className="loginWatermark">JOURNEY</div>
      </section>

      <section className="loginFormPanel">
        <div className="secureTop">SECURE TBS ACCESS <i /> LIVE</div>

        <form className="loginCard" onSubmit={phase === 'email' ? sendCode : verify}>
          <img className="tbsLoginLogo" src={TBS_LOGO} alt="The British School" />
          <small>THE BRITISH SCHOOL · NEW DELHI</small>
          <h2>Student<br />Journey</h2>

          {phase === 'email' ? (
            <>
              <p>Enter your registered school email to access your private portfolio workspace.</p>
              <div className="miniBadge">6-DIGIT MAGIC CODE</div>

              <label>
                School / registered email
                <div className="inputShell">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="name@british-school.org"
                  />
                  <span>@TBS</span>
                </div>
              </label>

              {error && <p className="errorText">{error}</p>}

              <button className="loginSubmit" disabled={busy}>
                {busy ? 'SENDING CODE…' : 'SEND MAGIC CODE'} <b>→</b>
              </button>

              <em>A 6-digit access code will be sent to your registered email.</em>

              {onRequestAccess && (
                <button type="button" className="loginRequest" onClick={onRequestAccess}>
                  Not part of TBS? <b>Request access</b>
                </button>
              )}
            </>
          ) : (
            <>
              <p>
                Enter the 6-digit access code sent to <strong>{email}</strong>.
              </p>

              <div className="otpHead">
                <b>ACCESS CODE</b>
                <button
                  type="button"
                  onClick={() => {
                    setPhase('email');
                    setError('');
                  }}
                >
                  CHANGE EMAIL
                </button>
              </div>

              <div className="otpGrid" onPaste={pasteOtp}>
                {otp.map((value, index) => (
                  <input
                    key={index}
                    ref={element => { refs.current[index] = element; }}
                    value={value}
                    onChange={event => digit(index, event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Backspace' && !otp[index] && index > 0) {
                        refs.current[index - 1]?.focus();
                      }
                    }}
                    inputMode="numeric"
                    maxLength={1}
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  />
                ))}
              </div>

              {error && <p className="errorText">{error}</p>}

              <button className="loginSubmit" disabled={busy || otp.join('').length !== 6}>
                {busy ? 'VERIFYING…' : 'VERIFY & CONTINUE'} <b>✓</b>
              </button>

              <div className="resend">
                Didn't receive it?
                <button type="button" disabled={resendIn > 0 || busy} onClick={sendCode}>
                  {resendIn ? `RESEND IN ${resendIn}s` : 'RESEND CODE'}
                </button>
              </div>
            </>
          )}
        </form>

        <footer>
          TBS STUDENT JOURNEY
          <span>THRIVE · BELIEVE · SUCCEED</span>
        </footer>
      </section>
    </div>
  );
}

function AccessDenied({ email }) {
  return (
    <StatePage
      icon={<AlertCircle />}
      title="Student Journey access not found"
      text={`${email} is authenticated but is not linked to a Student Journey role.`}
      action={<button className="primary" onClick={signOut}>SIGN OUT</button>}
    />
  );
}

function StatePage({ icon, title, text, action }) {
  return (
    <div className="centerState">
      {icon}
      <h1>{title}</h1>
      <p>{text}</p>
      {action}
    </div>
  );
}

function Splash({ text }) {
  return (
    <div className="splash">
      <div className="spinner" />
      <span>{text}</span>
    </div>
  );
}

function Portal({ session, account, children, selected, setSelected, initialTab = 'overview' }) {
  const admin = isAdmin(account.role);
  const superadmin = isSuperAdmin(account.role);
  const coach = isCoach(account.role);
  /* Staff = Admin, SuperAdmin or Coach: can find any student, edit About me
   * and approve coach quotes. Verifying moments and sharing stay Admin-only. */
  const staff = admin || coach;
  const parent = String(account.role).toLowerCase() === 'parent';

  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [builder, setBuilder] = useState(null);
  const [importing, setImporting] = useState(false);
  const [journeyNotice, setJourneyNotice] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState([]);
  const [quoteDrafts, setQuoteDrafts] = useState([]);
  const [requestCount, setRequestCount] = useState(0);
  const [awardRole, setAwardRole] = useState(undefined);

  const studentId = selected?.student_id || null;

  /* Award Builder role (Key Stage Office / Head of Year / Tutor / Teacher). */
  useEffect(() => {
    loadMyAwardRole().then(setAwardRole).catch(() => setAwardRole(null));
  }, [account.email]);

  const awardStaff = Boolean(awardRole);
  /* Teachers added through Staff & classes: awards only, no student search. */
  const staffOnly = !admin && !coach && !parent && !account.student_id;


  /* Staff-only accounts open on "Enter awards". */
  useEffect(() => {
    if (staffOnly && awardRole && ['overview', 'journey', 'profile', 'media'].includes(tab)) setTab('award-entry');
  }, [staffOnly, awardRole]);

  /* Pending directory access requests (badge in the side nav). */
  useEffect(() => {
    if (!superadmin) return;
    countPendingAccessRequests()
      .then(setRequestCount)
      .catch(() => setRequestCount(0));
  }, [superadmin]);

  /* silent: refresh in the background without the full-screen loader, so
   * panels (e.g. a freshly generated share link) are not unmounted. */
  async function refresh({ silent = false } = {}) {
    if (!studentId) {
      setData(null);
      setLoadError('');
      return;
    }

    if (!silent) setLoading(true);
    setLoadError('');

    try {
      const [loaded, panthers] = await Promise.all([
        loadJourney(studentId),
        loadPanthersJourney(studentId)
      ]);

      if (!loaded?.student) {
        throw new Error('This portfolio couldn’t load just now. Please try again.');
      }

      setData({ ...loaded, panthers });
      if (staff) draftQuoteIfNeeded(loaded, panthers);
    } catch (error) {
      console.error('Journey load failed', error);
      if (!silent) {
        setData(null);
        setLoadError(friendlyError(error, 'This portfolio couldn’t load just now. Please try again.'));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [studentId]);

  useEffect(() => {
    if (!staff || search.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      searchStudents(search)
        .then(setResults)
        .catch(error => setNotice(friendlyError(error)));
    }, 220);

    return () => clearTimeout(timer);
  }, [search, staff]);

  /* When staff open a student with Panthers records but no coach words yet,
   * the app writes a draft quote for a coach to approve. Never printed as is. */
  async function draftQuoteIfNeeded(loaded, panthers) {
    try {
      const sid = loaded?.student?.student_id;
      if (!sid || loaded.approvedQuote || latestCoachWords(panthers)) return;
      const draft = draftCoachQuote({ panthers, studentName: loaded.student.full_name });
      if (!draft) return;
      if (await hasOpenOrApprovedQuote(sid)) return;
      await createQuoteDraft(sid, draft, session.user.email);
    } catch (error) {
      console.warn('Coach quote draft skipped', error);
    }
  }

  async function refreshApprovals() {
    if (!staff) return;
    try {
      if (admin) {
        const list = await loadPendingEntries();
        setPending(
          (list || []).filter(item => ['submitted', 'pending'].includes(item.verification_status))
        );
      }
    } catch (error) {
      setNotice(friendlyError(error));
    }
    try {
      setQuoteDrafts(await loadQuoteDrafts());
    } catch (error) {
      console.warn('Coach quotes unavailable (run migration 20261005?)', error);
      setQuoteDrafts([]);
    }
  }

  useEffect(() => {
    if (staff && tab === 'approvals') refreshApprovals();
  }, [tab, staff]);

  /* Publish to portfolio: Admin / SuperAdmin, Key Stage Office, Head of Year. */
  const canPublish =
    admin || (awardRole?.roles || []).some(r => ['key_stage_office', 'head_of_year'].includes(r.award_role));
  /* Left nav follows the portfolio's own order: Me, Academic awards, Panthers
   * awards, Journey, then admin tools. */
  const academicTabs = [
    ...(admin || awardStaff ? ['award-entry', 'award-reports'] : []),
    ...(canPublish ? ['award-publish'] : []),
    ...(admin ? ['award-setup', 'award-staff'] : []),
    ...(superadmin ? ['award-lists'] : [])
  ];
  const panthersTabs = admin || coach ? ['award-panthers', 'award-comments'] : [];
  const awardTabs = [...academicTabs, ...panthersTabs];
  const navGroups = staffOnly
    ? [['Panthers awards', panthersTabs], ['Academic awards', academicTabs]]
    : [
        ['Me', ['overview', 'profile']],
        ['Journey', ['journey', 'media']],
        ['Panthers awards', panthersTabs],
        ['Academic awards', academicTabs],
        ['Admin', ['browse', ...(staff ? ['approvals'] : []), ...(admin ? ['sharing'] : []), ...(superadmin ? ['requests'] : [])]]
      ];
  const nav = navGroups.flatMap(([, items]) => items);

  const navItems = {
    overview: ['Overview', LayoutDashboard],
    journey: ['Journey moments', Sparkles],
    profile: ['Profile', UserRound],
    media: ['Media & evidence', ImageIcon],
    browse: ['Browse portfolios', Compass],
    approvals: ['Approvals', CheckCircle2],
    sharing: ['Sharing & access', Globe2],
    requests: ['Access requests', Inbox],
    'award-entry': ['Enter awards', Award],
    'award-reports': ['Award reports', BarChart3],
    'award-setup': ['Award setup', Settings2],
    'award-staff': ['Staff & classes', Users],
    'award-lists': ['Lists & settings', ListChecks],
    'award-comments': ['Award comments', MessageSquareQuote],
    'award-publish': ['Publish to portfolio', Globe2],
    'award-panthers': ['Add Panthers award', Trophy]
  };
  const tabTitles = {
    approvals: 'Approvals',
    browse: 'Browse portfolios',
    requests: 'Access requests',
    'award-entry': 'Enter awards',
    'award-reports': 'Award reports',
    'award-setup': 'Award setup',
    'award-staff': 'Staff & classes',
    'award-lists': 'Lists & settings',
    'award-comments': 'Award comments',
    'award-publish': 'Publish to portfolio',
    'award-panthers': 'Add Panthers award'
  };

  /* Tabs that work without a selected student. */
  const awardTab = tab.startsWith('award-');
  const globalTab = tab === 'approvals' || tab === 'requests' || tab === 'browse' || awardTab;
  const displayName = account.full_name || session.user.email;
  const initials = String(displayName)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');

  return (
    <div className="portal ws">
      <aside className="side">
        <a className="wsBrand" href="/" title="Back to TBS Student Portfolio">
          <img src={TBS_LOGO} alt="" />
          <span>
            <b>TBS <em>Student</em> Portfolio</b>
            <small>Workspace</small>
          </span>
        </a>

        <nav className="wsNav">
          {navGroups.filter(([, items]) => items.length).map(([groupLabel, items]) => (
            <React.Fragment key={groupLabel}>
              <span className="wsNavLabel">{groupLabel}</span>
              {items.map(item => {
                const [label, Icon] = navItems[item];
                const badge = item === 'requests' ? requestCount : 0;
                return (
                  <button key={item} className={tab === item ? 'on' : ''} onClick={() => setTab(item)}>
                    <Icon />
                    <span>{label}</span>
                    {badge > 0 && <span className="navBadge">{badge}</span>}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </nav>

        <div className="wsUser">
          <span className="wsUserAvatar">{initials || '•'}</span>
          <span className="wsUserText">
            <b>{displayName}</b>
            <small>
              {awardRole && !admin
                ? (awardRole.roles || [awardRole])
                    .map(r => ({ key_stage_office: 'Key Stage Office', head_of_year: 'Head of Year', class_teacher: 'Tutor', subject_teacher: 'Teacher' })[r.award_role])
                    .join(' · ')
                : account.role}
            </small>
          </span>
          <button onClick={signOut} aria-label="Sign out" title="Sign out">
            <LogOut />
          </button>
        </div>
      </aside>

      <main className="portalMain">
        <header className="portalTop">
          <div>
            <small>{tab === 'award-comments' || tab === 'award-panthers' ? 'AWARDS · PANTHERS & SCHOOL' : awardTab ? 'SCHOOL AWARDS' : 'PRIVATE WORKSPACE'}</small>
            <strong>
              {globalTab
                ? tabTitles[tab]
                : selected?.full_name || data?.student?.full_name || 'Student Journey'}
            </strong>
          </div>

          {studentId && !globalTab && (
            <button
              className="ghost"
              onClick={() => {
                const previewUrl = new URL(window.location.href);
                previewUrl.search = '';
                previewUrl.hash = '';
                previewUrl.searchParams.set('previewStudent', studentId);
                window.open(previewUrl.toString(), '_blank', 'noopener,noreferrer');
              }}
            >
              <Eye size={15} /> Preview portfolio
            </button>
          )}
        </header>

        <div className="portalBody isWide">
          {notice && (
            <div className="notice" onClick={() => setNotice('')}>
              {notice}<X size={14} />
            </div>
          )}

          {parent && children.length > 1 && (
            <StudentChooser
              title="Choose your child"
              students={children}
              selected={studentId}
              onSelect={student => {
                setData(null);
                setSelected(student);
                setTab('overview');
              }}
            />
          )}

          {staff && !awardTab && !['approvals', 'requests', 'browse'].includes(tab) && (
            <AdminStudentSearch
              search={search}
              setSearch={setSearch}
              results={results}
              onSelect={student => {
                setData(null);
                setSelected(student);
                setSearch('');
                setResults([]);
                setTab(current => (current === 'sharing' ? 'sharing' : 'overview'));
              }}
            />
          )}

          {tab === 'sharing' && admin && <SchoolSharingSettings superadmin={superadmin} />}

          {!studentId && !globalTab && tab === 'sharing' ? (
            <p className="sharingPickHint">Pick a student above to set their Journey display, their TBS community access and a secure public link.</p>
          ) : !studentId && !globalTab ? (
            <EmptySelect parent={parent} />
          ) : loading ? (
            <Splash text="Loading journey…" />
          ) : loadError && !globalTab ? (
            <JourneyLoadError student={selected} message={loadError} onRetry={refresh} />
          ) : !data && !globalTab ? (
            <JourneyLoadError
              student={selected}
              message="This portfolio is taking a little longer than usual. Please try again."
              onRetry={refresh}
            />
          ) : (
            <>
              {tab === 'overview' && data && (
                <Overview
                  data={data}
                  admin={admin}
                  onAdd={() => setBuilder({})}
                  setTab={setTab}
                />
              )}

              {tab === 'journey' && data && (
                <JourneyList
                  data={data}
                  admin={admin}
                  notice={journeyNotice}
                  onDismissNotice={() => setJourneyNotice('')}
                  onImport={parent ? null : () => setImporting(true)}
                  onAdd={() => setBuilder({})}
                  onEdit={entry => setBuilder(entry)}
                  onDelete={async entry => {
                    if (!confirm('Delete this Journey Moment?')) return;
                    try {
                      await deleteEntry(entry.id);
                      await refresh();
                    } catch (error) {
                      alert(friendlyError(error));
                    }
                  }}
                  onPublic={async (entry, value) => {
                    try {
                      await setPublicEntry(entry.id, value);
                      await refresh();
                    } catch (error) {
                      alert(friendlyError(error));
                    }
                  }}
                />
              )}

              {tab === 'profile' && data && (
                <ProfileEditor data={data} admin={admin} staff={staff} editor={account} onRefresh={refresh} />
              )}

              {tab === 'media' && data && (
                <MediaManager
                  data={data}
                  admin={admin}
                  onRefresh={refresh}
                  onPublic={async (evidence, value) => {
                    try {
                      await setEvidencePublic(evidence.id, value);
                      await refresh();
                    } catch (error) {
                      alert(friendlyError(error));
                    }
                  }}
                />
              )}

              {tab === 'approvals' && staff && (
                <Approvals
                  items={pending}
                  showMoments={admin}
                  quotes={quoteDrafts}
                  account={account}
                  onReview={async (entry, status, note) => {
                    await reviewEntry(entry.id, status, note);
                    await refreshApprovals();
                    if (studentId) await refresh();
                  }}
                  onReviewQuote={async (quote, status, text) => {
                    await reviewQuote(quote.id, status, text, account);
                    await refreshApprovals();
                  }}
                  onReviewMany={async (entries, status, note) => {
                    let done = 0;
                    for (const entry of entries) {
                      // eslint-disable-next-line no-await-in-loop
                      await reviewEntry(entry.id, status, note);
                      done += 1;
                    }
                    await refreshApprovals();
                    if (studentId) await refresh();
                    return done;
                  }}
                  onReviewQuotes={async (list, status) => {
                    let done = 0;
                    for (const { quote, text } of list) {
                      // eslint-disable-next-line no-await-in-loop
                      await reviewQuote(quote.id, status, status === 'approved' ? text : null, account);
                      done += 1;
                    }
                    await refreshApprovals();
                    return done;
                  }}
                  onDraftMore={async checked => {
                    const made = await draftQuotesInBatch(checked, session.user.email);
                    await refreshApprovals();
                    return made;
                  }}
                />
              )}

              {tab === 'sharing' && admin && data && (
                <Sharing
                  data={data}
                  onRefresh={() => refresh({ silent: true })}
                  superadmin={superadmin}
                />
              )}

              {tab === 'browse' && (
                <BrowsePortfolios
                  onEdit={person => {
                    setData(null);
                    setSelected({ student_id: person.studentId, full_name: person.name });
                    setTab('profile');
                  }}
                />
              )}

              {tab === 'award-entry' && (admin || awardStaff) && (
                <AwardEntry account={account} awardRole={awardRole} admin={admin} />
              )}
              {tab === 'award-reports' && (admin || awardStaff) && <AwardReports account={account} />}
              {tab === 'award-setup' && admin && <AwardSetup account={account} />}
              {tab === 'award-staff' && admin && <AwardStaff />}
              {tab === 'award-lists' && superadmin && <AwardLists />}
              {tab === 'award-publish' && canPublish && <AwardPublish awardRole={awardRole} admin={admin} />}
              {tab === 'award-panthers' && (admin || coach) && <PanthersAwardAdd email={account.email} />}
              {tab === 'award-comments' && (admin || coach) && <AwardComments email={account.email} superadmin={admin} roleLabel={superadmin ? 'SuperAdmin' : admin ? 'Admin' : 'Coach'} />}

              {tab === 'requests' && superadmin && (
                <AccessRequests
                  onCountChange={setRequestCount}
                  onOpenSharing={request => {
                    setData(null);
                    setSelected({
                      student_id: request.student_id,
                      full_name: request.student?.full_name
                    });
                    setTab('sharing');
                  }}
                />
              )}

            </>
          )}
        </div>
      </main>

      {importing && studentId && data && (
        <ManageBacImport
          student={data.student || selected}
          staff={staff}
          admin={admin}
          entries={data.entries || []}
          options={{ types: ENTRY_TYPES, areas: DOMAIN_OPTIONS, levels: LEVEL_OPTIONS }}
          onClose={() => setImporting(false)}
          onDone={async (count, note = '') => {
            setImporting(false);
            setTab('journey');
            setJourneyNotice(
              `${count} draft${count === 1 ? '' : 's'} saved from ManageBac. Add photos and any missing details, then publish each one.${note}`
            );
            await refresh();
          }}
        />
      )}

      {builder && studentId && (
        <JourneyBuilder
          initial={builder}
          evidence={builder.id ? (data?.evidence || []).filter(item => item.entry_id === builder.id) : []}
          library={(data?.evidence || []).filter(
            item => item.active !== false && isPhoto(item) && (!builder.id || item.entry_id !== builder.id)
          )}
          student={data?.student || selected}
          role={account.role}
          onClose={() => setBuilder(null)}
          onDone={async () => {
            setBuilder(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function JourneyLoadError({ student, message, onRetry }) {
  return (
    <div className="journeyLoadError">
      <AlertCircle />
      <small>JUST A MOMENT</small>
      <h2>{student?.full_name || 'Student Journey'}</h2>
      <p>{message}</p>
      <button className="primary" onClick={onRetry}>TRY AGAIN</button>
    </div>
  );
}

function StudentChooser({ title, students, selected, onSelect }) {
  return (
    <section className="chooser">
      <small>{title}</small>
      <div>
        {students.map(student => (
          <button
            key={student.student_id}
            className={selected === student.student_id ? 'on' : ''}
            onClick={() => onSelect(student)}
          >
            <span className="avatar">{student.full_name?.[0]}</span>
            <b>{student.full_name}</b>
            <em>{student.year_group || 'The British School'}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function AdminStudentSearch({ search, setSearch, results, onSelect }) {
  return (
    <div className="adminSearch">
      <Search size={17} />
      <input
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder="Search student by name"
      />

      {results.length > 0 && (
        <div className="searchResults">
          {results.map(student => (
            <button key={student.student_id} onClick={() => onSelect(student)}>
              <b>{student.full_name}</b>
              <span>{student.year_group || 'The British School'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptySelect({ parent }) {
  return (
    <div className="emptyState">
      <Users />
      <h2>{parent ? 'Select a child' : 'Select a student'}</h2>
      <p>
        {parent
          ? 'Choose a linked child to manage their Journey.'
          : 'Search above by student name.'}
      </p>
    </div>
  );
}

function Overview({ data, admin, onAdd, setTab }) {
  if (!data?.student) return null;

  const entries = data.entries || [];
  const verified = entries.filter(entry => entry.verification_status === 'verified').length;
  const submitted = entries.filter(entry => entry.verification_status === 'submitted').length;
  const panthersTeams = data.panthers?.totals?.teams || 0;

  return (
    <>
      <section className="dashHero">
        <small>{data.student.year_group || 'The British School'}</small>
        <h1>{data.student.full_name}</h1>
        <p>
          {data.profile?.headline || 'A living record of experiences, reflection and growth.'}
        </p>
        <button className="primary" onClick={onAdd}><Plus /> ADD JOURNEY MOMENT</button>
      </section>

      <div className="stats">
        <article><b>{entries.length}</b><span>Journey moments</span></article>
        <article><b>{verified}</b><span>Verified</span></article>
        <article><b>{submitted}</b><span>Awaiting approval</span></article>
        <article><b>{data.evidence?.length || 0}</b><span>Media & evidence</span></article>
        <article><b>{panthersTeams}</b><span>Panthers teams</span></article>
      </div>

      <section className="panel">
        <PanelHead
          kicker="RECENT JOURNEY"
          title="Latest moments"
          action={<button className="textBtn" onClick={() => setTab('journey')}>VIEW ALL →</button>}
        />
        {entries.slice(0, 4).map(entry => (
          <MomentRow key={entry.id} entry={entry} />
        ))}
      </section>

      {!!data.panthers?.teams?.length && (
        <section className="panel panthersPreviewPanel">
          <PanelHead kicker="TBS PANTHERS" title="Official sports record connected" />
          <div className="panthersPreviewGrid">
            {data.panthers.teams.slice(0, 3).map(team => (
              <article key={team.team_id}>
                <img src={team.team_banner_url || team.team_image_url || PANTHERS_LOGO} alt="" />
                <div>
                  <small>{team.activity || 'PANTHERS'}</small>
                  <h3>{team.team_name}</h3>
                  <p>
                    {team.seasons?.join(' · ') || 'Current programme'} · {team.selectedGames} published squad selection{team.selectedGames === 1 ? '' : 's'}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {admin && (
        <div className="adminHint">
          <ShieldCheck />
          <div>
            <b>School publishing control</b>
            <p>
              Verification and public visibility remain separate. Admin/SuperAdmin can manage the
              complete student portfolio.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function PanelHead({ kicker, title, action }) {
  return (
    <div className="panelHead">
      <div><small>{kicker}</small><h2>{title}</h2></div>
      {action}
    </div>
  );
}

function MomentRow({ entry, actions, extra = null }) {
  return (
    <div className="momentRow">
      <div className="dateBox">
        <b>{entry.event_date ? new Date(`${entry.event_date}T00:00:00`).getFullYear() : '—'}</b>
        <span>{domainLabel(entry.domain)}</span>
      </div>

      <div className="momentMain">
        <h3>{entry.title}</h3>
        <p>{entry.description || 'No description yet.'}</p>
        {extra}
      </div>

      <Status status={entry.verification_status} />
      {actions}
    </div>
  );
}

function Status({ status }) {
  const value = status || 'draft';

  return (
    <span className={`status ${value}`}>
      {value === 'verified' ? (
        <CheckCircle2 />
      ) : value === 'rejected' ? (
        <AlertCircle />
      ) : (
        <Clock3 />
      )}
      {STATUS_LABELS[value] || value}
    </span>
  );
}

/* What a draft still needs before it can be published (same rules as the
 * Add Journey Moment form). Photos are a nudge, not a blocker. */
function draftGaps(entry, evidence = []) {
  const words = text => (String(text || '').trim().match(/\S+/g) || []).length;
  const gaps = [];
  if (!String(entry.title || '').trim()) gaps.push(['Title', 1]);
  if (!entry.event_date) gaps.push(['Date', 1]);
  if (!String(entry.organisation || '').trim()) gaps.push(['Where or with whom', 1]);
  if (!entry.level) gaps.push(['Level', 1]);
  if (words(entry.description) < 10) gaps.push(['Story', 2]);
  if (words(entry.reflection) < 10) gaps.push(['Reflection', 3]);
  if (!arr(entry.skills).length) gaps.push(['Skills', 3]);
  const mine = evidence.filter(item => item.entry_id === entry.id);
  const photos = mine.some(item => isPhoto(item) || item.media_provider === 'youtube');
  if (!mine.length) gaps.push(['Photo or file', 4]);
  return { gaps, photos, step: gaps.length ? Math.min(...gaps.map(([, n]) => n)) : 4 };
}

const JOURNEY_FILTERS = [
  ['all', 'All'],
  ['draft', 'Drafts'],
  ['submitted', 'Waiting for TBS'],
  ['verified', 'Verified'],
  ['rejected', 'Not approved']
];

function JourneyList({ data, admin, onAdd, onImport, onEdit, onDelete, onPublic, notice, onDismissNotice }) {
  /* Every moment can be edited, whoever added it (migration 20261018);
   * a changed verified moment goes back to TBS. Staff-verified records
   * can only be removed by Admins. */
  const canEdit = () => true;
  const canDelete = entry => admin || !(entry.source_type === 'staff' && entry.verification_status === 'verified');
  const entries = data.entries || [];
  const drafts = entries.filter(entry => entry.verification_status === 'draft').length;
  const [filter, setFilter] = useState(drafts ? 'draft' : 'all');
  const counts = Object.fromEntries(JOURNEY_FILTERS.map(([key]) => [key, key === 'all' ? entries.length : entries.filter(e => (e.verification_status || 'draft') === key).length]));
  const shown = filter === 'all' ? entries : entries.filter(entry => (entry.verification_status || 'draft') === filter);

  useEffect(() => {
    if (notice && drafts) setFilter('draft');
  }, [notice]);

  return (
    <section className="panel">
      <PanelHead
        kicker="JOURNEY MOMENTS"
        title="Stories, reflection & growth"
        action={
          <div className="jlTools">
            {onImport && (
              <button className="ghostBtn" onClick={onImport}>
                <Upload /> IMPORT FROM MANAGEBAC
              </button>
            )}
            <button className="primary" onClick={onAdd}><Plus /> ADD MOMENT</button>
          </div>
        }
      />

      {notice && (
        <div className="jlNotice" role="status" onClick={onDismissNotice}>
          <CheckCircle2 />
          <span>{notice}</span>
        </div>
      )}

      {entries.length > 0 && (
        <div className="jlFilters" role="group" aria-label="Show">
          {JOURNEY_FILTERS.filter(([key]) => key === 'all' || counts[key]).map(([key, label]) => (
            <button key={key} type="button" className={filter === key ? 'on' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label} · <b>{counts[key]}</b>
            </button>
          ))}
        </div>
      )}

      {!entries.length && <p className="muted">No Journey Moments yet.</p>}

      {shown.map(entry => {
        const draft = entry.verification_status === 'draft';
        const info = draft ? draftGaps(entry, data.evidence || []) : null;
        return (
          <MomentRow
            key={entry.id}
            entry={entry}
            extra={
              draft && (
                <div className="draftGaps">
                  {info.gaps.length ? (
                    info.gaps.map(([label]) => <span key={label}>Needs: {label}</span>)
                  ) : (
                    <span className="ok">Ready to publish</span>
                  )}
                  {!info.photos && <span className="soft">No photos yet</span>}
                  {entry.import_source === 'managebac' && <em className="draftFrom">FROM MANAGEBAC</em>}
                </div>
              )
            }
            actions={
              <div className="rowActions">
                {draft && canEdit(entry) && (
                  <button className="primary" onClick={() => onEdit({ ...entry, _startStep: info.step })}>
                    {info.gaps.length ? 'FINISH & PUBLISH' : 'PUBLISH'}
                  </button>
                )}
                {!draft && canEdit(entry) && <button onClick={() => onEdit(entry)}>EDIT</button>}
                {canDelete(entry) && <button onClick={() => onDelete(entry)}>DELETE</button>}

                {admin && entry.verification_status === 'verified' && (
                  <label className="switchLabel">
                    <input
                      type="checkbox"
                      checked={!!entry.is_public}
                      onChange={event => onPublic(entry, event.target.checked)}
                    />
                    PUBLIC
                  </label>
                )}
              </div>
            }
          />
        );
      })}
    </section>
  );
}

function ProfileEditor({ data, admin, staff = admin, editor = null, onRefresh }) {
  const [profile, setProfile] = useState({ ...emptyProfile, ...data.profile });
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState('');

  useEffect(() => {
    setProfile({ ...emptyProfile, ...data.profile });
  }, [data.profile]);

  const update = (key, value) => {
    setDirty(true);
    setProfile(current => ({ ...current, [key]: value }));
  };

  async function save() {
    setBusy(true);
    try {
      /* When a coach or admin edits a student's About me, record who did it
       * (only once migration 20261005 has added the columns). */
      const stamp =
        staff && editor && data.profile && 'about_edited_at' in data.profile
          ? {
              about_edited_by_email: editor.email || null,
              about_edited_by_name: editor.full_name || editor.email || null,
              about_edited_by_role: editor.role || null,
              about_edited_at: new Date().toISOString()
            }
          : {};
      await saveProfile(data.student.student_id, {
        ...profile,
        ...stamp,
        interests: arr(profile.interests),
        strengths: arr(profile.strengths),
        languages: arr(profile.languages)
      });
      setDirty(false);
      setSavedAt(Date.now());
      await onRefresh();
    } catch (error) {
      alert(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function upload(file, kind) {
    if (!file) return;
    setUploading(kind);

    try {
      const mediaRole = kind === 'photo' ? 'profile_photo' : 'hero_banner';
      const result = await uploadJourneyMedia({
        studentId: data.student.student_id,
        entryId: null,
        file,
        caption: kind === 'photo' ? 'Profile photo' : 'Portfolio hero',
        bucket: 'profile',
        mediaRole
      });

      if (!result?.evidence?.id) {
        throw new Error('Your upload finished, but it hasn’t appeared yet. Please refresh in a moment.');
      }

      if (admin) await setEvidencePublic(result.evidence.id, true);

      const field = kind === 'photo' ? 'profile_photo_url' : 'banner_image_url';
      const next = { ...profile, [field]: `evidence:${result.evidence.id}` };
      setProfile(next);

      await saveProfile(data.student.student_id, {
        ...next,
        interests: arr(next.interests),
        strengths: arr(next.strengths),
        languages: arr(next.languages)
      });

      await onRefresh();
    } catch (error) {
      alert(friendlyError(error));
    } finally {
      setUploading('');
    }
  }

  const profileEvidence = resolveProfileEvidence(
    profile.profile_photo_url,
    data.evidence || [],
    'profile_photo'
  );

  const heroEvidence = resolveProfileEvidence(
    profile.banner_image_url,
    data.evidence || [],
    'hero_banner'
  );

  const firstName = String(profile.preferred_name || data.student?.full_name || 'the student').split(' ')[0];

  return (
    <section className="panel formPanel wsProfile">
      <header className="wsProfileHead">
        <div>
          <small>PROFILE</small>
          <h2>Introduce {firstName}</h2>
          <p>This is the first thing people read on the portfolio. Keep it simple and in {firstName}’s own voice.</p>
          {data.profile?.about_edited_by_name && (
            <p className="editedStamp">
              <UserRound aria-hidden="true" />
              Last edited by {data.profile.about_edited_by_name}
              {data.profile.about_edited_by_role ? ` (${data.profile.about_edited_by_role})` : ''}
              {data.profile.about_edited_at ? ` · ${formatDate(String(data.profile.about_edited_at).slice(0, 10))}` : ''}
            </p>
          )}
        </div>

        {admin && (
          <label className="wsSwitchRow">
            <span>
              <b>Show “About me” on the portfolio</b>
              <small>When off, only the name, photo and approved moments are shown.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="wsSwitch"
              checked={!!data.profile?.profile_public}
              onChange={async event => {
                try {
                  await setProfilePublic(data.student.student_id, event.target.checked);
                  await onRefresh();
                } catch (error) {
                  alert(friendlyError(error));
                }
              }}
            />
          </label>
        )}
      </header>

      <div className="profileMediaRow">
        <ProfileUploadCard
          kind="portrait"
          title="Profile photo"
          text="A clear, recent photo of the face. JPG or PNG."
          busy={uploading === 'photo'}
          evidence={profileEvidence}
          onFile={file => upload(file, 'photo')}
        />
        <ProfileUploadCard
          kind="banner"
          title="Cover image"
          text="A wide photo shown behind the name — a stage, a pitch, a place that matters."
          busy={uploading === 'banner'}
          evidence={heroEvidence}
          onFile={file => upload(file, 'banner')}
        />
      </div>

      <div className="wsFormSection">
        <h3><span>01</span> Introduction</h3>
        <div className="formGrid">
          <Field
            label="Preferred name"
            value={profile.preferred_name}
            placeholder="e.g. Aarav"
            set={value => update('preferred_name', value)}
          />
          <Field
            label="Headline"
            value={profile.headline}
            placeholder="e.g. Footballer, coder and curious about cities."
            hint="One short line. It appears under the name."
            set={value => update('headline', value)}
          />
          <Field
            wide
            area
            rows={5}
            label="About me"
            value={profile.about_me}
            placeholder="Who are you, what do you enjoy, and what are you working towards?"
            hint="Three to five sentences is perfect."
            set={value => update('about_me', value)}
          />
        </div>
      </div>

      <div className="wsFormSection">
        <h3><span>02</span> Interests &amp; strengths</h3>
        <div className="formGrid">
          <Field
            label="Interests"
            value={showArr(profile.interests)}
            placeholder="Robotics, football, debating"
            hint="Separate with commas."
            set={value => update('interests', value)}
          />
          <Field
            label="Strengths"
            value={showArr(profile.strengths)}
            placeholder="Curious, collaborative, resilient"
            hint="Separate with commas."
            set={value => update('strengths', value)}
          />
          <Field
            label="Languages"
            value={showArr(profile.languages)}
            placeholder="English, Hindi, French"
            hint="Separate with commas."
            set={value => update('languages', value)}
          />
        </div>
      </div>

      <div className="wsFormSection">
        <h3><span>03</span> Looking back &amp; ahead</h3>
        <div className="formGrid">
          <Field
            wide
            area
            rows={3}
            label="Proud moment"
            value={profile.proud_moment}
            placeholder="A moment you’re proud of, and why it mattered."
            set={value => update('proud_moment', value)}
          />
          <Field
            wide
            area
            rows={3}
            label="Goals"
            value={profile.goals}
            placeholder="What would you like to achieve this year?"
            set={value => update('goals', value)}
          />
          <Field
            wide
            area
            rows={3}
            label="Next chapter"
            value={profile.aspirations}
            placeholder="Where would you like your journey to take you next?"
            set={value => update('aspirations', value)}
          />
          <Field
            wide
            area
            rows={2}
            label="A thought to end on (optional)"
            value={profile.closing_thought}
            placeholder="One line in your own words to close your portfolio. Leave blank to hide it."
            set={value => update('closing_thought', value)}
          />
        </div>
      </div>

      <div className="wsSaveBar">
        <span>
          {busy
            ? 'Saving…'
            : dirty
            ? 'You have unsaved changes.'
            : savedAt
            ? 'All changes saved.'
            : 'Changes are saved to the student’s portfolio.'}
        </span>
        <button className="primary" disabled={busy || !dirty} onClick={save}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </section>
  );
}

function ProfileUploadCard({ title, text, busy, evidence, onFile, kind = 'portrait' }) {
  return (
    <label className={`profileUploadCard is-${kind}`}>
      <div className="profileUploadMedia">
        {evidence ? (
          <SecureEvidenceImage evidence={evidence} preview />
        ) : (
          <div className="uploadEmpty"><Upload /></div>
        )}
      </div>

      <div className="profileUploadCopy">
        <b>{title}</b>
        <span>{text}</span>
        <em className="uploadAction">
          <Upload /> {busy ? 'Uploading…' : evidence ? 'Replace' : 'Upload'}
        </em>
      </div>

      <input
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

function Field({ label, value, set, area, wide, type = 'text', hint, placeholder, rows, invalid }) {
  return (
    <label className={`${wide ? 'wide' : ''} ${invalid ? 'isMissing' : ''}`.trim() || undefined}>
      <span>{label}</span>
      {area ? (
        <textarea
          value={value || ''}
          rows={rows}
          placeholder={placeholder}
          onChange={event => set(event.target.value)}
        />
      ) : (
        <input
          type={type}
          value={value || ''}
          placeholder={placeholder}
          onChange={event => set(event.target.value)}
        />
      )}
      {hint && <small className="fieldHint">{hint}</small>}
    </label>
  );
}

function MediaManager({ data, admin, onPublic, onRefresh }) {
  async function cover(evidence) {
    if (!evidence.entry_id) return;
    try {
      await setCoverEvidence(evidence.entry_id, evidence.id);
      await onRefresh();
    } catch (error) {
      alert(friendlyError(error));
    }
  }

  return (
    <section className="panel">
      <PanelHead kicker="MEDIA & EVIDENCE" title="Files connected to the journey" />

      <div className="mediaGrid">
        {(data.evidence || []).map(evidence => (
          <article key={evidence.id}>
            <div className="mediaThumb">
              {isPhoto(evidence) ? (
                <SecureEvidenceImage evidence={evidence} preview />
              ) : (
                <div className="filePlaceholder"><FileText /></div>
              )}
            </div>

            <div className="mediaGridCopy">
              <b>{evidence.caption || evidence.file_name || 'Evidence'}</b>
              <small>{evidence.media_role || evidence.evidence_type}</small>
            </div>

            {admin && evidence.entry_id && (
              <button
                className="textBtn"
                disabled={evidence.media_role === 'journey_cover'}
                onClick={() => cover(evidence)}
              >
                {evidence.media_role === 'journey_cover' ? 'COVER' : 'SET COVER'}
              </button>
            )}

            {admin && (
              <label className="switchLabel">
                <input
                  type="checkbox"
                  checked={!!evidence.is_public}
                  onChange={event => onPublic(evidence, event.target.checked)}
                />
                PUBLIC
              </label>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function Approvals({ items, onReview, onReviewMany, showMoments, quotes = [], account, onReviewQuote, onReviewQuotes, onDraftMore }) {
  return (
    <div className="approvalsStack">
      <CoachQuoteApprovals
        quotes={quotes}
        account={account}
        onReviewQuote={onReviewQuote}
        onReviewQuotes={onReviewQuotes}
        onDraftMore={onDraftMore}
      />
      {showMoments && <MomentApprovals items={items} onReview={onReview} onReviewMany={onReviewMany} />}
    </div>
  );
}

/* Select-all + bulk actions bar, shared by both approval queues. */
function BulkBar({ total, selected, onAll, onNone, children, busyText }) {
  const all = total > 0 && selected === total;
  return (
    <div className={`bulkBar ${selected ? 'isActive' : ''}`}>
      <label className="bulkAll">
        <input
          type="checkbox"
          checked={all}
          ref={el => {
            if (el) el.indeterminate = selected > 0 && !all;
          }}
          onChange={() => (all ? onNone() : onAll())}
          aria-label={all ? 'Clear selection' : 'Select all'}
        />
        <span>{selected ? `${selected} selected` : `Select all (${total})`}</span>
      </label>
      {busyText ? <span className="bulkBusy"><Loader2 className="spin" /> {busyText}</span> : selected > 0 && <div className="bulkActions">{children}</div>}
    </div>
  );
}

/* Coach quotes: the app drafts from Panthers records; a coach approves,
 * edits or rejects. Only approved quotes print on the CV, with the
 * approver's name. */
function CoachQuoteApprovals({ quotes, account, onReviewQuote, onReviewQuotes, onDraftMore }) {
  const [texts, setTexts] = useState({});
  const [picked, setPicked] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState('');
  const [bulkNote, setBulkNote] = useState('');

  useEffect(() => {
    /* Drop selections for quotes that have left the queue. */
    setPicked(current => new Set([...current].filter(id => quotes.some(q => q.id === id))));
  }, [quotes]);

  function togglePick(id) {
    setPicked(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulk(status) {
    const chosen = quotes.filter(q => picked.has(q.id));
    const list = chosen.map(quote => ({ quote, text: (texts[quote.id] ?? quote.quote_text).trim() }));
    const usable = status === 'approved' ? list.filter(x => x.text.length >= 10) : list;
    const skipped = list.length - usable.length;
    if (!usable.length) {
      setBulkNote('Nothing to approve: each quote needs at least a short sentence.');
      return;
    }
    setBulkBusy(status === 'approved' ? `Approving ${usable.length}…` : `Rejecting ${usable.length}…`);
    setBulkNote('');
    try {
      const done = await onReviewQuotes(usable, status);
      setPicked(new Set());
      setTexts(current => {
        const next = { ...current };
        usable.forEach(x => delete next[x.quote.id]);
        return next;
      });
      setBulkNote(`${done} quote${done === 1 ? '' : 's'} ${status === 'approved' ? 'approved' : 'rejected'}.${skipped ? ` ${skipped} skipped (too short to approve).` : ''}`);
    } catch (error) {
      setBulkNote(friendlyError(error));
    } finally {
      setBulkBusy('');
    }
  }
  const [busy, setBusy] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState('');
  const checked = useRef(new Set());

  const textOf = quote => (texts[quote.id] ?? quote.quote_text);

  async function act(quote, status) {
    setBusy(quote.id + status);
    try {
      const text = textOf(quote).trim();
      if (status === 'approved' && text.length < 10) {
        alert('Please write at least a short sentence before approving.');
        return;
      }
      await onReviewQuote(quote, status, status === 'approved' ? text : null);
      setTexts(current => {
        const next = { ...current };
        delete next[quote.id];
        return next;
      });
    } catch (error) {
      alert(friendlyError(error));
    } finally {
      setBusy('');
    }
  }

  async function draftMore() {
    setDrafting(true);
    setDraftNote('');
    try {
      const { made, scanned, remaining } = await onDraftMore(checked.current);
      setDraftNote(
        scanned === 0
          ? 'Every Panthers student already has a quote or a coach comment.'
          : `${made} new draft${made === 1 ? '' : 's'} from ${scanned} students checked.${
              remaining ? ' Click again to continue.' : ''
            }`
      );
    } catch (error) {
      setDraftNote(friendlyError(error));
    } finally {
      setDrafting(false);
    }
  }

  return (
    <section className="panel quotePanel">
      <PanelHead
        kicker="COACH QUOTES · FOR THE PORTFOLIO PDF"
        title="Quotes to approve"
        action={<span className="queueCount">{quotes.length} awaiting review</span>}
      />

      <div className="quoteIntro">
        <MessageSquareQuote aria-hidden="true" />
        <p>
          The app drafts these from Panthers records (attendance, squads, awards) for students who
          don’t have a coach comment yet. <b>Nothing prints until you approve it.</b> Approved quotes
          appear on the student’s portfolio PDF with your name{account?.full_name ? ` (${account.full_name})` : ''}.
        </p>
        <button className="quoteDraftBtn" onClick={draftMore} disabled={drafting}>
          {drafting ? <Loader2 className="spin" /> : <Sparkles />}
          {drafting ? 'DRAFTING…' : 'DRAFT MORE'}
        </button>
      </div>
      {draftNote && <p className="quoteDraftNote">{draftNote}</p>}

      {!quotes.length && (
        <div className="emptyMini">
          <CheckCircle2 />
          <b>No quotes waiting.</b>
        </div>
      )}

      {quotes.length > 1 && (
        <BulkBar
          total={quotes.length}
          selected={picked.size}
          onAll={() => setPicked(new Set(quotes.map(q => q.id)))}
          onNone={() => setPicked(new Set())}
          busyText={bulkBusy}
        >
          <button onClick={() => bulk('rejected')}>REJECT SELECTED</button>
          <button className="primary" onClick={() => bulk('approved')}><Check /> APPROVE SELECTED</button>
        </BulkBar>
      )}
      {bulkNote && <p className="quoteDraftNote">{bulkNote}</p>}

      {quotes.map(quote => {
        const edited = textOf(quote) !== quote.quote_text;
        return (
          <article className={`quoteRow ${picked.has(quote.id) ? 'isPicked' : ''}`} key={quote.id}>
            <header>
              {quotes.length > 1 && (
                <input
                  type="checkbox"
                  className="bulkCheck"
                  checked={picked.has(quote.id)}
                  onChange={() => togglePick(quote.id)}
                  aria-label={`Select quote for ${quote.student?.full_name || 'student'}`}
                />
              )}
              <div>
                <small>
                  {quote.student?.full_name || quote.student_id}
                  {quote.student?.year_group ? ` · ${quote.student.year_group}` : ''}
                </small>
                {quote.source_note && <span className="quoteSource">{quote.source_note}</span>}
              </div>
              <span className="quoteBadge">APP DRAFT</span>
            </header>
            <label className="quoteEdit">
              <span className="sr-only">Quote for {quote.student?.full_name}</span>
              <textarea
                rows={3}
                value={textOf(quote)}
                onChange={event => setTexts(current => ({ ...current, [quote.id]: event.target.value }))}
              />
            </label>
            <footer>
              <span className="quotePreviewSign">
                Prints as: “…” — {account?.full_name || 'Your name'} · TBS Panthers
              </span>
              <div className="quoteActions">
                <button onClick={() => act(quote, 'rejected')} disabled={!!busy}>REJECT</button>
                <button className="primary" onClick={() => act(quote, 'approved')} disabled={!!busy}>
                  {busy === quote.id + 'approved' ? <Loader2 className="spin" /> : <Check />}
                  {edited ? 'SAVE & APPROVE' : 'APPROVE'}
                </button>
              </div>
            </footer>
          </article>
        );
      })}
    </section>
  );
}

function MomentApprovals({ items, onReview, onReviewMany }) {
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [confirmBulk, setConfirmBulk] = useState(null);
  const [sharedNote, setSharedNote] = useState('');

  useEffect(() => {
    setPicked(current => new Set([...current].filter(id => items.some(e => e.id === id))));
  }, [items]);

  function togglePick(id) {
    setPicked(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulk(status) {
    const chosen = items.filter(e => picked.has(e.id));
    if (!chosen.length) return;
    setConfirmBulk(null);
    setBulkBusy(status === 'verified' ? `Verifying ${chosen.length}…` : `Rejecting ${chosen.length}…`);
    setBulkNote('');
    try {
      const done = await onReviewMany(chosen, status, sharedNote);
      setPicked(new Set());
      setSharedNote('');
      setBulkNote(`${done} moment${done === 1 ? '' : 's'} ${status === 'verified' ? 'verified' : 'rejected'}.`);
    } catch (error) {
      setBulkNote(friendlyError(error));
    } finally {
      setBulkBusy('');
    }
  }

  return (
    <section className="panel">
      <PanelHead
        kicker="JOURNEY MOMENTS"
        title="Moments to verify"
        action={<span className="queueCount">{items.length} awaiting review</span>}
      />

      {!items.length && (
        <div className="emptyMini">
          <CheckCircle2 />
          <b>You're all caught up.</b>
        </div>
      )}

      {items.length > 1 && (
        <BulkBar
          total={items.length}
          selected={picked.size}
          onAll={() => setPicked(new Set(items.map(e => e.id)))}
          onNone={() => setPicked(new Set())}
          busyText={bulkBusy}
        >
          <button onClick={() => setConfirmBulk('rejected')}>REJECT SELECTED</button>
          <button className="primary" onClick={() => setConfirmBulk('verified')}><ShieldCheck /> VERIFY SELECTED</button>
        </BulkBar>
      )}
      {bulkNote && <p className="quoteDraftNote">{bulkNote}</p>}

      {confirmBulk && (
        <div className="bulkConfirm" role="alertdialog" aria-label="Confirm bulk action">
          <p>
            {confirmBulk === 'verified' ? 'Verify' : 'Reject'} <b>{picked.size}</b> moment{picked.size === 1 ? '' : 's'}?
            {confirmBulk === 'verified' ? ' Each one gets the “Verified by TBS” mark.' : ' Students will see your note.'}
          </p>
          <label>
            Note to students (optional)
            <textarea value={sharedNote} onChange={e => setSharedNote(e.target.value)} rows={2} />
          </label>
          <div className="reviewActions">
            <button onClick={() => setConfirmBulk(null)}>CANCEL</button>
            <button className="primary" onClick={() => bulk(confirmBulk)}>
              {confirmBulk === 'verified' ? `VERIFY ${picked.size}` : `REJECT ${picked.size}`}
            </button>
          </div>
        </div>
      )}

      {items.map(entry => (
        <div className={`approvalRow ${picked.has(entry.id) ? 'isPicked' : ''}`} key={entry.id}>
          {items.length > 1 && (
            <input
              type="checkbox"
              className="bulkCheck"
              checked={picked.has(entry.id)}
              onChange={() => togglePick(entry.id)}
              aria-label={`Select ${entry.title}`}
            />
          )}
          <div>
            <small>
              {entry.student?.full_name || 'Student'}{entry.student?.year_group ? ` · ${entry.student.year_group}` : ''}
            </small>
            <h3>{entry.title}</h3>
            <p>{entry.description}</p>
          </div>
          <button onClick={() => { setOpen(entry); setNote(''); }}>REVIEW</button>
        </div>
      ))}

      {open && (
        <div className="modalShade">
          <div className="reviewModal">
            <button className="modalX" onClick={() => setOpen(null)}><X /></button>
            <small>{open.student?.full_name}{open.student?.year_group ? ` · ${open.student.year_group}` : ''}</small>
            <h2>{open.title}</h2>
            <p>{open.description}</p>
            {open.reflection && <blockquote>{open.reflection}</blockquote>}

            <label>
              Feedback / note
              <textarea value={note} onChange={event => setNote(event.target.value)} />
            </label>

            <div className="reviewActions">
              <button
                onClick={async () => {
                  await onReview(open, 'rejected', note);
                  setOpen(null);
                }}
              >
                REJECT
              </button>

              <button
                className="primary"
                onClick={async () => {
                  await onReview(open, 'verified', note);
                  setOpen(null);
                }}
              >
                VERIFY
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* SuperAdmin-only: portfolios are open to signed-in members by default;
 * the SuperAdmin can close one (e.g. at a family's request). */
/* School-wide settings (no student needed): TBS community access for everyone,
 * and right-click protection on portfolio pages. SuperAdmin only. */
function SchoolSharingSettings({ superadmin }) {
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadPortfolioSettings({ fresh: true }).then(setSettings);
  }, []);

  async function flip(key, value) {
    if (!superadmin || busy) return;
    setBusy(key);
    setError('');
    try {
      setSettings(await setPortfolioSetting(key, value));
    } catch (flipError) {
      setError(friendlyError(flipError, 'This setting couldn’t be saved. Please try again.'));
    } finally {
      setBusy('');
    }
  }

  const open = (settings?.community_default || 'open') === 'open';

  return (
    <section className="panel schoolSettings">
      <PanelHead kicker="SCHOOL SETTINGS · ALL PORTFOLIOS" title="For everyone at TBS" />
      <div className={`communityAccess ${open ? 'isOpen' : ''}`}>
        <Users />
        <div>
          <h3>TBS community access · school default</h3>
          <p>
            {open
              ? 'Open — any signed-in parent, student or staff member can view portfolios (approved moments and public evidence only).'
              : 'Closed — members see the name and photo, and must request access. Only the student, their family and staff can open a portfolio.'}
            {' '}A student’s own setting overrides this.
          </p>
        </div>
        <button
          type="button" role="switch" aria-checked={open} aria-label="TBS community access, school default"
          className="communitySwitch" onClick={() => flip('community_default', open ? 'closed' : 'open')}
          disabled={!superadmin || !settings || busy === 'community_default'}
        >
          <i />
        </button>
      </div>

      {[
        ['right_click_admin', 'Admin & SuperAdmin', 'Admins and the SuperAdmin'],
        ['right_click', 'everyone else', 'visitors, students, parents and other staff']
      ].map(([key, who, whoLong]) => {
        const blocked = settings?.[key] === 'disabled';
        return (
          <div key={key} className={`communityAccess ${blocked ? 'isOpen' : ''}`}>
            <MousePointerClick />
            <div>
              <h3>Block right-click · {who}</h3>
              <p>
                {blocked
                  ? `On — right-click, long-press saving and dragging photos are blocked on portfolio pages for ${whoLong}.`
                  : `Off — ${whoLong} can right-click (and long-press on phones) on portfolio pages.`}
              </p>
            </div>
            <button
              type="button" role="switch" aria-checked={blocked} aria-label={`Block right-click for ${whoLong}`}
              className="communitySwitch" onClick={() => flip(key, blocked ? 'enabled' : 'disabled')}
              disabled={!superadmin || !settings || busy === key}
            >
              <i />
            </button>
          </div>
        );
      })}

      {!superadmin && <small className="schoolSettingsNote">Only the SuperAdmin can change these.</small>}
      {error && (
        <div className="sharingInlineError" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}

/* This student's TBS community access: follow the school default, or
 * override it with Open / Closed. */
function StudentCommunityAccess({ studentId, studentName, superadmin }) {
  const [mode, setMode] = useState(null);
  const [schoolDefault, setSchoolDefault] = useState('open');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let live = true;
    setMode(null);
    Promise.all([loadCommunityMode(studentId), loadPortfolioSettings()])
      .then(([m, s]) => {
        if (!live) return;
        setMode(m);
        setSchoolDefault(s.community_default || 'open');
      })
      .catch(() => live && setMode(''));
    return () => {
      live = false;
    };
  }, [studentId]);

  async function choose(next) {
    if (!superadmin || busy || next === mode) return;
    setBusy(true);
    setMsg('');
    try {
      const result = await setCommunityMode(studentId, next);
      setMode(result?.mode || '');
      setMsg('Saved.');
    } catch (error) {
      setMsg(friendlyError(error, 'This setting couldn’t be saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  const effective = (mode || schoolDefault) === 'open' ? 'Open' : 'Closed';
  const choices = [
    ['', `Use school default (${schoolDefault === 'open' ? 'Open' : 'Closed'})`],
    ['open', 'Open'],
    ['closed', 'Closed']
  ];

  return (
    <div className="journeyDisplayPanel">
      <div className="jdRow">
        <span className="jdLabel">TBS community access · {studentName || 'this student'}</span>
        <div className="jdChoices">
          {choices.map(([value, label]) => (
            <button
              type="button" key={value || 'default'}
              className={mode === value ? 'isActive' : ''}
              onClick={() => choose(value)}
              disabled={!superadmin || busy || mode === null}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <span className="jdMsg">
        {mode === null ? 'Loading…' : `Currently ${effective} for this student.`} {msg}
        {!superadmin && ' Only the SuperAdmin can change this.'}
      </span>
    </div>
  );
}

function Sharing({ data, onRefresh, superadmin }) {
  const [expiry, setExpiry] = useState('7');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function make() {
    if (busy) return;

    setBusy(true);
    setError('');
    setCopied(false);

    try {
      const date = new Date();
      date.setDate(date.getDate() + Number(expiry));

      const token = await createSecureShare(
        data.student.student_id,
        date.toISOString()
      );

      const nextLink = `${window.location.origin}/p/${encodeURIComponent(token)}`;
      setLink(nextLink);

      // Refresh the dashboard in the background. The generated link should not
      // wait for a full Journey + Panthers reload before becoming usable.
      Promise.resolve(onRefresh?.()).catch(refreshError => {
        console.warn('Sharing refresh warning:', refreshError);
      });
    } catch (shareError) {
      console.error('Create public link error:', shareError);
      setError(
        friendlyError(shareError, 'The secure link couldn’t be created. Please try again.')
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copy failed. Please select and copy the link manually.');
    }
  }

  return (
    <section className="panel">
      <PanelHead kicker="THIS STUDENT" title={data?.student?.full_name || 'Sharing'} />

      <JourneyDisplaySettings studentId={data?.student?.student_id || ''} studentName={data?.student?.full_name || ''} />

      <StudentCommunityAccess studentId={data.student.student_id} studentName={data.student.full_name} superadmin={superadmin} />

      <div className="sharingBox">
        <Globe2 />
        <div>
          <h3>Create secure public link</h3>
          <p>
            Only portfolio content explicitly approved for public viewing is
            returned. The link expires automatically.
          </p>

          <label>
            Link expiry
            <select
              value={expiry}
              onChange={event => setExpiry(event.target.value)}
              disabled={busy}
            >
              <option value="1">24 hours</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </label>

          <button className="primary" onClick={make} disabled={busy}>
            {busy ? 'GENERATING SECURE LINK…' : 'GENERATE SECURE LINK'}
          </button>

          {error && (
            <div className="sharingInlineError" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
            </div>
          )}

          {link && (
            <div className="generatedLink">
              <LinkIcon />
              <input
                readOnly
                value={link}
                onFocus={event => event.currentTarget.select()}
              />
              <button onClick={copyLink}>{copied ? 'COPIED' : 'COPY'}</button>
              <button
                onClick={() =>
                  window.open(link, '_blank', 'noopener,noreferrer')
                }
              >
                OPEN
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* "Help me write": guiding questions; tapping one adds a sentence starter. */
function HelpMeWrite({ prompts, onPick }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`helpWrite ${open ? 'isOpen' : ''}`}>
      <button type="button" className="helpWriteToggle" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <Lightbulb aria-hidden="true" />
        {open ? 'Hide help' : 'Help me write'}
      </button>
      {open && (
        <div className="helpWritePrompts">
          {prompts.map(prompt => (
            <button type="button" key={prompt.q} onClick={() => onPick(prompt.starter)}>
              <b>{prompt.q}</b>
              <span>Add “{prompt.starter.trim()}…”</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Skill tags: tap up to five, in IB vocabulary. Two or three are suggested
 * from the area and the words in the moment. */
function SkillPicker({ value, suggested, onChange }) {
  const [custom, setCustom] = useState('');
  const selected = arr(value);
  const has = skill => selected.some(item => item.toLowerCase() === skill.toLowerCase());
  const toggle = skill => {
    if (has(skill)) onChange(selected.filter(item => item.toLowerCase() !== skill.toLowerCase()));
    else if (selected.length < MAX_SKILLS) onChange([...selected, skill]);
  };
  const known = new Set(SKILL_GROUPS.flatMap(group => group.skills).map(s => s.toLowerCase()));
  const extras = selected.filter(skill => !known.has(skill.toLowerCase()));
  const full = selected.length >= MAX_SKILLS;

  const chip = (skill, extra = '') => (
    <button
      type="button"
      key={skill + extra}
      className={`skillChip ${has(skill) ? 'on' : ''} ${extra}`}
      onClick={() => toggle(skill)}
      disabled={!has(skill) && full}
      aria-pressed={has(skill)}
    >
      {has(skill) && <Check aria-hidden="true" />}
      {skill}
    </button>
  );

  return (
    <div className="skillPicker">
      <div className="skillPickerHead">
        <b>Skills this moment shows</b>
        <span>
          {selected.length} / {MAX_SKILLS} chosen
          {full && <em className="skillPickerFull"> · maximum reached: untick one to choose another</em>}
        </span>
      </div>

      {!!suggested.length && (
        <div className="skillGroup isSuggested">
          <small><Sparkles aria-hidden="true" /> Suggested for this moment</small>
          <div>{suggested.map(skill => chip(skill, 'isSuggest'))}</div>
        </div>
      )}

      {SKILL_GROUPS.map(group => (
        <div className="skillGroup" key={group.id}>
          <small>{group.label}</small>
          <div>{group.skills.filter(skill => !suggested.includes(skill)).map(skill => chip(skill))}</div>
        </div>
      ))}

      <div className="skillGroup">
        <small>Your own</small>
        <div>
          {extras.map(skill => chip(skill))}
          <form
            className="skillCustom"
            onSubmit={event => {
              event.preventDefault();
              const text = custom.trim();
              if (text && !has(text) && !full) onChange([...selected, text]);
              setCustom('');
            }}
          >
            <input
              value={custom}
              onChange={event => setCustom(event.target.value)}
              placeholder="Add another…"
              disabled={full}
              maxLength={32}
            />
          </form>
        </div>
      </div>
    </div>
  );
}

function JourneyBuilder({ initial, student, role, onClose, onDone, evidence = [], library = [] }) {
  const editing = !!initial.id;
  /* A draft (e.g. imported from ManageBac) opens at the step that still
   * needs something; finishing it publishes it. */
  const isDraft = editing && initial.verification_status === 'draft';
  const admin = isAdmin(role);

  /* Step 0 = the "Before you start" guide, shown to students until they tick
   * "Don't show this guide again". */
  const [step, setStep] = useState(() =>
    isDraft && initial._startStep ? initial._startStep : !editing && !admin && !guideIntroSkipped() ? 0 : 1
  );
  const [guideOpen, setGuideOpen] = useState(guidePanelOpen);
  const [idea, setIdea] = useState('');
  const toggleGuide = () =>
    setGuideOpen(open => {
      setGuidePanelOpen(!open);
      return !open;
    });
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const [featured, setFeatured] = useState(null);
  /* Photos already on this moment (when editing or finishing a draft). */
  const [existing, setExisting] = useState(() =>
    evidence.filter(item => item.active !== false && item.media_role !== 'evidence' && (isPhoto(item) || item.evidence_type === 'video'))
  );
  const [mediaBusy, setMediaBusy] = useState('');
  /* Photos picked from the student's existing media (Media & evidence). */
  const [chosen, setChosen] = useState([]);
  const [chosenCover, setChosenCover] = useState(null);
  const [choosing, setChoosing] = useState(false);
  /* One copy of each Drive file in the chooser. */
  const libraryItems = useMemo(() => {
    const seen = new Set(existing.map(e => e.drive_file_id || e.media_url));
    const out = [];
    library.forEach(item => {
      const key = item.drive_file_id || item.media_url || item.id;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return out;
  }, [library, existing]);
  async function makeCover(item) {
    setMediaBusy(item.id);
    try {
      await setCoverEvidence(initial.id, item.id);
      setExisting(list => list.map(e => ({ ...e, media_role: e.id === item.id ? 'journey_cover' : 'journey_media' })));
      setFeatured(null);
    } catch (error) {
      alert(friendlyError(error));
    } finally {
      setMediaBusy('');
    }
  }
  async function dropMedia(item) {
    if (!confirm('Remove this photo from the moment?')) return;
    setMediaBusy(item.id);
    try {
      await removeEvidence(item.id);
      setExisting(list => list.filter(e => e.id !== item.id));
    } catch (error) {
      alert(friendlyError(error));
    } finally {
      setMediaBusy('');
    }
  }
  /* Every field is required. `tried` = the step the student tried to leave
   * with something missing, so only then are the gaps highlighted. */
  const [tried, setTried] = useState(0);
  const [drive, setDrive] = useState('');
  const [youtube, setYoutube] = useState('');

  const [values, setValues] = useState({
    entry_type: initial.entry_type || 'activity',
    domain: initial.domain || 'sport',
    title: initial.title || '',
    event_date: initial.event_date || '',
    organisation: initial.organisation || '',
    level: initial.level || 'School',
    description: initial.description || '',
    reflection: initial.reflection || '',
    skills: arr(initial.skills)
  });
  const suggested = suggestSkills(values);
  const MIN_WORDS = 10;
  const blank = key => !String(values[key] || '').trim();
  const hasEvidence = editing || files.length > 0 || chosen.length > 0 || !!drive.trim() || !!youtube.trim();
  const missingFor = n =>
    ({
      1: [
        ['entry_type', 'Type'],
        ['domain', 'Area'],
        ['title', 'Title'],
        ['event_date', 'Date'],
        ['organisation', 'Where or with whom'],
        ['level', 'Level']
      ].filter(([key]) => blank(key)).map(([, label]) => label),
      2: wordCount(values.description) < MIN_WORDS ? [`Description (at least ${MIN_WORDS} words)`] : [],
      3: [
        ...(wordCount(values.reflection) < MIN_WORDS ? [`Reflection (at least ${MIN_WORDS} words)`] : []),
        ...(arr(values.skills).length ? [] : ['at least one skill'])
      ],
      4: hasEvidence ? [] : ['at least one photo, file or link']
    })[n] || [];
  const missing = missingFor(step);
  const showGaps = tried === step && missing.length > 0;
  const gap = key => showGaps && (key === 'description' || key === 'reflection' ? wordCount(values[key]) < MIN_WORDS : blank(key));
  const goNext = () => {
    if (missing.length) {
      setTried(step);
      return;
    }
    setTried(0);
    setStep(current => current + 1);
  };
  /* Tapping a "Help me write" prompt adds its sentence starter on a new line. */
  const addStarter = (key, starter) => {
    const current = values[key].trimEnd();
    update(key, current ? `${current}\n${starter}` : starter);
  };

  const update = (key, value) => {
    setValues(current => ({ ...current, [key]: value }));
  };

  async function finish() {
    const gaps = [1, 2, 3, 4].find(n => missingFor(n).length);
    if (gaps) {
      setStep(gaps);
      setTried(gaps);
      return;
    }
    setBusy(true);

    try {
      const saved = await saveEntry(
        student.student_id,
        {
          ...values,
          skills: arr(values.skills).slice(0, MAX_SKILLS),
          source_type: admin ? 'staff' : 'student',
          verification_status: admin ? 'verified' : 'submitted',
          visibility: admin ? initial.visibility || 'private' : 'private',
          is_featured: admin ? !!initial.is_featured : false,
          is_public: admin ? !!initial.is_public : false,
          active: true,
          submitted_at: new Date().toISOString()
        },
        initial.id || null
      );

      /* The featured photo goes first, as the moment's cover; the rest
       * become its gallery. */
      const ordered = featured != null && files[featured]
        ? [files[featured], ...files.filter((_, i) => i !== featured)]
        : files;
      for (const [index, file] of ordered.entries()) {
        const cover = index === 0 && featured != null;
        const upload = mediaRole =>
          uploadJourneyMedia({
            studentId: student.student_id,
            entryId: saved.id,
            file,
            caption: values.title,
            bucket: 'journey',
            mediaRole
          });
        let result;
        if (cover) {
          try {
            result = await upload('journey_cover');
          } catch {
            result = await upload('journey_media');
          }
          /* Only one cover: the new featured photo replaces any earlier one. */
          if (result?.evidence?.id) {
            await setCoverEvidence(saved.id, result.evidence.id).catch(() => {});
          }
        } else {
          await upload('journey_media');
        }
      }

      if (drive.trim()) {
        await addExternalEvidence({
          studentId: student.student_id,
          entryId: saved.id,
          url: drive.trim(),
          caption: values.title,
          provider: 'google_drive',
          mediaRole: 'journey_media'
        });
      }

      if (youtube.trim()) {
        await addExternalEvidence({
          studentId: student.student_id,
          entryId: saved.id,
          url: youtube.trim(),
          caption: values.title,
          provider: 'youtube',
          mediaRole: 'journey_media'
        });
      }

      /* Photos chosen from the student's media. */
      for (const item of chosen) {
        const cover = chosenCover === item.id || (featured == null && !chosenCover && item === chosen[0] && !existing.some(e => e.media_role === 'journey_cover') && !files.length);
        try {
          const row = await copyEvidenceToEntry(item, saved.id, cover ? 'journey_cover' : 'journey_media');
          if (cover && row?.id) await setCoverEvidence(saved.id, row.id).catch(() => {});
        } catch (error) {
          console.error('Adding a photo from media failed', error);
        }
      }

      /* A public moment's new photos are public too. */
      if (saved.is_public) await setEntryMediaPublic(saved.id, true).catch(() => {});

      await onDone();
    } catch (error) {
      console.error('Journey save failed', error);
      alert(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="builder">
      <header className="builderTop">
        <span>{isDraft ? 'FINISH DRAFT' : editing ? 'EDIT JOURNEY MOMENT' : 'ADD JOURNEY MOMENT'} · {student.full_name}</span>
        <div className="builderTopActions">
          {step > 0 && <GuideLink onClick={() => setStep(0)} />}
          <button onClick={onClose}>CLOSE <X /></button>
        </div>
      </header>

      <div className="progress">
        {[1, 2, 3, 4].map(number => (
          <i key={number} className={step >= number ? 'on' : ''} />
        ))}
      </div>

      {step === 0 && (
        <main className="builderBody isGuide">
          <GuideIntro
            onStart={() => setStep(1)}
            onIdea={({ domain, entry_type, idea: text }) => {
              setValues(current => ({ ...current, domain, entry_type }));
              setIdea(text);
            }}
          />
        </main>
      )}

      {step > 0 && (
      <main className={`builderBody ${guideOpen ? 'withGuide' : 'guideClosed'}`}>
        <div className="builderCol">
        {step === 1 && (
          <>
            <small>01 / THE MOMENT</small>
            <h1>What happened?</h1>
            <p>Start with the experience. The reflection comes next.</p>

            {!editing && <IdeaPicker
              picked={idea}
              onPick={({ domain, entry_type, idea: text }) => {
                setValues(current => ({ ...current, domain, entry_type }));
                setIdea(text);
              }}
            />}

            <label>
              Type
              <select
                value={values.entry_type}
                onChange={event => update('entry_type', event.target.value)}
              >
                {ENTRY_TYPES.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <small className="fieldHint">{TYPE_INFO[values.entry_type]}</small>
            </label>

            <label>
              Area
              <select
                value={values.domain}
                onChange={event => update('domain', event.target.value)}
              >
                {DOMAIN_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <Field
              label="Title"
              invalid={gap('title')}
              value={values.title}
              set={value => update('title', value)}
              placeholder={idea ? `Your idea: ${idea} — make it specific` : 'Role + what + where'}
              hint="Role + what + where. Aim for 4–10 words."
            />
            <Field
              type="date"
              label="Date"
              invalid={gap('event_date')}
              value={values.event_date}
              set={value => update('event_date', value)}
              hint="For something ongoing, use the date it started."
            />
            <Field
              label="Where or with whom?"
              invalid={gap('organisation')}
              value={values.organisation}
              set={value => update('organisation', value)}
              placeholder="e.g. Flips Gymnastics Academy, Delhi"
              hint="The club, school, team, NGO or event behind it — e.g. TBS Battle of the Bands 2026 · Goonj (NGO) · TBS Panthers · DSO Zonal Finals."
            />

            <fieldset className={`levelPick ${gap('level') ? 'isMissing' : ''}`}>
              <legend>
                Level <span>· the highest level you took part at</span>
              </legend>
              <div>
                {LEVEL_OPTIONS.map(option => (
                  <button
                    type="button"
                    key={option}
                    className={values.level === option ? 'on' : ''}
                    aria-pressed={values.level === option}
                    onClick={() => update('level', option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {step === 2 && (
          <>
            <small>02 / STORY</small>
            <h1>Tell the story.</h1>
            <p>Aim for 30–60 words. What did you do, experience or achieve?</p>
            <HelpMeWrite prompts={STORY_PROMPTS} onPick={starter => addStarter('description', starter)} />
            <Field
              wide
              area
              label="Description"
              invalid={gap('description')}
              value={values.description}
              set={value => update('description', value)}
              placeholder="What did you do? Say “I”, and include one real detail."
            />
            <div className="jgUnder">
              <span />
              <WordCount text={values.description} min={30} max={60} />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <small>03 / REFLECTION</small>
            <h1>Why did it matter?</h1>
            <p>
              Focus on what changed, what you learned and what you would carry forward.
            </p>
            <HelpMeWrite prompts={REFLECTION_PROMPTS} onPick={starter => addStarter('reflection', starter)} />
            <Field
              wide
              area
              label="Reflection"
              invalid={gap('reflection')}
              value={values.reflection}
              set={value => update('reflection', value)}
              placeholder="What was hard? What did you learn? What will you do with it next?"
            />
            <div className="jgUnder">
              <ReflectionChecklist text={values.reflection} />
              <WordCount text={values.reflection} min={50} max={100} />
            </div>
            <SkillPicker
              value={values.skills}
              suggested={suggested}
              onChange={value => update('skills', value)}
            />
          </>
        )}

        {step === 4 && (
          <>
            <small>04 / MEDIA & EVIDENCE</small>
            <h1>Add the real moment.</h1>
            <p>
              Add up to 7 photos and star your best one as the featured photo. You can also link a Drive file or a YouTube video.
            </p>

            <div className="mediaOptions">
              {existing.length > 0 && (
                <div className="jgPhotos">
                  <div className="jgPhotosHead">
                    <strong>On this moment <span>· {existing.length} saved</span></strong>
                    <span>Tap ★ to make a photo the <b>featured</b> one, or the bin to remove it.</span>
                  </div>
                  <div className="jgPhotoGrid">
                    {existing.map(item => {
                      const cover = item.media_role === 'journey_cover';
                      return (
                        <figure key={item.id} className={`jgPhoto ${cover ? 'isFeatured' : ''}`}>
                          <SecureEvidenceImage
                            evidence={item}
                            preview
                            alt={item.caption || ''}
                            fallback={<span className="jgFileIcon"><ImageIcon /><small>{item.file_name || 'Preview not available'}</small></span>}
                          />
                          {cover && <em className="jgFeaturedTag">Featured</em>}
                          <div className="jgPhotoTools">
                            {!cover && isPhoto(item) && (
                              <button type="button" aria-label="Make this the featured photo" title="Make featured" disabled={!!mediaBusy} onClick={() => makeCover(item)}>
                                <Star />
                              </button>
                            )}
                            <button type="button" aria-label="Remove this photo" title="Remove" disabled={!!mediaBusy} onClick={() => dropMedia(item)}>
                              <Trash2 />
                            </button>
                          </div>
                        </figure>
                      );
                    })}
                  </div>
                </div>
              )}

              {chosen.length > 0 && (
                <div className="jgPhotos">
                  <div className="jgPhotosHead">
                    <strong>From Media &amp; evidence <span>· {chosen.length} chosen</span></strong>
                  </div>
                  <div className="jgPhotoGrid">
                    {chosen.map(item => (
                      <figure key={item.id} className={`jgPhoto ${chosenCover === item.id ? 'isFeatured' : ''}`}>
                        <SecureEvidenceImage
                          evidence={item}
                          preview
                          alt={item.caption || ''}
                          fallback={<span className="jgFileIcon"><ImageIcon /><small>{item.file_name || item.caption || 'Photo'}</small></span>}
                        />
                        {chosenCover === item.id && <em className="jgFeaturedTag">Featured</em>}
                        <div className="jgPhotoTools">
                          <button type="button" aria-label="Make this the featured photo" className={chosenCover === item.id ? 'on' : ''} onClick={() => { setChosenCover(item.id); setFeatured(null); }}>
                            <Star />
                          </button>
                          <button type="button" aria-label="Remove" onClick={() => { setChosen(list => list.filter(x => x.id !== item.id)); if (chosenCover === item.id) setChosenCover(null); }}>
                            <Trash2 />
                          </button>
                        </div>
                      </figure>
                    ))}
                  </div>
                </div>
              )}

              {choosing && (
                <MediaChooser
                  items={libraryItems}
                  picked={chosen}
                  max={Math.max(0, 7 - existing.length - files.length)}
                  onClose={() => setChoosing(false)}
                  onDone={list => {
                    setChosen(list);
                    setChoosing(false);
                  }}
                />
              )}

              <PhotoPicker
                files={files}
                featured={featured}
                max={Math.max(0, 7 - existing.length - chosen.length)}
                already={existing.length + chosen.length}
                onChooseLibrary={() => setChoosing(true)}
                libraryCount={libraryItems.length}
                /* Keep an existing cover unless a new photo is starred. */
                autoFeature={!existing.some(e => e.media_role === 'journey_cover') && !chosenCover}
                onChange={(next, feat) => {
                  setFiles(next);
                  setFeatured(chosenCover && feat === featured ? null : feat);
                  if (feat != null && feat !== featured) setChosenCover(null);
                }}
              />

              <div className="linkInputs">
                <label>
                  <span><LinkIcon /> Google Drive link</span>
                  <input
                    value={drive}
                    onChange={event => setDrive(event.target.value)}
                    placeholder="https://drive.google.com/..."
                  />
                </label>

                <label>
                  <span><Play /> YouTube link</span>
                  <input
                    value={youtube}
                    onChange={event => setYoutube(event.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </label>
              </div>
            </div>

            <div className="submitNote">
              <ShieldCheck />
              <p>
                {admin
                  ? 'This is a staff-managed Journey Moment. It will be stored as verified. Public visibility remains controlled separately.'
                  : 'Submitting sends this Journey Moment to TBS for verification. It will not become public automatically.'}
              </p>
            </div>
          </>
        )}

        <div className="builderNav isRibbon">
          <button disabled={step === 1} onClick={() => { setTried(0); setStep(current => current - 1); }}>
            BACK
          </button>

          <span className="ribbonStep">Step {step} of 4</span>
          {showGaps ? (
            <p className="jgMissing" role="alert">
              Please complete: {missing.join(', ')}.
            </p>
          ) : (
            <p className="jgRequired">All fields are required.</p>
          )}

          {step < 4 ? (
            <button className="primary" onClick={goNext}>
              CONTINUE
            </button>
          ) : (
            <button className="primary" disabled={busy} onClick={finish}>
              {busy
                ? 'SAVING & UPLOADING…'
                : editing && !isDraft
                ? 'SAVE CHANGES'
                : admin
                ? 'SAVE VERIFIED MOMENT'
                : 'SUBMIT JOURNEY MOMENT'}
            </button>
          )}
        </div>
        </div>
        <GuidePanel step={step} values={values} open={guideOpen} onToggle={toggleGuide} />
      </main>
      )}
    </div>
  );
}

/* Pick photos already in the student's Media & evidence. */
function MediaChooser({ items, picked, max, onClose, onDone }) {
  const [sel, setSel] = useState(() => picked.map(p => p.id));
  const toggle = id =>
    setSel(list => (list.includes(id) ? list.filter(x => x !== id) : list.length >= max ? list : [...list, id]));
  return (
    <div className="mediaChooserShade" onClick={onClose}>
      <div className="mediaChooser" role="dialog" aria-modal="true" aria-label="Choose photos" onClick={event => event.stopPropagation()}>
        <header>
          <div>
            <small>MEDIA &amp; EVIDENCE</small>
            <h3>Choose photos</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X /></button>
        </header>
        <div className="mediaChooserGrid">
          {items.map(item => {
            const on = sel.includes(item.id);
            return (
              <button type="button" key={item.id} className={on ? 'on' : ''} aria-pressed={on} onClick={() => toggle(item.id)}>
                <SecureEvidenceImage
                  evidence={item}
                  preview
                  alt={item.caption || ''}
                  fallback={<span className="jgFileIcon"><ImageIcon /><small>{item.file_name || item.caption || 'Photo'}</small></span>}
                />
                <span className="mediaChooserTick">{on && <Check />}</span>
                {item.caption && <em>{item.caption}</em>}
              </button>
            );
          })}
        </div>
        <footer>
          <span>{sel.length} chosen · up to {max}</span>
          <button type="button" className="primary" onClick={() => onDone(items.filter(item => sel.includes(item.id)))}>
            ADD {sel.length || ''} PHOTO{sel.length === 1 ? '' : 'S'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function SecureEvidenceImage({ evidence, token, preview = false, alt = '', className = '', fallback = null, eager = false }) {
  /* Several possible sources, tried in turn: the secure Drive copy first,
   * then the thumbnail and the original link. If one fails to load, the
   * next is used (the same as the spiral gallery). */
  const [sources, setSources] = useState([]);
  const [at, setAt] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setAt(0);
      if (!evidence) {
        setSources([]);
        return;
      }
      const list = [];
      if (evidence.media_provider === 'youtube' && evidence.youtube_video_id) {
        list.push(evidence.thumbnail_url, `https://i.ytimg.com/vi/${evidence.youtube_video_id}/hqdefault.jpg`);
      } else if (token && evidence.drive_file_id) {
        list.push(publicEvidenceUrl(evidence.id, token));
      } else if (preview && evidence.drive_file_id) {
        try {
          list.push(await cachedEvidenceBlobUrl(evidence.id));
        } catch (error) {
          console.error('Secure media failed', error);
        }
      }
      list.push(evidence.thumbnail_url, evidence.media_url);
      if (active) setSources([...new Set(list.filter(Boolean))]);
    }

    load();

    return () => {
      active = false;
    };
  }, [
    evidence?.id,
    evidence?.drive_file_id,
    evidence?.media_url,
    evidence?.thumbnail_url,
    token,
    preview
  ]);

  const src = sources[at];
  if (!src) {
    if (fallback) return fallback;
    return (
      <div className={`mediaPlaceholder ${className}`}>
        <ImageIcon />
      </div>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchpriority={eager ? 'high' : undefined}
      referrerPolicy="no-referrer"
      onError={() => setAt(n => n + 1)}
    />
  );
}

function PublicGate({ token }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    loadPublicShare(token)
      .then(data => {
        if (data?.valid) {
          setState({ loading: false, data, error: '' });
        } else {
          setState({
            loading: false,
            data: null,
            error: 'This portfolio link has expired or is no longer available.'
          });
        }
      })
      .catch(error => {
        console.error(error);
        setState({
          loading: false,
          data: null,
          error: 'This portfolio link is unavailable.'
        });
      });
  }, [token]);

  if (state.loading) return <Splash text="Opening portfolio…" />;

  if (state.error) {
    return (
      <div className="publicUnavailable">
        <h1>Portfolio unavailable.</h1>
        <p>{state.error}</p>
      </div>
    );
  }

  const data = state.data.panthersRows
    ? { ...state.data, panthers: buildPanthersJourney(state.data.student?.student_id, state.data.panthersRows) }
    : state.data;
  return <Portfolio data={data} token={token} />;
}

function toPublicShape(data, preview = false) {
  return {
    valid: true,
    student: data.student,
    profile: data.profile,
    entries: preview
      ? (data.entries || []).filter(entry => entry.verification_status !== 'draft')
      : (data.entries || []).filter(
          entry => entry.is_public && entry.verification_status === 'verified'
        ),
    evidence: preview
      ? data.evidence || []
      : (data.evidence || []).filter(evidence => evidence.is_public),
    panthers: data.panthers || { teams: [], totals: {} },
    schoolAwards: data.schoolAwards || [],
    approvedQuote: data.approvedQuote || null
  };
}

function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.13 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={{ '--reveal-delay': `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* Where the CV's QR code points: this member portfolio (sign-in, then the
 * page), or the public share link. Workspace previews get no QR code. */
function cvQrUrl(token) {
  const { origin, pathname } = window.location;
  if (pathname.startsWith('/portfolio/')) return `${origin}${pathname}`;
  if (token) return `${origin}/p/${encodeURIComponent(token)}`;
  return '';
}

function Portfolio({ data, token, preview = false, member = false, editHref = null }) {
  /* Members' media is fetched with their session, like the private preview. */
  const mediaPreview = preview || member;

  /* School setting: right-click disabled → block the context menu, long-press
   * saving and dragging photos on the portfolio (it deters casual copying). */
  useEffect(() => {
    let undo = () => {};
    let live = true;
    Promise.all([
      loadPortfolioSettings(),
      supabase.rpc('portfolio_can_set_display').then(({ data: canSet }) => Boolean(canSet)).catch(() => false)
    ]).then(([settings, isAdmin]) => {
      /* Admins follow their own switch; everyone else the other. */
      if (!live || settings[isAdmin ? 'right_click_admin' : 'right_click'] !== 'disabled') return;
      const block = event => event.preventDefault();
      const noDrag = event => {
        if (event.target?.tagName === 'IMG') event.preventDefault();
      };
      document.addEventListener('contextmenu', block, true);
      document.addEventListener('dragstart', noDrag, true);
      document.documentElement.classList.add('noRightClick');
      undo = () => {
        document.removeEventListener('contextmenu', block, true);
        document.removeEventListener('dragstart', noDrag, true);
        document.documentElement.classList.remove('noRightClick');
      };
    });
    return () => {
      live = false;
      undo();
    };
  }, []);
  const entries = useMemo(() => data.entries || [], [data.entries]);
  const evidence = useMemo(() => data.evidence || [], [data.evidence]);
  const profile = data.profile || {};
  const student = data.student || {};
  const panthers = data.panthers || { teams: [], totals: {} };

  const profileImage = resolveProfileEvidence(profile.profile_photo_url, evidence, 'profile_photo');
  const superAdminView = useViewerIsSuperAdmin();
  const incomplete = portfolioNotReady(profile);
  /* Everyone else sees only the "in progress" message until About me is done;
   * the SuperAdmin sees the whole portfolio. */
  const pending = incomplete && !superAdminView;
  const heroImage = resolveProfileEvidence(profile.banner_image_url, evidence, 'hero_banner');

  const schoolAwards = useMemo(() => schoolAwardCards(data.schoolAwards || []), [data.schoolAwards]);
  /* Lines written in "Award comments" (SuperAdmin, Admin, coaches). */
  const [commentLines, setCommentLines] = useState([]);
  useEffect(() => {
    let live = true;
    loadCommentLines().then(rows => live && setCommentLines(rows));
    return () => {
      live = false;
    };
  }, []);
  /* One comment per award, shared by the award cards and the PDF. */
  const allAwards = useMemo(
    () =>
      withComments(
        [...schoolAwards, ...collectAwards(panthers)].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
        commentLines
      ),
    [schoolAwards, panthers, commentLines]
  );
  const hasAwards = allAwards.length > 0;

  /* The Memory Wall shows when there's any photo — or at least a profile photo. */
  const hasMemories =
    Boolean(profileImage) ||
    evidence.some(
      item =>
        (isPhoto(item) || (item.media_provider === 'youtube' && item.youtube_video_id)) &&
        !['profile_photo', 'hero_banner'].includes(item.media_role)
    );

  /* Sections in order; numbers follow whichever ones this student has. */
  const sections = [
    ['ME', 'about'],
    ...(hasAwards ? [['AWARDS', 'awards']] : []),
    ['JOURNEY', 'journey'],
    ...(hasPanthersData(panthers) ? [['PANTHERS', 'panthers']] : []),
    ['VERIFIED', 'verified'],
    ...(hasMemories ? [['MEMORIES', 'memories']] : []),
    ['NEXT', 'next']
  ];
  const numberOf = id => String(sections.findIndex(([, key]) => key === id) + 1).padStart(2, '0');

  /* Memoised so re-renders (e.g. opening a story) never rebuild the spiral. */
  const visibleEntries = useMemo(
    () =>
      entries.filter(
        entry =>
          preview ||
          member ||
          (entry.is_public && entry.verification_status === 'verified')
      ),
    [entries, preview, member]
  );

  const items = useMemo(() => visibleEntries.map((entry, index) => {
    /* The moment's picture: photos and videos only, never documents such
     * as the ManageBac report. */
    const entryMedia = evidence
      .filter(item => item.entry_id === entry.id)
      .filter(item =>
        isPhoto(item) ||
        item.evidence_type === 'video' ||
        (item.media_provider === 'youtube' && item.youtube_video_id)
      )
      .sort((a, b) => {
        if (a.media_role === 'journey_cover') return -1;
        if (b.media_role === 'journey_cover') return 1;
        return (a.sort_order || 0) - (b.sort_order || 0);
      });

    return {
      ...entry,
      number: String(index + 1).padStart(2, '0'),
      year: entry.event_date
        ? String(new Date(`${entry.event_date}T00:00:00`).getFullYear())
        : '',
      evidence: entryMedia[0] || null,
      media: entryMedia
    };
  }), [visibleEntries, evidence]);

  const [story, setStory] = useState(null);
  const [showCv, setShowCv] = useState(false);

  useEffect(() => {
    setPageScrollLocked(Boolean(story));
    return () => setPageScrollLocked(false);
  }, [story]);

  return (
    <div className="publicPortfolio">
      {preview && (
        <div className="previewRibbon">
          PRIVATE PREVIEW · PUBLIC LINK WILL NOT SHOW THIS BAR
        </div>
      )}

      <ThemeToggle small className="pfToggle" />

      <PortfolioRail
        name={profile.preferred_name || student.full_name || 'Student'}
        sections={sections}
        pending={pending}
      />

      <HeroSection
        onViewCv={pending ? null : () => setShowCv(true)}
        student={student}
        profile={profile}
        heroEvidence={heroImage}
        profileEvidence={profileImage}
        token={token}
        preview={mediaPreview}
      />

      {incomplete && superAdminView && (
        <div className="superAdminNote" role="status">
          <ShieldCheck />
          <span>
            <b>SuperAdmin view.</b> About me isn’t complete yet, so others see only the “in progress”
            message. You can see the full portfolio.
          </span>
        </div>
      )}

      {incomplete ? (
        <PortfolioPending profile={profile} student={student} editHref={editHref} preview={preview} />
      ) : (
        <AboutSection profile={profile} student={student} />
      )}

      {/* While the portfolio is "in progress", nothing below the message is
        * shown — except to the SuperAdmin. */}
      {!pending && (
        <>
        {hasAwards && (
          <AwardsSection awards={allAwards} number={numberOf('awards')} />
        )}

        <JourneySection
          studentId={student?.student_id || ''}
          number={numberOf('journey')}
          items={items}
          evidence={evidence}
          token={token}
          preview={mediaPreview}
          onOpen={setStory}
        />

        {hasPanthersData(panthers) && (
          <PanthersJourneySection panthers={panthers} student={student} number={numberOf('panthers')} />
        )}

        <RecognitionSection
          entries={visibleEntries}
          items={items}
          token={token}
          preview={mediaPreview}
          onOpen={setStory}
          panthers={panthers}
          awards={allAwards}
          approvedQuote={data.approvedQuote || null}
          number={numberOf('verified')}
        />


        <MemoryWall
          number={numberOf('memories')}
          name={profile.preferred_name || student.full_name || ''}
          evidence={evidence}
          profilePhoto={profileImage}
          items={items}
          token={token}
          preview={mediaPreview}
          onOpenStory={setStory}
        />

        <NextChapter profile={profile} student={student} number={numberOf('next')} />
        </>
      )}
      <PortfolioFooter />

      {member && (
        <a className="memberBack" href="/">
          <ArrowLeft /> All portfolios
        </a>
      )}

      {showCv && (
        <CvView
          student={student}
          profile={profile}
          items={items}
          panthers={panthers}
          awards={allAwards}
          approvedQuote={data.approvedQuote || null}
          qrUrl={cvQrUrl(token)}
          photo={
            profileImage ? (
              <SecureEvidenceImage evidence={profileImage} token={token} preview={mediaPreview} alt="" />
            ) : null
          }
          onClose={() => setShowCv(false)}
        />
      )}

      {story && (
        <Story
          story={story}
          token={token}
          preview={mediaPreview}
          onClose={() => setStory(null)}
        />
      )}
    </div>
  );
}

function PortfolioRail({ name, sections = [], pending = false }) {
  const links = (pending ? sections.slice(0, 1) : sections).map(([label, id], index) => [
    String(index + 1).padStart(2, '0'),
    label,
    id
  ]);

  return (
    <aside className="portfolioRail">
      <div className="railIdentity">
        <span>{name}</span>
      </div>

      <nav>
        {links.map(([num, label, id]) => (
          <a key={id} href={`#${id}`}>
            <small>{num}</small>
            <b>{label}</b>
          </a>
        ))}
      </nav>

      <div className="railFooter">
        <ThemeToggle className="railToggle" />
        <ShieldCheck />
        <span>TBS VERIFIED</span>
      </div>
    </aside>
  );
}

function HeroSection({
  onViewCv,
  student,
  profile,
  heroEvidence,
  profileEvidence,
  token,
  preview
}) {
  const name = profile.preferred_name || student.full_name || 'Student';
  const descriptors = arr(profile.strengths).slice(0, 3).join(' · ');

  return (
    <section className="portfolioHero">
      <div className="portfolioHeroBackground">
        {heroEvidence ? (
          <SecureEvidenceImage evidence={heroEvidence} token={token} preview={preview} alt="" />
        ) : (
          <div className="heroBackgroundFallback" />
        )}
      </div>

      <div className="heroFilm" />
      <div className="heroGrain" />

      <div className="heroBrand heroBrandBare">
        <img src={TBS_LOGO_WHITE} onError={useColourLogo} alt="The British School" />
      </div>

      <div className="heroChapter"><b>00</b><i />STUDENT JOURNEY</div>

      <div className="heroEditorial">
        <Reveal>
          <small>{descriptors || 'CURIOUS · ACTIVE · GROWING'}</small>
          <h1>{name}</h1>
          <h2>{profile.headline || (portfolioNotReady(profile) ? 'A portfolio in the making.' : '')}</h2>

          <button
            className="heroExplore"
            onClick={() =>
              scrollToSection(portfolioNotReady(profile) ? 'about' : 'journey')
            }
          >
            ENTER MY JOURNEY <ArrowDown />
          </button>

          {onViewCv && (
            <button className="heroExplore heroCvBtn" onClick={onViewCv}>
              VIEW PORTFOLIO <FileText />
            </button>
          )}
        </Reveal>
      </div>

      <HeroPortrait
        name={name}
        yearGroup={student.year_group}
        evidence={profileEvidence}
        token={token}
        preview={preview}
      />

      <div className="heroScroll">SCROLL TO EXPLORE <span /></div>
    </section>
  );
}

function PortfolioPending({ profile, student, editHref, preview }) {
  const name = profile.preferred_name || student.full_name || 'This student';
  const first = String(name).split(' ')[0];

  return (
    <section className="aboutEditorial portfolioPending" id="about">
      <div className="aboutEditorialNumber">01</div>

      <div className="sectionShell">
        <Reveal>
          <div className="aboutEditorialLabel">
            <span>01</span><i /><b>THIS IS ME</b>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="pendingCard">
            <div className="pendingOrbit" aria-hidden="true">
              <i /><i /><i />
              <Sparkles />
            </div>

            <div className="pendingCopy">
              <small>PORTFOLIO IN PROGRESS</small>
              <h2>{first}’s story is still being written.</h2>
              <p>
                The introduction, reflections and moments that make up {first}’s journey at
                The British School will appear here soon. Every great portfolio starts with a
                single page — please check back again.
              </p>

              <ul className="pendingSteps" aria-label="Coming soon">
                <li>Introduction</li>
                <li>About me</li>
                <li>Journey moments</li>
              </ul>

              {(editHref || preview) && (
                <div className="pendingOwner">
                  <span>
                    {preview
                      ? 'Only you can see this note: add an introduction and About me in Profile to complete this section.'
                      : 'This is your portfolio — add an introduction and About me to bring it to life.'}
                  </span>
                  {editHref && (
                    <a className="pendingEdit" href={editHref}>
                      Edit portfolio <ArrowUpRight />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function AboutSection({ profile, student }) {
  const name = profile.preferred_name || student.full_name || 'Student';
  const skills = arr(profile.strengths);
  const interests = arr(profile.interests);
  const languages = arr(profile.languages);

  return (
    <section className="aboutEditorial" id="about">
      <div className="aboutEditorialNumber">01</div>

      <div className="sectionShell">
        <Reveal>
          <div className="aboutEditorialLabel">
            <span>01</span><i /><b>THIS IS ME</b>
          </div>
        </Reveal>

        <div className="aboutEditorialGrid">
          <div className="aboutEditorialMain">
            <Reveal>
              <p className="aboutHello">HELLO, I'M {name.toUpperCase()}</p>
              {profile.headline ? (
                <h2>{profile.headline}</h2>
              ) : (
                <p className="aboutComingSoon">
                  <Sparkles /> {name.split(' ')[0]}’s introduction is coming soon.
                </p>
              )}
            </Reveal>

            <Reveal delay={100}>
              {profile.about_me ? (
                <p className="aboutBody">{profile.about_me}</p>
              ) : (
                <p className="aboutComingSoon">
                  <Sparkles /> The “About me” story is still being written — check back soon.
                </p>
              )}
            </Reveal>

            {!!interests.length && (
              <Reveal delay={160}>
                <div className="aboutInterests">
                  <small>I AM CURIOUS ABOUT</small>
                  <div>
                    {interests.map(item => <span key={item}>{item}</span>)}
                  </div>
                </div>
              </Reveal>
            )}
          </div>

          <aside className="aboutEditorialAside">
            {profile.proud_moment && (
              <Reveal delay={90}>
                <article className="aboutProud">
                  <span>PROUD MOMENT</span>
                  <blockquote>“{profile.proud_moment}”</blockquote>
                </article>
              </Reveal>
            )}

            {!!skills.length && (
              <Reveal delay={150}>
                <article className="aboutFact">
                  <span>SKILLS DEVELOPED</span>
                  <div className="aboutSkillList">
                    {skills.map((skill, index) => (
                      <div key={skill}>
                        <small>{String(index + 1).padStart(2, '0')}</small>
                        <b>{skill}</b>
                      </div>
                    ))}
                  </div>
                </article>
              </Reveal>
            )}

            {!!languages.length && (
              <Reveal delay={200}>
                <article className="aboutFact">
                  <span>LANGUAGE PROFICIENCY</span>
                  <p>{languages.join(' · ')}</p>
                </article>
              </Reveal>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

const JOURNEY_MODES = [['carousel', 'Carousel'], ['spiral', 'Spiral'], ['blog', 'Blog']];

/* Admin-only: how the "Not a timeline" Journey section is shown. */
function JourneyDisplaySettings({ studentId, studentName }) {
  const [st, setSt] = useState({ ready: false, canSet: false, override: null, def: null });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let live = true;
    supabase.rpc('portfolio_get_display_mode', { p_student_id: String(studentId || '') })
      .then(({ data, error }) => {
        if (!live) return;
        const m = !error && data ? data : {};
        setSt({ ready: true, canSet: !!m.can_set, override: m.override || null, def: m.default || null });
      })
      .catch(() => { if (live) setSt(x => ({ ...x, ready: true })); });
    return () => { live = false; };
  }, [studentId]);

  async function save(scope, mode, apply) {
    setMsg('');
    const { error } = await supabase.rpc('portfolio_set_display_mode', { p_scope: scope, p_mode: mode || '' });
    if (error) { setMsg('Could not save. Please try again.'); return; }
    setSt(x => ({ ...x, ...apply }));
    setMsg('Saved.');
  }

  if (!st.ready || !st.canSet) return null;
  const defMode = st.def || 'carousel';
  const label = key => JOURNEY_MODES.find(([k]) => k === key)?.[1];

  return (
    <div className="journeyDisplayPanel">
      <h3>Journey display</h3>
      <p>How the “Not a timeline. A constellation of experiences.” section is shown on portfolios. Viewers get no switch.</p>

      <div className="jdRow">
        <span className="jdLabel">School default (everyone)</span>
        <div className="jdChoices">
          {JOURNEY_MODES.map(([key, name]) => (
            <button type="button" key={key} className={defMode === key ? 'isActive' : ''} onClick={() => save('default', key, { def: key })}>
              {name}
            </button>
          ))}
        </div>
      </div>

      {studentId && (
        <div className="jdRow">
          <span className="jdLabel">This student{studentName ? ` · ${studentName}` : ''}</span>
          <div className="jdChoices">
            <button type="button" className={st.override ? '' : 'isActive'} onClick={() => save(studentId, '', { override: null })}>
              Use school default ({label(defMode)})
            </button>
            {JOURNEY_MODES.map(([key, name]) => (
              <button type="button" key={key} className={st.override === key ? 'isActive' : ''} onClick={() => save(studentId, key, { override: key })}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
      {msg && <small className="jdMsg" role="status">{msg}</small>}
    </div>
  );
}

function JourneySection({ items, evidence, token, preview, onOpen, number = '02', studentId = '' }) {
  const domains = useMemo(() => {
    const seen = new Set();
    return (items || [])
      .map(item => item.domain)
      .filter(domain => {
        if (!domain || seen.has(domain)) return false;
        seen.add(domain);
        return true;
      });
  }, [items]);

  const [activeDomain, setActiveDomain] = useState('all');
  /* Carousel (default), Spiral, or a simple blog-style list of the same moments. */
  const [view, setView] = useState('carousel');
  /* The layout is set by an Admin in Workspace > Sharing & access (school default
   * plus an optional per-student override). Viewers get no switch. */
  const [display, setDisplay] = useState({ ready: false });

  useEffect(() => {
    let live = true;
    supabase.rpc('portfolio_get_display_mode', { p_student_id: String(studentId || '') })
      .then(({ data, error }) => {
        if (!live) return;
        const m = !error && data ? data : {};
        setDisplay({ ready: true });
        setView(m.override || m.default || 'carousel');
      })
      .catch(() => { if (live) setDisplay(d => ({ ...d, ready: true })); });
    return () => { live = false; };
  }, [studentId]);

  useEffect(() => {
    if (activeDomain !== 'all' && !domains.includes(activeDomain)) {
      setActiveDomain('all');
    }
  }, [activeDomain, domains]);

  const filteredItems = useMemo(
    () => activeDomain === 'all' ? items : items.filter(item => item.domain === activeDomain),
    [items, activeDomain]
  );

  const filteredEntryIds = useMemo(
    () => new Set(filteredItems.map(item => item.id)),
    [filteredItems]
  );

  const filteredEvidence = useMemo(
    () => evidence.filter(item => !item.entry_id || filteredEntryIds.has(item.entry_id)),
    [evidence, filteredEntryIds]
  );

  return (
    <section className="journeySection" id="journey">
      <div className="sectionShell">
        <Reveal>
          <div className="journeyHeading">
            <div>
              <div className="sectionLabel darkLabel">
                <span>{number}</span><i />MY JOURNEY
              </div>

              <h2>
                Not a timeline.
                <br />
                A constellation
                <br />
                of experiences.
              </h2>
            </div>

            <div className="journeyIntroCopy">
              <p>
                Every card is a moment that changed something: a challenge, achievement, idea,
                responsibility or experience worth carrying forward.
              </p>
              <small>DRAG · SWIPE · SCROLL · SELECT</small>
            </div>
          </div>
        </Reveal>

        <div className="journeyToolbar">
          {domains.length > 1 && (
            <div className="journeyFilterBar" aria-label="Filter journey by category">
              <button
                type="button"
                className={`journeyFilterTab ${activeDomain === 'all' ? 'isActive' : ''}`}
                aria-pressed={activeDomain === 'all'}
                onClick={() => setActiveDomain('all')}
              >
                <span>All</span>
                <small>{items.length}</small>
              </button>

              {domains.map(domain => {
                const count = items.filter(item => item.domain === domain).length;
                return (
                  <button
                    type="button"
                    key={domain}
                    className={`journeyFilterTab ${activeDomain === domain ? 'isActive' : ''}`}
                    aria-pressed={activeDomain === domain}
                    onClick={() => setActiveDomain(domain)}
                  >
                    <span>{domainLabel(domain)}</span>
                    <small>{count}</small>
                  </button>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {!display.ready ? null : view === 'carousel' ? (
        <JourneyCarousel
          items={filteredItems}
          evidence={filteredEvidence}
          token={token}
          preview={preview}
          onOpen={onOpen}
        />
      ) : view === 'spiral' ? (
        <JourneySpiral
          items={filteredItems}
          evidence={filteredEvidence}
          token={token}
          preview={preview}
          onOpen={onOpen}
        />
      ) : (
        <JourneyBlog items={filteredItems} token={token} preview={preview} onOpen={onOpen} />
      )}
    </section>
  );
}

/* The same generated cover the spiral shows when a moment has no photo. */
function MomentCover({ item }) {
  return (
    <span className="momentCover" aria-hidden="true">
      <small>{domainLabel(item.domain)}{item.year ? ` · ${item.year}` : ''}</small>
      <b>{item.title}</b>
      <i>{item.number}</i>
    </span>
  );
}

/* Blog view: the same moments as the spiral, as a simple scrolling list. */
function JourneyBlog({ items, token, preview, onOpen }) {
  if (!items.length) {
    return (
      <div className="sectionShell">
        <p className="journeyBlogEmpty">No moments in this category yet.</p>
      </div>
    );
  }

  return (
    <div className="sectionShell journeyBlog journeyCards">
      {items.map((item, index) => {
        const skill = arr(item.skills)[0];
        return (
          <Reveal key={item.id} delay={Math.min(index, 4) * 60}>
            <button type="button" className="jCard" onClick={() => onOpen(item)} aria-label={`Open ${item.title}`}>
              <div className="jCardPhoto">
                {item.evidence ? (
                  <SecureEvidenceImage evidence={item.evidence} token={token} preview={preview} alt="" fallback={<div className="jCardEmpty" />} />
                ) : (
                  <div className="jCardEmpty" />
                )}
              </div>
              <footer>
                <h3>{item.title}</h3>
                <div className="jCardRow">
                  {skill ? <span className="jCardSkill">{skill}</span> : <span />}
                  <span className="jCardOpen">Open story →</span>
                </div>
              </footer>
            </button>
          </Reveal>
        );
      })}
    </div>
  );
}

function cleanInsightText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(' · ');
  return String(value || '').trim();
}

function joinHumanList(values) {
  const list = [...new Set((values || []).filter(Boolean))];
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function buildPanthersParticipationSummary(panthers) {
  const activities = panthers?.totals?.activities || [];
  const seasons = panthers?.totals?.seasons || [];

  if (activities.length > 1) {
    return {
      title: 'Breadth of participation',
      narrative: `Active across ${joinHumanList(activities)} during the TBS journey, building experience across different sporting environments.`,
      meta: `${activities.length} SPORTS${seasons.length ? ` · ${seasons.join(' · ')}` : ''}`
    };
  }

  if (activities.length === 1 && seasons.length > 1) {
    return {
      title: 'Depth of participation',
      narrative: `Sustained involvement in ${activities[0]} across ${seasons.length} academic seasons, showing continuity within the TBS Panthers programme.`,
      meta: `${activities[0].toUpperCase()} · ${seasons.join(' · ')}`
    };
  }

  if (activities.length === 1) {
    return {
      title: 'Sporting participation',
      narrative: `Active in ${activities[0]} as part of the TBS Panthers programme.`,
      meta: `${activities[0].toUpperCase()}${seasons.length ? ` · ${seasons.join(' · ')}` : ''}`
    };
  }

  return null;
}

function isMeaningfulPlayerRank(team) {
  if (!team?.playerRank || !team?.rankedPlayers || team.rankedPlayers < 2) return false;
  const topQuarterCutoff = Math.max(1, Math.ceil(team.rankedPlayers * 0.25));
  return team.playerRank <= topQuarterCutoff;
}

function buildTeamTimelineEvidence(team) {
  const candidates = [];
  const scope = team.attendanceScope || 'recorded sessions';

  if (team.knownAttendance > 0) {
    const percent = Number(team.attendancePercent || 0);
    let title = 'Attendance record';
    let interpretation = '';

    if (percent >= 80) {
      title = 'Consistency & commitment';
      interpretation = ', showing sustained participation across the programme';
    } else if (percent >= 60) {
      title = 'Regular participation';
      interpretation = ', reflecting regular participation across the season';
    }

    candidates.push({
      key: 'consistency',
      title,
      narrative: `Attended ${team.attended} of ${team.knownAttendance} ${scope} this season (${percent}%)${interpretation}.`,
      meta: `${team.attended} / ${team.knownAttendance} ${scope.toUpperCase()} · ${percent}%`,
      score:
        45 +
        Math.min(team.knownAttendance, 20) * 1.25 +
        percent * 0.35
    });
  }

  if (team.selectedGames > 0) {
    candidates.push({
      key: 'competition',
      title: 'Competitive involvement',
      narrative:
        team.selectedGames > 1
          ? `Selected for ${team.selectedGames} published match squads, with involvement continuing across the season.`
          : 'Selected for 1 published match squad during the season.',
      meta: `${team.selectedGames} SQUAD SELECTION${team.selectedGames === 1 ? '' : 'S'}${
        team.publishedResults
          ? ` · ${team.publishedResults} PUBLISHED RESULT${team.publishedResults === 1 ? '' : 'S'}`
          : ''
      }`,
      score: 62 + Math.min(team.selectedGames, 10) * 5 + Math.min(team.publishedResults, 5) * 2
    });
  }

  const meaningfulRank = isMeaningfulPlayerRank(team);
  const matchAwards = team.matchAwards || [];

  /* Awards (Player of the Month, Player of the Match, coach rewards) have
   * their own Awards & Recognition section, so the timeline keeps to
   * participation, competition and team ranking. */
  if (meaningfulRank) {
    candidates.push({
      key: 'ranking',
      title: 'Team ranking',
      narrative: `Ranked ${team.playerRank} of ${team.rankedPlayers} players within the team based on Panthers player-rating points.`,
      meta: `TEAM RANK ${team.playerRank} / ${team.rankedPlayers}`,
      score: 104
    });
  }

  const awardCount = matchAwards.length + (team.playerOfMonth || []).length + (team.rewards || []).length;
  if (awardCount) {
    candidates.push({
      key: 'awards-pointer',
      title: 'Recognised',
      narrative: `${awardCount} award${awardCount === 1 ? '' : 's'} with this team — see Awards & Recognition.`,
      meta: 'AWARDS & RECOGNITION',
      score: 40
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item, index) => ({
      ...item,
      number: String(index + 1).padStart(2, '0')
    }));
}

function PanthersJourneySection({ panthers, student, number = '03' }) {
  const teams = panthers.teams || [];
  const participation = buildPanthersParticipationSummary(panthers);

  if (!teams.length) return null;

  return (
    <section className="panthersJourney panthersTimelineJourney" id="panthers">
      <div className="panthersBackdropWord">PANTHERS</div>

      <div className="sectionShell">
        <Reveal>
          <div className="panthersSectionHead">
            <div>
              <div className="sectionLabel panthersLabel">
                <span>{number}</span><i />TBS PANTHERS
              </div>
              <img className="panthersSectionLogo" src={PANTHERS_LOGO} alt="TBS Panthers" />
              <h2>
                Built through
                <br />
                sport.
              </h2>
            </div>

            <div className="panthersIntro">
              <ShieldCheck />
              <small>VERIFIED TBS SPORTS EVIDENCE</small>
              <p>
                A chronological view of the teams and seasons that shaped the student's
                Panthers journey, using only available official records.
              </p>
            </div>
          </div>
        </Reveal>

        <div className="panthersTimelineViewport" aria-label={`${student.full_name || 'Student'} Panthers journey timeline`}>
          <div className="panthersTimelineTrack">
            {participation && (
              <Reveal>
                <article className="panthersTimelineStartCard">
                  <div className="panthersTimelineStartMarker">
                    <ShieldCheck />
                  </div>
                  <small>START OF THE JOURNEY</small>
                  <h3>{participation.title}</h3>
                  <p>{participation.narrative}</p>
                  <span>{participation.meta}</span>
                </article>
              </Reveal>
            )}

            {teams.map((team, index) => {
              const evidence = buildTeamTimelineEvidence(team);

              return (
                <Reveal key={team.team_id} delay={(index % 4) * 70}>
                  <article className={`panthersTimelineItem ${index % 2 ? 'isFlip' : ''}`}>
                    <div className="panthersTimelinePhoto">
                      <img
                        src={team.team_banner_url || team.team_image_url || PANTHERS_LOGO}
                        alt=""
                      />
                      <div className="panthersTeamMediaShade" />
                      <div className="panthersTimelineSequence">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                      <div className="panthersTimelineTeamTitle">
                        <small>
                          {[team.activity, team.category, team.gender].filter(Boolean).join(' · ')}
                        </small>
                        <h3>{team.team_name}</h3>
                        {!!team.seasons?.length && <span>{team.seasons.join(' · ')}</span>}
                      </div>
                    </div>

                    <div className="panthersTimelineNode" aria-hidden="true">
                      <span />
                    </div>

                    <div className={`panthersTimelineEvidence panthersTimelineEvidenceCount${evidence.length}`}>
                      {evidence.length ? (
                        evidence.map(item => (
                          <article className="panthersTimelineEvidenceCard" key={`${team.team_id}-${item.key}`}>
                            <div className="panthersTimelineEvidenceTitle">
                              <span>{item.number}</span>
                              <h4>{item.title}</h4>
                            </div>
                            <p>{item.narrative}</p>
                            {item.key === 'awards-pointer' ? (
                              <a className="panthersAwardsLink" href="#awards">
                                {item.meta} <ArrowRight aria-hidden="true" />
                              </a>
                            ) : (
                              <small>{item.meta}</small>
                            )}
                          </article>
                        ))
                      ) : (
                        <article className="panthersTimelineEvidenceCard panthersTimelineMembershipOnly">
                          <div className="panthersTimelineEvidenceTitle">
                            <span>01</span>
                            <h4>Team participation</h4>
                          </div>
                          <p>
                            Recorded as a member of {team.team_name || 'this Panthers team'}.
                          </p>
                          <small>
                            {[team.activity, ...(team.seasons || [])]
                              .filter(Boolean)
                              .join(' · ')
                              .toUpperCase()}
                          </small>
                        </article>
                      )}
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>

        <div className="panthersTimelineHint panthersTimelineHintVertical">
          <ArrowDown />
          <span>SCROLL DOWN TO FOLLOW THE PANTHERS JOURNEY</span>
        </div>

        <PanthersSource />
      </div>
    </section>
  );
}

/* One quiet line instead of the full rules; the detail is a tap away. */
function PanthersSource() {
  const [open, setOpen] = useState(false);
  return (
    <div className={`panthersSource ${open ? 'isOpen' : ''}`}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <ShieldCheck /> From official TBS Panthers records <Info />
      </button>
      {open && (
        <p>
          Includes participation, competition and recognition: Player of the Month, Player of the Match and
          Coach’s Awards shared with families.
        </p>
      )}
    </div>
  );
}

/* Every award a student holds, newest first, from the Panthers record. */
/* Match reports are typed quickly by staff. Before quoting one, fix the
 * obvious slips ("tbs" → "TBS", "one the match" → "won the match",
 * sentence capitals) and drop the sentence that only names the Player of
 * the Match — the card already says that. */
function tidyMatchReport(text) {
  const sentences = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .filter(sentence => !/\b(man|player|woman|girl|boy) of the match\b/i.test(sentence));
  return sentences
    .map(sentence =>
      sentence
        .replace(/\btbs\b/gi, 'TBS')
        .replace(/\bTBS panthers\b/g, 'TBS Panthers')
        .replace(/\bone (the|by)\b/gi, 'won $1')
        .replace(/^./, ch => ch.toUpperCase())
    )
    .join(' ')
    .trim();
}

const teamShortName = name => String(name || '').replace(/^Panthers\s+/i, '').trim() || 'the Panthers';

/* One short, clean sentence for a Player of the Match award (the card
 * already shows the opponent, date and score). */
function matchStory(award, teamName) {
  const side = `the ${teamShortName(teamName)}`;
  const at = award.location ? ` at ${award.location}` : '';
  if (award.opponent && award.outcome === 'Win') return `Named Player of the Match as ${side} beat ${award.opponent}${at}.`;
  if (award.opponent && award.outcome === 'Draw') return `Named Player of the Match in ${side}’s draw with ${award.opponent}${at}.`;
  if (award.opponent) return `Named Player of the Match for ${side} against ${award.opponent}${at}.`;
  return `Named Player of the Match${award.title ? ` in ${award.title}` : ''}${at}.`;
}

/* A coach's award, said the way a coach would say it. */
function rewardNarrative(title = '') {
  const t = String(title).toLowerCase();
  if (/effort|hard ?work|work ?rate/.test(t))
    return 'Chosen by the coaches for giving everything, every session — the kind of effort that lifts a whole team.';
  if (/improv|progress|develop/.test(t))
    return 'Recognised for the quiet, steady work that turns practice into progress.';
  if (/spirit|sportsman|fair ?play|team ?player|teamwork/.test(t))
    return 'Celebrated for the spirit that makes a team: encouraging others, playing fair and never giving up.';
  if (/lead|captain/.test(t))
    return 'Recognised for leading by example — on the field and off it.';
  if (/attitude|commit|dedicat|discipline|attendance/.test(t))
    return 'Honoured for showing up, working hard and setting the standard for others.';
  if (/mvp|most valuable|best player|outstanding|star/.test(t))
    return 'Singled out by the coaches for an outstanding contribution to the team.';
  if (/defen|attack|goal|keeper|shoot|serve|bowl|bat/.test(t))
    return 'Picked out by the coaches for skill and courage when the team needed it most.';
  return 'Chosen by the Panthers coaches — recognition earned through hard work and heart.';
}

function collectAwards(panthers) {
  const out = [];
  (panthers?.teams || []).forEach(team => {
    const sport = [team.activity, team.category, team.gender].filter(Boolean).join(' · ');
    (team.playerOfMonth || []).forEach(row =>
      out.push({
        id: `month-${row.id || row.month_key}`,
        kind: 'month',
        label: row.recognition_type || 'Player of the Month',
        title: teamShortName(team.team_name),
        team: team.team_name,
        sport,
        date: String(row.month_key || '').slice(0, 10),
        narrative: `Out of the whole ${teamShortName(team.team_name)} squad, the coaches chose this player for ${monthLabel(row.month_key)}: a month of commitment, consistency and standards that lifted everyone.`,
        story: `Chosen by Panthers staff from the whole ${teamShortName(team.team_name)} squad for ${monthLabel(row.month_key)}.`,
        plain: `Chosen by Panthers staff from the whole ${teamShortName(team.team_name)} squad for ${monthLabel(row.month_key)}.`,
        quote: ''
      })
    );
    (team.matchAwards || []).forEach(award =>
      out.push({
        id: `match-${award.key}`,
        kind: 'match',
        label: 'Player of the Match',
        title: award.opponent ? `vs ${award.opponent}` : award.title || 'Panthers match',
        team: team.team_name,
        sport,
        date: award.date,
        outcome: award.outcome,
        score: award.score,
        narrative: describeMatchAward({ ...award, comment: '', summary: '' }),
        story: matchStory(award, team.team_name),
        location: award.location || '',
        quote: award.comment || tidyMatchReport(award.summary) || '',
        quoteBy: award.comment ? 'Coach' : tidyMatchReport(award.summary) ? 'Match report' : '',
        comment: award.comment || '',
        commentBy: award.commentBy || '',
        report: tidyMatchReport(award.summary) || '',
        plain: matchStory(award, team.team_name)
      })
    );
    (team.rewards || []).forEach(row =>
      out.push({
        id: `reward-${row.id}`,
        kind: 'reward',
        label: 'Coach’s Award',
        title: row.reward_title || row.reward_type || 'Coach’s Award',
        team: team.team_name,
        sport,
        date: row.date,
        narrative: rewardNarrative(row.reward_title || row.reward_type),
        story: `${row.reward_title || row.reward_type || 'Coach’s Award'}: ${rewardNarrative(row.reward_title || row.reward_type)}`,
        quote: String(row.reward_comment || row.comment || '').trim(),
        quoteBy: String(row.reward_comment || row.comment || '').trim() ? 'Coach' : '',
        comment: String(row.reward_comment || row.comment || '').trim(),
        commentBy: row.awarded_by_name || '',
        plain: `${row.reward_title || row.reward_type || 'Coach’s Award'} · awarded by the Panthers coaches.`
      })
    );
  });
  return out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/* awards arrive with their comment already chosen (withComments). */
function AwardsSection({ awards = [], number }) {
  const [shown, setShown] = useState(8);

  if (!awards.length) return null;

  const counts = {
    school: awards.filter(a => a.kind === 'school').length,
    month: awards.filter(a => a.kind === 'month').length,
    match: awards.filter(a => a.kind === 'match').length,
    reward: awards.filter(a => a.kind === 'reward').length
  };
  const tallies = [
    ['school', 'School awards'],
    ['month', 'Player of the Month'],
    ['match', 'Player of the Match'],
    ['reward', 'Coach rewards']
  ].filter(([kind]) => counts[kind]);

  return (
    <section className="awardsSection" id="awards">
      <div className="sectionShell">
        <Reveal>
          <div className="awardsHead">
            <div>
              <div className="sectionLabel darkLabel">
                <span>{number}</span><i />AWARDS &amp; RECOGNITION
              </div>
              <h2>
                Recognised
                <br />
                <em>for what they do.</em>
              </h2>
            </div>
            <div className="awardsTallies">
              {tallies.map(([kind, label]) => (
                <div key={kind} className={`awardsTally is-${kind}`}>
                  <b>{String(counts[kind]).padStart(2, '0')}</b>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="awardsGrid achGrid">
          {awards.slice(0, shown).map((award, index) => (
            <Reveal key={award.id} delay={Math.min(index % 8, 6) * 60}>
              <AchievementCard award={award} filled={Math.min(3, counts[award.kind] || 1)} />
            </Reveal>
          ))}
        </div>

        {awards.length > shown && (
          <div className="awardsMore">
            <button type="button" onClick={() => setShown(n => n + 8)}>
              Load more <span>{shown} of {awards.length}</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---- Achievement card: notched black card, art panel, one big word ---- */
const ACH_COLOURS = {
  school: ['#eec058', '#8a5a12'],
  month: ['#4f86ff', '#0d1f6b'],
  match: ['#ff6a45', '#5c130a'],
  reward: ['#b06bff', '#2c0d63']
};

/* The award itself, drawn as an object (medal, trophy, rosette or crest)
 * over a big outlined word, in the award's colour. */
function achWord(award) {
  if (award.kind === 'match') return 'MVP';
  if (award.kind === 'month') return 'No.1';
  if (award.kind === 'reward') return String(award.criterion || 'COACH').toUpperCase();
  return 'TBS';
}

function AchievementObject({ kind, metal, hi, lo, label = '' }) {
  const m = `url(#${metal})`;
  if (kind === 'month') {
    return (
      <g>
        <path d="M-58 -78h116v18c0 52-24 86-58 92-34-6-58-40-58-92z" fill={m} />
        <path d="M-58 -62c-30 0-40 18-36 34 4 18 22 28 40 30M58 -62c30 0 40 18 36 34-4 18-22 28-40 30" fill="none" stroke={m} strokeWidth="9" strokeLinecap="round" />
        <path d="M-10 32h20v26h-20z" fill={m} />
        <path d="M-38 58h76l8 22h-92z" fill={m} />
        <path d="M-30 -66c-2 40 6 68 18 82" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="6" strokeLinecap="round" />
        <text x="0" y="-12" textAnchor="middle" fontSize="26" fontWeight="700" fill={lo} fontFamily="Inter, system-ui, sans-serif">1</text>
      </g>
    );
  }
  if (kind === 'reward') {
    const petals = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return `${(Math.cos(a) * 58).toFixed(1)},${(Math.sin(a) * 58).toFixed(1)}`;
    });
    return (
      <g>
        <path d="M-30 30l-22 66 24-10 14 22 18-62zM30 30l22 66-24-10-14 22-18-62z" fill={hi} opacity=".85" />
        {petals.map((pt, i) => <circle key={i} cx={pt.split(',')[0]} cy={pt.split(',')[1]} r="17" fill={m} />)}
        <circle r="54" fill={m} />
        <circle r="40" fill="none" stroke={lo} strokeOpacity=".5" strokeWidth="2" strokeDasharray="3 5" />
        {label ? (
          <text
            x="0"
            y={label.length > 7 ? 5 : 8}
            textAnchor="middle"
            fontSize={label.length > 10 ? 12 : label.length > 8 ? 14 : label.length > 6 ? 17 : label.length > 5 ? 20 : 24}
            fontWeight="800"
            letterSpacing={label.length > 7 ? 0 : -0.5}
            fill={lo}
            fontFamily="Inter, system-ui, sans-serif"
          >
            {label}
          </text>
        ) : (
          <path d="M0 -22l6.5 13.2 14.5 2.1-10.5 10.2 2.5 14.5L0 11.2l-13 6.8 2.5-14.5L-21 -6.7l14.5-2.1z" fill={lo} />
        )}
        <path d="M-36 -26a46 46 0 0 1 30 -22" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="5" strokeLinecap="round" />
      </g>
    );
  }
  if (kind === 'school') {
    return (
      <g>
        <path d="M-70 40c-30-30-30-80 -6-110M70 40c30-30 30-80 6-110" fill="none" stroke={hi} strokeOpacity=".5" strokeWidth="3" />
        {[0, 1, 2, 3, 4].map(i => (
          <g key={i}>
            <ellipse cx={-80 + i * 3} cy={20 - i * 22} rx="6" ry="13" transform={`rotate(${-30 + i * 8} ${-80 + i * 3} ${20 - i * 22})`} fill={hi} opacity=".55" />
            <ellipse cx={80 - i * 3} cy={20 - i * 22} rx="6" ry="13" transform={`rotate(${30 - i * 8} ${80 - i * 3} ${20 - i * 22})`} fill={hi} opacity=".55" />
          </g>
        ))}
        <path d="M0 -84l58 20v40c0 50-26 82-58 96-32-14-58-46-58-96v-40z" fill={m} />
        <path d="M0 -70l44 15v32c0 40-20 66-44 78-24-12-44-38-44-78v-32z" fill="none" stroke={lo} strokeOpacity=".45" strokeWidth="2" />
        <path d="M-20 -6l14 14 28-30" fill="none" stroke={lo} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M-40 -48c10-10 22-16 34-18" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="5" strokeLinecap="round" />
      </g>
    );
  }
  /* match: a medal on a ribbon */
  return (
    <g>
      <path d="M-44 -100l30 0 26 70-26 10zM44 -100l-30 0-26 70 26 10z" fill={hi} opacity=".8" />
      <path d="M-44 -100l30 0 26 70" fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="3" />
      <circle cy="22" r="58" fill={m} />
      <circle cy="22" r="44" fill="none" stroke={lo} strokeOpacity=".5" strokeWidth="2.5" />
      <text x="0" y="34" textAnchor="middle" fontSize="30" fontWeight="800" letterSpacing="-1" fill={lo} fontFamily="Inter, system-ui, sans-serif">MVP</text>
      <path d="M-38 -6a48 48 0 0 1 26 -24" fill="none" stroke="#fff" strokeOpacity=".65" strokeWidth="6" strokeLinecap="round" />
    </g>
  );
}

function AchievementArt({ award }) {
  const [hi, lo] = ACH_COLOURS[award.kind] || ACH_COLOURS.school;
  const gid = `ach-${String(award.id).replace(/[^a-z0-9]/gi, '')}`;
  const word = achWord(award);
  return (
    <svg className="achArt" viewBox="0 0 420 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id={`${gid}-bg`} cx="0.74" cy="0.38" r="0.8">
          <stop offset="0" stopColor={lo} />
          <stop offset="1" stopColor="#05051a" />
        </radialGradient>
        <linearGradient id={`${gid}-m`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".3" stopColor={hi} />
          <stop offset=".7" stopColor={hi} stopOpacity=".85" />
          <stop offset="1" stopColor={lo} />
        </linearGradient>
        <radialGradient id={`${gid}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={hi} stopOpacity=".55" />
          <stop offset="1" stopColor={hi} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${gid}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".5" stopColor="#05051a" stopOpacity="0" />
          <stop offset="1" stopColor="#05051a" stopOpacity=".8" />
        </linearGradient>
      </defs>
      <rect width="420" height="260" fill={`url(#${gid}-bg)`} />
      <text
        x="-6"
        y="150"
        fontSize={word.length > 3 ? 132 : 170}
        fontWeight="800"
        letterSpacing="-6"
        fill="none"
        stroke={hi}
        strokeOpacity=".28"
        strokeWidth="1.5"
        fontFamily="Inter, system-ui, sans-serif"
      >
        {word}
      </text>
      <circle cx="320" cy="104" r="100" fill={`url(#${gid}-glow)`} />
      <g transform="translate(320 104) rotate(-8) scale(.8)">
        <AchievementObject kind={award.kind} metal={`${gid}-m`} hi={hi} lo={lo} label={award.kind === 'reward' && award.criterion ? String(award.criterion).toUpperCase().slice(0, 14) : ''} />
      </g>
      <rect width="420" height="260" fill={`url(#${gid}-s)`} />
    </svg>
  );
}

/* The big word at the foot of an award card: the sport (the match result,
 * month and award type already show in the lines above). */
function achBigWord(award) {
  if (award.kind === 'school') {
    /* Academic awards: the subject/category if there is one, otherwise the award's name. */
    const w = String(award.category || award.label || '').trim();
    return w ? `${w}.` : 'Honoured.';
  }
  const sport = String(award.sport || '').split(' · ')[0].trim()
    || String(award.team || '').replace(/^Panthers\s+/i, '').replace(/\s+(U\d+|Mixed|Boys|Girls).*$/i, '').trim();
  return sport ? `${sport}.` : 'Panthers.';
}

export function AchievementCard({ award, filled = 1 }) {
  /* The comment (giver's words or an Award comments line); without one, a
   * plain factual line. Match reports sit underneath as a small source. */
  const plain = award.plain || award.narrative;
  return (
    <article className={`achCard is-${award.kind}`}>
      <div className="achTab"><span>— {award.label}</span></div>
      <div className="achBody">
        <div className="achPanel">
          <AchievementArt award={award} />
          <h3>{award.title}</h3>
        </div>
        <div className="achMeta">
          {award.team}
          {award.date && award.kind !== 'month' ? ` · ${formatDate(award.date)}` : ''}
          {award.outcome && award.kind === 'match' ? ` · ${award.outcome}${award.score ? ` ${award.score}` : ''}` : ''}
        </div>
        {award.comment ? (
          <blockquote className="achNote">
            <p>“{award.comment}”</p>
            {award.commentBy && <cite>— {award.commentBy}</cite>}
          </blockquote>
        ) : (
          plain && <p className="achWords">{plain}</p>
        )}
        {award.kind === 'match' && award.report && award.report !== award.comment && (
          <p className="achReport">Match report: {award.report}</p>
        )}
        <div className="achBig">{achBigWord(award)}</div>
        <div className="achSource">
          <ShieldCheck /> {award.kind === 'school' ? 'Verified by TBS' : 'TBS Panthers record'}
        </div>
      </div>
      <div className="achFoot" aria-hidden="true">
        {[0, 1, 2].map(i => <i key={i} className={i < filled ? 'on' : ''} />)}
      </div>
    </article>
  );
}


/* True once the element has scrolled into view (stays true). */
function useSeenOnce(ref) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return undefined;
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [seen]);
  return seen;
}

/* ATL skills shown in verified moments: same pattern as the Learner
 * Profile panel, in its own section between Journey and Panthers. */
const ATL_SKILLS = (SKILL_GROUPS.find(group => group.id === 'atl') || { skills: [] }).skills;
const SHOWED_SKILLS = (SKILL_GROUPS.find(group => group.id === 'cas') || { skills: [] }).skills;

function atlMomentsFor(items, skill) {
  return items.filter(
    item => item.verification_status === 'verified' && arr(item.skills).some(s => String(s).toLowerCase() === skill.toLowerCase())
  );
}

function hasAtlSkills(items) {
  return [...ATL_SKILLS, ...SHOWED_SKILLS].some(skill => atlMomentsFor(items, skill).length);
}


const LEARNER_PROFILE = ['Inquirer', 'Knowledgeable', 'Thinker', 'Communicator', 'Principled', 'Open-minded', 'Caring', 'Risk-taker', 'Balanced', 'Reflective'];

/* The school's endorsement: a real second voice (coach or teacher), what
 * TBS has verified, and the Learner Profile it shows. */

/* All the verified moments of one year (or "Earlier"), as a page of cards.
 * A card opens the moment's story on top; closing it comes back here. */
function YearMoments({ year, years = [], items = [], token, preview, onOpen, onClose }) {
  const listed = years.filter(y => y !== 'Earlier');
  const oldest = listed.length ? Math.min(...listed) : 0;
  const yearOf = item => (item.event_date ? new Date(`${item.event_date}T00:00:00`).getFullYear() : null);
  const moments = items
    .filter(item => item.verification_status === 'verified')
    .filter(item => (year === 'Earlier' ? yearOf(item) && yearOf(item) < oldest : yearOf(item) === year))
    .sort((a, b) => String(b.event_date || '').localeCompare(String(a.event_date || '')));

  useEffect(() => {
    const onKey = event => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="yearPage" role="dialog" aria-label={`Moments from ${year}`}>
      <div className="yearPageTop">
        <span>VERIFIED MOMENTS · {String(year).toUpperCase()}</span>
        <button type="button" onClick={onClose}>CLOSE <X /></button>
      </div>
      <div className="yearPageBody">
        <small>{moments.length} verified moment{moments.length === 1 ? '' : 's'}</small>
        <h2>{year === 'Earlier' ? 'Earlier years.' : `${year}.`}</h2>
        <div className="journeyCards">
          {moments.map(item => {
            const skill = arr(item.skills)[0];
            return (
              <button type="button" key={item.id} className="jCard" onClick={() => onOpen?.(item)} aria-label={`Open ${item.title}`}>
                <div className="jCardPhoto">
                  {item.evidence ? (
                    <SecureEvidenceImage evidence={item.evidence} token={token} preview={preview} alt="" fallback={<div className="jCardEmpty" />} />
                  ) : (
                    <div className="jCardEmpty" />
                  )}
                </div>
                <footer>
                  <h3>{item.title}</h3>
                  <div className="jCardRow">
                    {skill ? <span className="jCardSkill">{skill}</span> : <span>{domainLabel(item.domain)}</span>}
                    <span className="jCardOpen">Open story →</span>
                  </div>
                </footer>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* "Who I am, how I learn.": three cards (Learner Profile, ATL skills, What it
 * showed) with a progress ring, a count on each quality, and one shared row
 * of moments for the quality that is tapped. One tooltip for the whole set. */
function GrowthRing({ value, total, colour }) {
  const c = 2 * Math.PI * 34;
  return (
    <svg className="growthRing" viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(21,20,73,.12)" strokeWidth="7" />
      <circle
        cx="40" cy="40" r="34" fill="none" stroke={colour} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${(c * value) / Math.max(1, total)} ${c}`} transform="rotate(-90 40 40)"
      />
      <text x="40" y="46" textAnchor="middle">{value}/{total}</text>
    </svg>
  );
}

function GrowthCards({ items = [], shownLp, lpMoments, lpAwards, token, preview, onOpen }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);
  const seen = useSeenOnce(ref);
  const [tapped, setTapped] = useState(false);

  const groups = [
    {
      id: 'lp',
      label: 'Learner Profile',
      noun: ['quality', 'qualities'],
      list: LEARNER_PROFILE,
      count: q => lpMoments(q).length + lpAwards(q).length,
      shown: q => shownLp.has(q),
      colour: '#151449'
    },
    { id: 'atl', label: 'ATL skills', noun: ['skill', 'skills'], list: ATL_SKILLS, colour: '#5b73ff' },
    { id: 'showed', label: 'What it showed', noun: ['quality', 'qualities'], list: SHOWED_SKILLS, colour: '#5b73ff' }
  ].map(group => {
    const count = group.count || (q => atlMomentsFor(items, q).length);
    const isShown = group.shown || (q => count(q) > 0);
    const on = group.list.filter(isShown);
    const momentIds = new Set(on.flatMap(q => (group.id === 'lp' ? lpMoments(q) : atlMomentsFor(items, q)).map(m => m.id)));
    return { ...group, count, on, moments: momentIds.size };
  });

  const firstTip = (groups.find(g => g.on.length) || { on: [] }).on[0];
  const autoTip = seen && !tapped ? firstTip : null;
  const openGroup = open && groups.find(g => g.list.includes(open));
  const openMoments = open ? (openGroup?.id === 'lp' ? lpMoments(open) : atlMomentsFor(items, open)) : [];
  const openAwards = open && openGroup?.id === 'lp' ? lpAwards(open) : [];

  return (
    <div className="growth" ref={ref}>
      <div className="growthHead">
        <h3>Who I am, <em>how I learn.</em></h3>
        <span>Shown in verified moments · tap a quality to see where</span>
      </div>

      <div className="growthCards">
        {groups.map(group => (
          <div key={group.id} className={`growthCard is-${group.id}`}>
            <div className="growthCardHead">
              <GrowthRing value={group.on.length} total={group.list.length} colour={group.colour} />
              <div>
                <small>{group.label}</small>
                <b>
                  {group.on.length} {group.noun[group.on.length === 1 ? 0 : 1]}
                  {group.moments ? ` · ${group.moments} moment${group.moments === 1 ? '' : 's'}` : ''}
                </b>
              </div>
            </div>
            <div className="growthPills endorseProfileGrid">
              {group.list.map(q =>
                group.on.includes(q) ? (
                  <button
                    type="button"
                    key={q}
                    className={`on ${open === q ? 'isOpen' : ''} ${autoTip === q ? 'tipAuto' : ''}`}
                    aria-expanded={open === q}
                    data-tip="Tap to view details"
                    onClick={() => {
                      setTapped(true);
                      setOpen(current => (current === q ? null : q));
                    }}
                  >
                    {q}
                    <em className="growthCount">{group.count(q)}</em>
                  </button>
                ) : (
                  <span key={q}>{q}</span>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="lpProof growthProof" key={open}>
          <div className="lpProofHead">
            <b>{open}</b>
            <span>
              {[
                openMoments.length ? `${openMoments.length} moment${openMoments.length === 1 ? '' : 's'}` : '',
                openAwards.length ? `${openAwards.length} school award${openAwards.length === 1 ? '' : 's'}` : ''
              ].filter(Boolean).join(' · ')}
              {openMoments.length ? ' · tap one to open its story' : ''}
            </span>
            <button type="button" className="lpProofClose" aria-label="Close" onClick={() => setOpen(null)}><X /></button>
          </div>
          <div className="lpProofRow">
            {openMoments.map(item => (
              <button type="button" key={item.id} className="lpProofCard" onClick={() => onOpen?.(item)}>
                <span className="lpProofThumb">
                  {item.evidence ? (
                    <SecureEvidenceImage evidence={item.evidence} token={token} preview={preview} alt="" fallback={<MomentCover item={item} />} />
                  ) : (
                    <MomentCover item={item} />
                  )}
                </span>
                <small>{domainLabel(item.domain)}{item.year ? ` · ${item.year}` : ''}</small>
                <b>{item.title}</b>
              </button>
            ))}
            {openAwards.map(award => (
              <div key={award.id} className="lpProofCard isAward">
                <span className="lpProofThumb lpProofAward"><Award /><em>{award.label}</em></span>
                <small>School award</small>
                <b>{award.title}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecognitionSection({ entries, items = [], token, preview, onOpen, panthers, awards = [], approvedQuote = null, number = '04' }) {
  const verified = entries.filter(entry => entry.verification_status === 'verified');
  const [openYear, setOpenYear] = useState(null);

  /* The newest words from a coach or teacher. */
  const voices = [];
  const coach = cvCoachQuote({ approved: approvedQuote, panthers });
  if (coach?.text) {
    voices.push({
      text: coach.text,
      who: coach.attribution || 'TBS Panthers',
      date: approvedQuote?.reviewed_at || coach.date || ''
    });
  }
  awards
    .filter(award => award.kind === 'school' && award.quote)
    .forEach(award =>
      voices.push({ text: award.quote, who: `${award.quoteBy || 'Teacher'} · ${award.label}`, date: award.date || '' })
    );
  voices.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const voice = voices[0] || null;

  const years = verified.map(entry => entry.event_date && new Date(`${entry.event_date}T00:00:00`).getFullYear()).filter(Boolean);
  const span = years.length ? (Math.min(...years) === Math.max(...years) ? `${Math.min(...years)}` : `${Math.min(...years)} – ${Math.max(...years)}`) : '';
  /* Count per year, most recent first; past ten years the oldest are
   * folded into one "Earlier" row. */
  const yearCounts = years.reduce((acc, y) => acc.set(y, (acc.get(y) || 0) + 1), new Map());
  let byYear = [...yearCounts.entries()].sort((a, b) => b[0] - a[0]);
  if (byYear.length > 10) {
    const earlier = byYear.slice(8).reduce((sum, [, c]) => sum + c, 0);
    byYear = [...byYear.slice(0, 8), ['Earlier', earlier]];
  }
  const maxYear = Math.max(1, ...byYear.map(([, c]) => c));
  const areas = [...new Set(verified.map(entry => domainLabel(entry.domain)).filter(Boolean))];
  const words = [
    ...verified.flatMap(entry => arr(entry.skills)),
    ...awards.filter(award => award.kind === 'school').map(award => `${award.title} ${award.team}`)
  ].join(' | ').toLowerCase();
  const shown = new Set(LEARNER_PROFILE.filter(lp => words.includes(lp.toLowerCase())));
  /* For each quality: the verified moments that show it, and school awards that name it. */
  const lpMoments = lp => items.filter(
    item => item.verification_status === 'verified' && arr(item.skills).some(skill => String(skill).toLowerCase() === lp.toLowerCase())
  );
  const lpAwards = lp => awards.filter(
    award => award.kind === 'school' && `${award.title} ${award.team}`.toLowerCase().includes(lp.toLowerCase())
  );
  const lastDate = verified
    .map(entry => entry.verified_at || entry.reviewed_at || entry.updated_at || '')
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <section className="recognitionSection isEndorsement" id="verified">
      <div className="sectionShell">
        <Reveal>
          <div className="sectionLabel recognitionLabel">
            <span>{number}</span><i />RECOGNISED BY TBS
          </div>
        </Reveal>

        <div className="endorseTop">
          <Reveal>
            <div className="endorseVoice">
              <h2>Achievement,<br />with a second voice.</h2>
              {voice && (
                <figure>
                  <span aria-hidden="true">“</span>
                  <blockquote>{voice.text}</blockquote>
                  <figcaption>{voice.who}</figcaption>
                </figure>
              )}
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="endorseFacts">
              <div>
                <small>Verified moments</small>
                <p>
                  <b>{String(verified.length).padStart(2, '0')}</b>
                  {span && <span>{span.includes('–') ? 'across' : 'in'} <strong>{span}</strong></span>}
                </p>
                {byYear.length > 1 && (
                  <div className="endorseYears">
                    <small>By year · most recent first</small>
                    {byYear.map(([year, count]) => (
                      <button
                        type="button"
                        className="endorseYear"
                        key={year}
                        onClick={() => setOpenYear(year)}
                        aria-label={`See the ${count} moment${count === 1 ? '' : 's'} from ${year}`}
                      >
                        <span>{year}</span>
                        <span className="endorseYearBar"><i style={{ width: `${(count / maxYear) * 100}%` }} /></span>
                        <b>{String(count).padStart(2, '0')}</b>
                        <ArrowUpRight className="endorseYearGo" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {areas.length > 0 && (
                <div>
                  <small>Areas covered</small>
                  <div className="endorseChips">
                    {areas.map(area => <span key={area}>{area}</span>)}
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <GrowthCards
            items={items}
            shownLp={shown}
            lpMoments={lpMoments}
            lpAwards={lpAwards}
            token={token}
            preview={preview}
            onOpen={onOpen}
          />
        </Reveal>

        <div className="endorseSeal">
          <ShieldCheck />
          Verified by The British School, New Delhi{lastDate ? ` · last verified ${formatDate(String(lastDate).slice(0, 10))}` : ''}
        </div>
      </div>
      {openYear && (
        <YearMoments
          year={openYear}
          years={byYear.map(([y]) => y)}
          items={items}
          token={token}
          preview={preview}
          onOpen={onOpen}
          onClose={() => setOpenYear(null)}
        />
      )}
    </section>
  );
}

/* Evidence Room — removed from the portfolio for now (it repeated the
 * photos already shown in the journey). Kept here to bring back later. */
function EvidenceRoom({ evidence, token, preview }) {
  const visible = evidence.filter(
    item => item.evidence_type === 'image' || item.evidence_type === 'video'
  );

  const [active, setActive] = useState(0);

  useEffect(() => {
    if (active >= visible.length) setActive(0);
  }, [visible.length, active]);

  if (!visible.length) return null;

  const item = visible[active];
  const isYouTube =
    item.media_provider === 'youtube' && item.youtube_video_id;

  return (
    <section className="evidenceRoom" id="evidence">
      <div className="evidenceRoomIntro">
        <Reveal>
          <div className="sectionLabel darkLabel">
            <span>05</span><i />EVIDENCE ROOM
          </div>
          <h2>The work<br />behind the story.</h2>
        </Reveal>

        <Reveal delay={100}>
          <p>
            Photographs, film and evidence that give each experience a second voice. Not
            decoration — proof of participation, practice, process and progress.
          </p>
        </Reveal>
      </div>

      <div className="evidenceStage">
        <div className="evidenceIndex">
          <span>{String(active + 1).padStart(2, '0')}</span>
          <i />
          <span>{String(visible.length).padStart(2, '0')}</span>
        </div>

        <div className="evidenceHeroMedia" key={item.id}>
          {isYouTube ? (
            <a href={item.media_url} target="_blank" rel="noreferrer">
              <img
                src={
                  item.thumbnail_url ||
                  `https://i.ytimg.com/vi/${item.youtube_video_id}/maxresdefault.jpg`
                }
                alt={item.caption || ''}
              />
              <div className="evidencePlay">
                <Play />
                <span>PLAY FILM</span>
              </div>
            </a>
          ) : (
            <SecureEvidenceImage
              evidence={item}
              token={token}
              preview={preview}
              alt={item.caption || item.file_name || ''}
            />
          )}

          <div className="evidenceMediaShade" />

          <div className="evidenceCaption">
            <small>EVIDENCE {String(active + 1).padStart(2, '0')}</small>
            <h3>{item.caption || item.file_name || 'A moment from the journey'}</h3>
          </div>
        </div>

        <div className="evidenceStrip">
          {visible.map((media, index) => (
            <button
              key={media.id}
              className={index === active ? 'active' : ''}
              onClick={() => setActive(index)}
            >
              <div>
                {media.media_provider === 'youtube' && media.youtube_video_id ? (
                  <img
                    src={
                      media.thumbnail_url ||
                      `https://i.ytimg.com/vi/${media.youtube_video_id}/hqdefault.jpg`
                    }
                    alt=""
                  />
                ) : (
                  <SecureEvidenceImage
                    evidence={media}
                    token={token}
                    preview={preview}
                    alt=""
                  />
                )}
              </div>
              <span>{String(index + 1).padStart(2, '0')}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function NextChapter({ profile, student, number = '05' }) {
  const name = profile.preferred_name || student.full_name || 'Student';
  const aspiration =
    profile.aspirations ||
    'I want to keep exploring, learning from different people and challenging myself through new experiences.';

  return (
    <section className="nextChapter" id="next">
      <div className="nextGlow" />

      <div className="sectionShell">
        <Reveal>
          <div className="sectionLabel">
            <span>{number}</span><i />MY NEXT CHAPTER
          </div>

          <div className="nextEditorial">
            <div>
              <div className="nextName">{name}</div>
              <h2>Looking ahead.</h2>
            </div>

            <blockquote className="nextStatement">“{aspiration}”</blockquote>
          </div>

          {(profile.goals || profile.closing_thought) && (
            <div className={`nextDetails${profile.goals && profile.closing_thought ? '' : ' single'}`}>
              {profile.goals && (
                <article>
                  <small>WHAT I WANT TO WORK TOWARDS</small>
                  <p>{profile.goals}</p>
                </article>
              )}

              {profile.closing_thought && (
                <article className="nextThought">
                  <small>A THOUGHT TO END ON</small>
                  <p>{profile.closing_thought}</p>
                </article>
              )}
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}

function PortfolioFooter() {
  return (
    <footer className="portfolioFooter">
      <div>
        <img
          src={PANTHERS_LOGO}
          alt="TBS Panthers"
          style={{
            width: 54,
            height: 54,
            objectFit: 'contain',
            filter: 'none'
          }}
        />
      </div>
      <p>THE BRITISH SCHOOL · NEW DELHI</p>
      <p>THRIVE · BELIEVE · SUCCEED</p>
    </footer>
  );
}

function Story({ story, token, preview, onClose }) {
  /* Option C: the photo on a card with a gold card and a glass card fanned
   * out behind it; the cards drift with the mouse. */
  const figRef = useRef(null);
  const photos = arr(story.media).length ? arr(story.media) : story.evidence ? [story.evidence] : [];
  const hasPhoto = photos.length > 0;
  const skills = arr(story.skills);
  /* Up to five skills are pinned around the photo as callouts. */
  const CALLOUTS = [['left', '14%'], ['right', '30%'], ['left', '50%'], ['right', '68%'], ['left', '84%']];
  const [at, setAt] = useState(0);
  const photo = photos[Math.min(at, photos.length - 1)];
  const step = dir => setAt(n => (n + dir + photos.length) % photos.length);

  /* Fetch every photo of this moment straight away, so switching is instant. */
  useEffect(() => {
    preloadEvidence(photos, { token, preview });
  }, [story.id]);

  useEffect(() => {
    if (photos.length < 2) return undefined;
    const onKey = event => {
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length]);

  function onMove(event) {
    const node = figRef.current;
    if (!node || !window.matchMedia('(hover: hover)').matches) return;
    const r = node.closest('.storyOverlay').getBoundingClientRect();
    node.style.setProperty('--mx', ((event.clientX - r.left) / r.width - 0.5).toFixed(3));
    node.style.setProperty('--my', ((event.clientY - r.top) / r.height - 0.5).toFixed(3));
  }

  return (
    <div className="storyOverlay" onMouseMove={onMove}>
      <div className="storyBackground">
        <div className="storyFallback" />
      </div>

      <div className="storyTop">
        <span>STUDENT JOURNEY · {story.number}</span>
        <button onClick={onClose}>CLOSE <X /></button>
      </div>

      <div className={`storyLayout${hasPhoto ? ' hasPhoto' : ''}`}>
        <div className="storyContent">
          <small>{domainLabel(story.domain)} · {formatDate(story.event_date)}</small>
          <h2>{story.title}</h2>

          <div className="storyMeta">
            {story.organisation && <span>{story.organisation}</span>}
            {story.verification_status === 'verified' && (
              <span className="verifiedMeta"><ShieldCheck /> TBS VERIFIED</span>
            )}
          </div>

          <p className="storyDescription">{story.description}</p>

          {story.reflection && (
            <blockquote>
              <small>WHAT THIS TAUGHT ME</small>
              {story.reflection}
            </blockquote>
          )}

          {!!skills.length && (
            <div className={`storySkills${hasPhoto ? ' isRow' : ''}`}>
              {(hasPhoto ? skills.slice(5) : skills).map(skill => <SkillChip key={skill} name={skill} />)}
              {hasPhoto && skills.slice(0, 5).map(skill => <SkillChip key={`m-${skill}`} name={skill} />)}
            </div>
          )}
        </div>

        {hasPhoto && (
          <figure className={`storyCards${skills.length ? '' : ' noSkills'}`} ref={figRef}>
            <div className="storyCard storyCardGold" aria-hidden="true" />
            <div className="storyCard storyCardGlass" aria-hidden="true" />
            <div className="storyCard storyCardPhoto">
              <SecureEvidenceImage
                key={photo?.id}
                evidence={photo}
                token={token}
                preview={preview}
                alt={photo?.caption || story.title}
                className="storyCardImg"
                eager
                fallback={<div className="storyCardEmpty" />}
              />
              {photos.length > 1 && (
                <>
                  <button type="button" className="storyNav prev" onClick={() => step(-1)} aria-label="Previous photo"><ChevronLeft /></button>
                  <button type="button" className="storyNav next" onClick={() => step(1)} aria-label="Next photo"><ChevronRight /></button>
                </>
              )}
            </div>
            {skills.length > 0 && <div className="storySkillsTag" aria-hidden="true">SKILLS SHOWN</div>}
            {skills.slice(0, 5).map((skill, i) => (
              <div
                key={skill}
                className={`storyCallout ${CALLOUTS[i][0]}`}
                style={{ top: CALLOUTS[i][1], animationDelay: `${1 + i * 0.14}s` }}
              >
                {CALLOUTS[i][0] === 'left' ? (
                  <><SkillChip name={skill} /><em /><u /></>
                ) : (
                  <><u /><em /><SkillChip name={skill} /></>
                )}
              </div>
            ))}
            <figcaption>
              <span>{photo?.caption && photo.caption !== story.title ? photo.caption : story.title}</span>
              <i>{photos.length > 1 ? `${String(at + 1).padStart(2, '0')} / ${String(photos.length).padStart(2, '0')}` : story.number}</i>
            </figcaption>
            {photos.length > 1 && (
              <div className="storyDots" role="tablist" aria-label="Photos">
                {photos.map((item, i) => (
                  <button
                    key={item.id || i}
                    type="button"
                    className={i === at ? 'on' : ''}
                    onClick={() => setAt(i)}
                    aria-label={`Photo ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </figure>
        )}
      </div>
    </div>
  );
}
