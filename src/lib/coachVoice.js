/* Coach voice for the CV.
 *
 *  1. An approved quote (student_coach_quotes, status = approved) always wins.
 *  2. Otherwise the coach's own latest words from Panthers records
 *     (a reward comment or a progress-report comment shared with families).
 *  3. Otherwise the app drafts a quote from the Panthers record. A draft is
 *     never printed: it waits in the Approvals tab until a coach approves
 *     (or edits) it.
 */

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

const sportOf = team =>
  clean(team?.activity) ||
  clean(String(team?.team_name || '').replace(/^Panthers\s+/i, '').split(/\s+U\d+/i)[0]) ||
  'Panthers';

const teamShort = team => clean(String(team?.team_name || '').replace(/^Panthers\s+/i, '')) || 'the Panthers';

const firstName = name => clean(name).split(' ')[0] || 'This student';

function listJoin(items) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

const monthYear = value => {
  const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

/* The coach's own most recent words about this student, or null. */
export function latestCoachWords(panthers) {
  const found = [];
  (panthers?.teams || []).forEach(team => {
    (team.matchAwards || []).forEach(award => {
      if (clean(award.comment)) found.push({ text: clean(award.comment), date: award.date, team });
    });
    (team.rewards || []).forEach(row => {
      const text = clean(row.reward_comment || row.comment);
      if (text) found.push({ text, date: row.date, team });
    });
    (team.reports || []).forEach(row => {
      if (row.visible_to_parent_student === false) return;
      const text = clean(row.coach_comment);
      if (text) found.push({ text, date: row.report_date, team });
    });
  });

  found.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const best = found[0];
  if (!best) return null;
  return {
    text: best.text,
    date: best.date || '',
    team_id: best.team.team_id || null,
    attribution: `${sportOf(best.team)} coach · TBS Panthers`,
    origin: 'coach_record'
  };
}

/* What prints on the CV: approved quote → coach's own words → nothing. */
export function cvCoachQuote({ approved, panthers }) {
  if (approved?.quote_text) {
    const team = (panthers?.teams || []).find(item => item.team_id === approved.team_id);
    const who = clean(approved.reviewed_by_name);
    return {
      text: clean(approved.quote_text),
      attribution: [who, team ? `${sportOf(team)} · TBS Panthers` : 'TBS Panthers'].filter(Boolean).join(' · '),
      origin: 'approved'
    };
  }
  return latestCoachWords(panthers);
}

/* The app's draft, written the way a coach would say it, using only facts
 * from the Panthers record. Returns null when there is nothing to say. */
export function draftCoachQuote({ panthers, studentName }) {
  const teams = (panthers?.teams || []).filter(
    team => team.knownAttendance || team.selectedGames || team.playerOfMatch || (team.playerOfMonth || []).length
  );
  if (!teams.length) return null;

  const name = firstName(studentName);
  const main = [...teams].sort(
    (a, b) =>
      (b.playerOfMatch || 0) + (b.playerOfMonth?.length || 0) * 2 + (b.selectedGames || 0) -
      ((a.playerOfMatch || 0) + (a.playerOfMonth?.length || 0) * 2 + (a.selectedGames || 0))
  )[0];

  const sentences = [];
  const sports = [...new Set(teams.map(sportOf))];

  if (sports.length > 1) {
    sentences.push(
      `${name} has represented the Panthers in ${listJoin(sports.map(s => s.toLowerCase()))}, and gives the same commitment to every team.`
    );
  } else {
    sentences.push(`${name} has been a committed member of our ${teamShort(main)} side.`);
  }

  const att = main.attendancePercent;
  const facts = [];
  if (att != null && att >= 85 && main.knownAttendance >= 5) facts.push(`trains with real consistency (${att}% of ${main.attendanceScope || 'sessions'})`);
  if (main.selectedGames >= 2) facts.push(`has earned selection for ${main.selectedGames} match squads`);

  const months = (main.playerOfMonth || []).map(row => monthYear(row.month_key)).filter(Boolean);
  const awards = [];
  if (months.length) awards.push(`Player of the Month for ${months[0]}`);
  if (main.playerOfMatch === 1) {
    const award = main.matchAwards?.[0];
    awards.push(`Player of the Match${award?.opponent ? ` against ${award.opponent}` : ''}`);
  } else if (main.playerOfMatch > 1) {
    awards.push(`Player of the Match ${main.playerOfMatch} times`);
  }

  if (facts.length) sentences.push(`${name} ${listJoin(facts)}.`);
  if (awards.length) sentences.push(`Recognition as ${listJoin(awards)} was well deserved.`);

  const note = [
    `Drafted from ${teamShort(main)} records`,
    att != null ? `attendance ${att}%` : '',
    main.selectedGames ? `${main.selectedGames} squads` : '',
    main.playerOfMatch ? `${main.playerOfMatch} Player of the Match` : '',
    months.length ? `${months.length} Player of the Month` : ''
  ]
    .filter(Boolean)
    .join(' · ');

  return { quote_text: sentences.join(' '), team_id: main.team_id || null, source_note: note };
}
