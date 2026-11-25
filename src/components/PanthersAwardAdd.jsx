import React, { useEffect, useMemo, useState } from 'react';
import { Award, CalendarDays, Check, Loader2, Plus, Search, Undo2, X } from 'lucide-react';
import { AwardStage, useFlash } from './Awards';
import { searchStudents } from '../journeyApi';
import {
  addCoachAward,
  addPlayerOfMonth,
  playerOfMonthExists,
  rewardTypes,
  teamsForStudent,
  withdrawAward
} from '../panthersAwardsApi';
import { friendlyError } from '../lib/friendly';
import './AwardComments.css';

/* =========================================================================
   ADD A PANTHERS AWARD · SuperAdmin and Coach
   Only the fields the Panthers tables require: student, team, award and
   date (or month). The card on the student's portfolio then uses the
   lines from "Award comments". Player of the Match comes from match
   results, so it is not added here.
   ========================================================================= */

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const OTHER = '__other__';

function monthLabel(ym) {
  const d = new Date(`${ym}-01T00:00:00`);
  return Number.isNaN(d.getTime()) ? ym : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export default function PanthersAwardAdd({ email }) {
  const [kind, setKind] = useState('reward');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState(null);
  const [teams, setTeams] = useState([]);
  const [ownTeams, setOwnTeams] = useState(true);
  const [teamId, setTeamId] = useState('');
  const [types, setTypes] = useState([]);
  const [rewardType, setRewardType] = useState('');
  const [otherType, setOtherType] = useState('');
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(thisMonth());
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState([]);
  const [flash, say] = useFlash();

  useEffect(() => {
    rewardTypes().then(list => {
      setTypes(list);
      if (list.length) setRewardType(list[0]);
      else setRewardType(OTHER);
    });
  }, []);

  /* Student search (names and year groups only). */
  useEffect(() => {
    if (student || query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    let live = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchStudents(query)
        .then(rows => live && setResults(rows))
        .catch(() => live && setResults([]))
        .finally(() => live && setSearching(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, student]);

  async function choose(row) {
    setStudent(row);
    setResults([]);
    setQuery(row.full_name);
    setTeamId('');
    try {
      const { teams: list, own } = await teamsForStudent(row.student_id);
      setTeams(list);
      setOwnTeams(own);
      if (list.length === 1) setTeamId(list[0].team_id);
    } catch (error) {
      setTeams([]);
      say(friendlyError(error), 'error');
    }
  }

  function clearStudent() {
    setStudent(null);
    setQuery('');
    setTeams([]);
    setTeamId('');
  }

  const finalType = rewardType === OTHER ? otherType.trim() : rewardType;
  const ready =
    student && teamId && (kind === 'reward' ? finalType.length > 1 && date : month);

  async function submit(event) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    try {
      const team = teams.find(t => t.team_id === teamId);
      if (kind === 'reward') {
        const row = await addCoachAward({ studentId: student.student_id, teamId, rewardType: finalType, date }, email);
        setAdded(list => [{ id: row.id, kind, name: student.full_name, what: finalType, team: team?.team_name, when: new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }, ...list]);
        if (rewardType === OTHER && !types.includes(finalType)) setTypes(list => [finalType, ...list]);
      } else {
        const monthKey = `${month}-01`;
        if (await playerOfMonthExists({ studentId: student.student_id, teamId, monthKey })) {
          say(`${student.full_name} is already Player of the Month for ${monthLabel(month)} in this team.`, 'error');
          return;
        }
        const row = await addPlayerOfMonth({ studentId: student.student_id, teamId, monthKey }, email);
        setAdded(list => [{ id: row.id, kind, name: student.full_name, what: 'Player of the Month', team: team?.team_name, when: monthLabel(month) }, ...list]);
      }
      say(`Award added for ${student.full_name}. It shows on their portfolio now.`);
      clearStudent();
    } catch (error) {
      say(friendlyError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function undo(item) {
    try {
      await withdrawAward(item.kind, item.id);
      setAdded(list => list.map(x => (x.id === item.id ? { ...x, withdrawn: true } : x)));
      say('Award withdrawn');
    } catch (error) {
      say(friendlyError(error), 'error');
    }
  }

  const typeOptions = useMemo(() => types, [types]);

  return (
    <div className="awPage acPage">
      <AwardStage
        eyebrow="Panthers awards · add"
        title={<>Add a <em>Panthers award</em></>}
        sub="Saved straight into the Panthers records, the same as awarding in the Panthers app. Player of the Match comes from match results, so it isn't added here."
        watermark="Award"
      />
      {flash}

      <div className="acTabs" role="tablist" aria-label="Award">
        <button type="button" role="tab" aria-selected={kind === 'reward'} className={`acTab is-reward ${kind === 'reward' ? 'on' : ''}`} onClick={() => setKind('reward')}>
          <i aria-hidden="true" /><span>Coach’s Award</span>
        </button>
        <button type="button" role="tab" aria-selected={kind === 'month'} className={`acTab is-month ${kind === 'month' ? 'on' : ''}`} onClick={() => setKind('month')}>
          <i aria-hidden="true" /><span>Player of the Month</span>
        </button>
      </div>

      <form className="acLines paForm" onSubmit={submit}>
        <div className="paField">
          <label htmlFor="paStudent">Student</label>
          <div className="paSearch">
            <Search aria-hidden="true" />
            <input
              id="paStudent"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                if (student) setStudent(null);
              }}
              placeholder="Type a student's name"
              autoComplete="off"
            />
            {searching && <Loader2 className="paSpin" aria-hidden="true" />}
            {student && (
              <button type="button" className="acIcon" aria-label="Change student" onClick={clearStudent}><X /></button>
            )}
          </div>
          {results.length > 0 && (
            <ul className="paResults" role="listbox" aria-label="Students">
              {results.map(row => (
                <li key={row.student_id}>
                  <button type="button" role="option" aria-selected="false" onClick={() => choose(row)}>
                    <b>{row.full_name}</b>
                    <small>{row.year_group}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {student && <small className="paPicked"><Check /> {student.full_name}{student.year_group ? ` · ${student.year_group}` : ''}</small>}
        </div>

        <div className="paField">
          <label htmlFor="paTeam">Team</label>
          <select id="paTeam" value={teamId} onChange={e => setTeamId(e.target.value)} disabled={!student}>
            <option value="">{student ? 'Choose a team' : 'Choose a student first'}</option>
            {teams.map(t => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}
          </select>
          {student && !ownTeams && <small className="paNote">Not in a team yet, so all active teams are listed.</small>}
        </div>

        {kind === 'reward' ? (
          <div className="paRow">
            <div className="paField">
              <label htmlFor="paType">Award</label>
              <select id="paType" value={rewardType} onChange={e => setRewardType(e.target.value)}>
                {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                <option value={OTHER}>Other…</option>
              </select>
              {rewardType === OTHER && (
                <input
                  value={otherType}
                  onChange={e => setOtherType(e.target.value)}
                  placeholder="e.g. Best Effort"
                  maxLength={60}
                  aria-label="Award name"
                />
              )}
            </div>
            <div className="paField">
              <label htmlFor="paDate">Date</label>
              <input id="paDate" type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="paField paNarrow">
            <label htmlFor="paMonth"><CalendarDays aria-hidden="true" /> Month</label>
            <input id="paMonth" type="month" value={month} max={thisMonth()} onChange={e => setMonth(e.target.value)} />
          </div>
        )}

        <div className="acRowActions">
          <button type="submit" className="acMain" disabled={!ready || busy}>
            {busy ? <Loader2 className="paSpin" /> : <Plus />} Add award
          </button>
        </div>
      </form>

      {added.length > 0 && (
        <section className="acLines paForm">
          <header className="acLinesHead">
            <div>
              <small>This session</small>
              <h2>Added</h2>
            </div>
          </header>
          <ol className="acList">
            {added.map(item => (
              <li key={item.id} className={item.withdrawn ? 'isHidden' : ''}>
                <p className="paAdded">
                  <Award aria-hidden="true" />
                  <span><span><b>{item.name}</b> · {item.what}</span><small>{item.team} · {item.when}</small></span>
                </p>
                <div className="acRowActions">
                  {item.withdrawn ? (
                    <span className="acTag">Withdrawn</span>
                  ) : (
                    <button type="button" className="acGhost" onClick={() => undo(item)}><Undo2 /> Undo</button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
