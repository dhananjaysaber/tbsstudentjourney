/* =========================================================================
   AWARD REPORTS (v33)
   Overview · Class report · Student report · Subjects & areas · Coverage ·
   Export. Every view can be printed / saved as PDF ("Generate report") and
   exported to Excel (CSV). Admission numbers are never shown or exported.
   ========================================================================= */
import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Download,
  FileText,
  GraduationCap,
  Printer,
  Search,
  Sparkles,
  Star,
  Target,
  UserRound,
  Users
} from 'lucide-react';
import { friendlyError } from '../lib/friendly';
import {
  TERMS,
  academicYearOptions,
  currentAcademicYear,
  downloadCsv,
  loadAwards,
  loadMyClasses,
  loadNominations,
  loadRoster,
  nominationLabel
} from '../awardsApi';
import {
  AwardStage,
  AwardsLoading,
  Empty,
  Medal,
  NotReady,
  Select,
  byYearThenClass,
  fmtDay,
  initialsOf,
  useFlash
} from './Awards';
import './Awards.css';
import './AwardReports.css';

const TABS = [
  ['overview', 'Overview', BarChart3],
  ['class', 'Class report', Users],
  ['student', 'Student report', UserRound],
  ['subjects', 'Subjects & areas', BookOpen],
  ['coverage', 'Coverage', Target],
  ['export', 'Export', Download]
];

const COUNTED = ['approved', 'submitted'];
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const safe = s => String(s || '').replace(/[^\w-]+/g, '');
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/* Load class rosters (names only) for a set of classes, a few at a time. */
async function loadRosters(classNames) {
  const out = new Map();
  const queue = [...classNames];
  async function worker() {
    while (queue.length) {
      const c = queue.shift();
      try {
        out.set(c, await loadRoster(c));
      } catch {
        out.set(c, []);
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}

export default function AwardReports() {
  const [awards, setAwards] = useState(undefined);
  const [classes, setClasses] = useState([]);
  const [tab, setTab] = useState('overview');
  const [filters, setFilters] = useState({ awardId: '', yearGroup: '', className: '', term: '', academicYear: currentAcademicYear() });
  const [noms, setNoms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rosters, setRosters] = useState(new Map());
  const [studentId, setStudentId] = useState('');
  const [flash, say] = useFlash();

  useEffect(() => {
    Promise.all([loadAwards({ includeArchived: true }), loadMyClasses().catch(() => [])])
      .then(([list, cls]) => {
        setAwards(list);
        setClasses(cls);
        const years = [...new Set(cls.map(c => c.year_group))];
        if (years.length === 1) setFilters(f => ({ ...f, yearGroup: years[0] }));
      })
      .catch(error => {
        say(friendlyError(error), 'error');
        setAwards([]);
      });
  }, []);

  useEffect(() => {
    if (!awards) return;
    setLoading(true);
    loadNominations({
      awardId: filters.awardId || undefined,
      term: filters.term || undefined,
      academicYear: filters.academicYear || undefined,
      yearGroup: filters.yearGroup || undefined,
      className: filters.className || undefined,
      status: COUNTED
    })
      .then(setNoms)
      .catch(error => say(friendlyError(error), 'error'))
      .finally(() => setLoading(false));
  }, [awards, filters]);

  /* Classes in scope (for rosters, coverage, cohort size). */
  const scopeClasses = useMemo(
    () =>
      classes
        .filter(c => (!filters.yearGroup || c.year_group === filters.yearGroup) && (!filters.className || c.class_name === filters.className))
        .sort((a, b) => byYearThenClass(a.class_name, b.class_name)),
    [classes, filters.yearGroup, filters.className]
  );

  /* Rosters are needed for class, student and coverage views. */
  useEffect(() => {
    if (!['class', 'student', 'coverage', 'export'].includes(tab)) return;
    const missing = scopeClasses.map(c => c.class_name).filter(c => !rosters.has(c));
    if (!missing.length) return;
    loadRosters(missing).then(got => setRosters(prev => new Map([...prev, ...got])));
  }, [tab, scopeClasses]);

  if (awards === undefined) return <AwardsLoading />;
  if (awards === null) return <NotReady />;

  const awardById = new Map(awards.map(a => [a.id, a]));
  const years = [...new Set(classes.map(c => c.year_group))].filter(Boolean).sort(byYearThenClass);
  const classOpts = classes
    .filter(c => !filters.yearGroup || c.year_group === filters.yearGroup)
    .map(c => c.class_name)
    .sort(byYearThenClass);
  const cohort = scopeClasses.reduce((sum, c) => sum + Number(c.students || 0), 0);
  const scopeLabel = filters.className || filters.yearGroup || 'All years';
  const periodLabel = `${filters.term || 'All terms'} · ${filters.academicYear || 'All years'}`;
  const awardLabel = filters.awardId ? awardById.get(filters.awardId)?.name : 'All awards';
  const setF = patch => setFilters(f => ({ ...f, ...patch }));
  const ctx = { noms, awardById, scopeClasses, rosters, cohort, scopeLabel, periodLabel, awardLabel, filters, setF, setTab, studentId, setStudentId, say };

  const tabTitle = {
    overview: <>{scopeLabel} — <em>{noms.length} award{noms.length === 1 ? '' : 's'}</em></>,
    class: filters.className ? <>Class report · <em>{filters.className}</em></> : <>Choose a <em>class</em></>,
    student: <>Student <em>award record</em></>,
    subjects: <>Subjects &amp; <em>areas</em></>,
    coverage: <>Who has been <em>recognised</em>?</>,
    export: <>Export &amp; <em>generate</em></>
  }[tab];

  return (
    <div className="awPage awReports">
      <AwardStage
        eyebrow={`Award reports · ${awardLabel} · ${periodLabel}`}
        title={tabTitle}
        watermark="Reports"
        actions={
          <button className="awBtn ghost" onClick={() => window.print()} title="Print, or choose “Save as PDF”">
            <Printer /> Generate report
          </button>
        }
      >
        <Select label="Award" value={filters.awardId} onChange={v => setF({ awardId: v })} options={awards.map(a => ({ value: a.id, label: a.name }))} placeholder="All awards" />
        <Select label="Year group" value={filters.yearGroup} onChange={v => setF({ yearGroup: v, className: '' })} options={years} placeholder="All years" gold />
        <Select label="Class" value={filters.className} onChange={v => setF({ className: v })} options={classOpts} placeholder="All classes" />
        <Select label="Term" value={filters.term} onChange={v => setF({ term: v })} options={TERMS} placeholder="All terms" />
        <Select label="Academic year" value={filters.academicYear} onChange={v => setF({ academicYear: v })} options={academicYearOptions()} placeholder="All years" />
      </AwardStage>
      {flash}

      <nav className="awTabs" aria-label="Report type">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <Icon /> {label}
          </button>
        ))}
      </nav>

      <PrintHead title={TABS.find(t => t[0] === tab)[1]} ctx={ctx} />

      {loading ? (
        <AwardsLoading />
      ) : tab === 'overview' ? (
        <Overview {...ctx} />
      ) : tab === 'class' ? (
        <ClassReport {...ctx} />
      ) : tab === 'student' ? (
        <StudentReport {...ctx} />
      ) : tab === 'subjects' ? (
        <SubjectsReport {...ctx} />
      ) : tab === 'coverage' ? (
        <CoverageReport {...ctx} />
      ) : (
        <ExportCentre {...ctx} />
      )}
    </div>
  );
}

/* Header that appears only on paper / PDF. */
function PrintHead({ title, ctx }) {
  return (
    <div className="awPrintHead">
      <div>
        <small>The British School, New Delhi · School awards</small>
        <h1>{title}</h1>
        <p>
          {ctx.scopeLabel} · {ctx.awardLabel} · {ctx.periodLabel}
        </p>
      </div>
      <span>Generated {today()}</span>
    </div>
  );
}

function Kpis({ items }) {
  return (
    <div className="awKpis">
      {items.map(([value, label, hint]) => (
        <div key={label} className="awPanel awKpi">
          <b>{value}</b>
          <span>{label}</span>
          {hint && <small>{hint}</small>}
        </div>
      ))}
    </div>
  );
}

function Bars({ title, rows, tone = 0 }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <section className="awPanel awPadded">
      <div className="awKicker">{title}</div>
      {!rows.length && <p className="awMuted">Nothing yet.</p>}
      <div className="awBars">
        {rows.map(([name, count], i) => (
          <div key={name}>
            <div className="awBarHead"><span>{name}</span><b>{count}</b></div>
            <div className="awBar"><i className={`tone${(i + tone) % 3}`} style={{ width: `${(count / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

const countBy = (list, fn) => {
  const m = new Map();
  list.forEach(x => {
    const k = fn(x);
    if (k) m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

function byStudent(noms) {
  const m = new Map();
  noms.forEach(n => {
    if (!m.has(n.student_id)) m.set(n.student_id, { id: n.student_id, name: n.student_name, cls: n.class_name, year: n.year_group, items: [] });
    m.get(n.student_id).items.push(n);
  });
  return [...m.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */
function Overview({ noms, awardById, scopeClasses, cohort, setTab, setStudentId, setF }) {
  const people = byStudent(noms);
  const withComment = noms.filter(n => n.reason).length;
  const teachers = new Set(noms.map(n => n.entered_by_email || n.entered_by_name).filter(Boolean)).size;
  const byAward = countBy(noms, n => awardById.get(n.award_id)?.name || 'Award');
  const byClass = countBy(noms, n => n.class_name).sort((a, b) => byYearThenClass(a[0], b[0]));
  const byTerm = countBy(noms, n => n.term);
  const byCat = countBy(noms, n => n.category).slice(0, 8);
  const recent = [...noms].filter(n => n.reason).sort((a, b) => String(b.entered_at).localeCompare(String(a.entered_at))).slice(0, 6);
  const maxClass = Math.max(1, ...byClass.map(([, n]) => n));

  if (!noms.length) return <Empty title="No awards match these filters" text="Try another term, year group or award." />;

  return (
    <>
      <Kpis
        items={[
          [noms.length, 'Awards given'],
          [people.length, 'Students recognised', cohort ? `of ${cohort}` : ''],
          [cohort ? `${pct(people.length, cohort)}%` : '—', 'Coverage', 'students with at least one award'],
          [people.length ? (noms.length / people.length).toFixed(1) : '0', 'Awards per student', 'among those recognised'],
          [`${pct(withComment, noms.length)}%`, 'With a teacher comment'],
          [teachers, 'Staff contributing']
        ]}
      />
      <div className="awRepGrid3">
        <Bars title="By award" rows={byAward} />
        <Bars title="Top subjects & areas" rows={byCat} tone={1} />
        {byTerm.length > 1 ? <Bars title="By term" rows={byTerm} tone={2} /> : (
          <section className="awPanel awPadded">
            <div className="awKicker">By class</div>
            <div className="awCols">
              {byClass.map(([c, count]) => (
                <button key={c} type="button" className="awColBtn" title={`Open the ${c} report`} onClick={() => { setF({ className: c }); setTab('class'); }}>
                  <i style={{ height: `${Math.max(6, (count / maxClass) * 80)}px` }} className={count === maxClass ? 'top' : ''} />
                  <small>{c}</small>
                  <b>{count}</b>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="awRepGrid2">
        <section className="awPanel">
          <div className="awPanelHeadRow"><div className="awKicker">Most recognised students</div></div>
          <table className="awRepTable">
            <thead><tr><th>#</th><th>Student</th><th>Class</th><th>Awards</th><th className="r">Total</th></tr></thead>
            <tbody>
              {people.slice(0, 10).map((p, i) => (
                <tr key={p.id} className="awClickRow" onClick={() => { setStudentId(p.id); setTab('student'); }}>
                  <td className="awMuted">{i + 1}</td>
                  <td><div className="awWho"><span className="awAv">{initialsOf(p.name)}</span><span>{p.name}</span></div></td>
                  <td className="awMuted">{p.cls}</td>
                  <td>
                    <div className="awTagCloud">
                      {countBy(p.items, n => awardById.get(n.award_id)?.name).map(([a, c]) => (
                        <span key={a} className="awMini">{a}{c > 1 ? ` ×${c}` : ''}</span>
                      ))}
                    </div>
                  </td>
                  <td className="r">{i < 3 ? <Medal on>{p.items.length}</Medal> : <b className="awTotal">{p.items.length}</b>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="awPanel awPadded">
          <div className="awKicker">In teachers’ words</div>
          {!recent.length && <p className="awMuted">No comments yet.</p>}
          <div className="awQuotes">
            {recent.map(n => (
              <figure key={n.id}>
                <blockquote>“{n.reason}”</blockquote>
                <figcaption>
                  <b>{n.student_name}</b> · {awardById.get(n.award_id)?.name}{n.category ? ` · ${n.category}` : ''}
                  <small>{n.entered_by_name || 'Teacher'} · {fmtDay(n.entered_at)}</small>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>
      {scopeClasses.length > 1 && (
        <p className="awMuted awNoPrint">Tip: click a class bar or a student to open their own report.</p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Class report                                                        */
/* ------------------------------------------------------------------ */
function ClassReport({ noms, awardById, scopeClasses, rosters, filters, setF, setTab, setStudentId }) {
  if (!filters.className) {
    return (
      <div className="awClassPick">
        {scopeClasses.map(c => {
          const n = noms.filter(x => x.class_name === c.class_name);
          const kids = new Set(n.map(x => x.student_id)).size;
          return (
            <button key={c.class_name} type="button" className="awPanel awClassCard" onClick={() => setF({ className: c.class_name })}>
              <b>{c.class_name}</b>
              <span>{n.length} award{n.length === 1 ? '' : 's'}</span>
              <small>{kids} of {c.students} students · {pct(kids, c.students)}%</small>
              <i style={{ width: `${pct(kids, c.students)}%` }} />
            </button>
          );
        })}
        {!scopeClasses.length && <Empty title="No classes" text="No classes are linked to you." />}
      </div>
    );
  }

  const roster = rosters.get(filters.className);
  if (!roster) return <AwardsLoading />;
  const classNoms = noms.filter(n => n.class_name === filters.className);
  const awardIds = [...new Set(classNoms.map(n => n.award_id))].sort(
    (a, b) => classNoms.filter(n => n.award_id === b).length - classNoms.filter(n => n.award_id === a).length
  );
  const recognised = new Set(classNoms.map(n => n.student_id));
  const notYet = roster.filter(s => !recognised.has(s.student_id));
  const rows = roster
    .map(s => ({ s, items: classNoms.filter(n => n.student_id === s.student_id) }))
    .sort((a, b) => b.items.length - a.items.length || a.s.full_name.localeCompare(b.s.full_name));
  const cats = countBy(classNoms, n => n.category);

  function exportClass() {
    downloadCsv(`TBS-class-report-${safe(filters.className)}-${safe(filters.academicYear)}.csv`, [
      ['Student', 'Class', ...awardIds.map(id => awardById.get(id)?.name || 'Award'), 'Total', 'Details'],
      ...rows.map(({ s, items }) => [
        s.full_name,
        filters.className,
        ...awardIds.map(id => items.filter(n => n.award_id === id).length || ''),
        items.length,
        items.map(n => `${awardById.get(n.award_id)?.name}: ${nominationLabel(n, awardById.get(n.award_id))}`).join('; ')
      ])
    ]);
  }

  return (
    <>
      <div className="awRepActions awNoPrint">
        <button className="awBtn line sm" onClick={() => setF({ className: '' })}>← All classes</button>
        <button className="awBtn line sm" onClick={exportClass}><Download /> Export class (Excel)</button>
        <button className="awBtn navy sm" onClick={() => window.print()}><Printer /> Generate class report</button>
      </div>
      <Kpis
        items={[
          [classNoms.length, 'Awards in the class'],
          [`${recognised.size} / ${roster.length}`, 'Students recognised'],
          [`${pct(recognised.size, roster.length)}%`, 'Coverage'],
          [notYet.length, 'Not yet recognised']
        ]}
      />
      <section className="awPanel">
        <div className="awGridWrap awRepWrap">
          <table className="awRepTable awRepMatrix">
            <thead>
              <tr>
                <th>Student</th>
                {awardIds.map(id => <th key={id} className="c">{awardById.get(id)?.name}</th>)}
                <th className="c">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, items }) => (
                <tr key={s.student_id} className={`awClickRow ${items.length ? '' : 'isZero'}`} onClick={() => { setStudentId(s.student_id); setTab('student'); }}>
                  <td><div className="awWho"><span className="awAv">{initialsOf(s.full_name)}</span><span>{s.full_name}</span></div></td>
                  {awardIds.map(id => {
                    const mine = items.filter(n => n.award_id === id);
                    return (
                      <td key={id} className="c" title={mine.map(n => nominationLabel(n, awardById.get(id))).join(', ')}>
                        {mine.length ? (
                          <span className="awCellTags">{mine.map(n => <span key={n.id} className="awMini">{nominationLabel(n, awardById.get(id))}</span>)}</span>
                        ) : (
                          <span className="awPh">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="c">{items.length ? <b className="awTotal">{items.length}</b> : <span className="awZero">Not yet</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><b>Class total</b></td>
                {awardIds.map(id => <td key={id} className="c"><b>{classNoms.filter(n => n.award_id === id).length}</b></td>)}
                <td className="c"><b>{classNoms.length}</b></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <div className="awRepGrid2">
        <Bars title={`Subjects & areas in ${filters.className}`} rows={cats} tone={1} />
        <section className="awPanel awPadded">
          <div className="awKicker">Not yet recognised · {notYet.length}</div>
          {notYet.length ? (
            <div className="awTagCloud awNotYet">{notYet.map(s => <span key={s.student_id}>{s.full_name}</span>)}</div>
          ) : (
            <p className="awMuted">Every student in {filters.className} has at least one award. 🎉</p>
          )}
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Student report (all years, whatever the filters)                   */
/* ------------------------------------------------------------------ */
function StudentReport({ awardById, scopeClasses, rosters, filters, setF, studentId, setStudentId }) {
  const [query, setQuery] = useState('');
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);

  const everyone = useMemo(() => {
    const list = [];
    scopeClasses.forEach(c => (rosters.get(c.class_name) || []).forEach(s => list.push({ ...s, class_name: s.class_name || c.class_name })));
    return list.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [scopeClasses, rosters]);
  const student = everyone.find(s => s.student_id === studentId) || null;

  useEffect(() => {
    if (!studentId) return setRecord(null);
    setLoading(true);
    loadNominations({ studentId, status: COUNTED })
      .then(setRecord)
      .catch(() => setRecord([]))
      .finally(() => setLoading(false));
  }, [studentId]);

  const matches = query.trim().length >= 2 ? everyone.filter(s => s.full_name.toLowerCase().includes(query.toLowerCase())).slice(0, 12) : [];

  const picker = (
    <div className="awStudentPick awNoPrint">
      <div className="awSearchBox">
        <Search />
        <input placeholder={`Search a student${filters.className ? ` in ${filters.className}` : filters.yearGroup ? ` in ${filters.yearGroup}` : ''}…`} value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      {matches.length > 0 && (
        <div className="awSearchResults">
          {matches.map(s => (
            <button key={s.student_id} type="button" onClick={() => { setStudentId(s.student_id); setQuery(''); }}>
              <span className="awAv">{initialsOf(s.full_name)}</span>
              <span>{s.full_name}<small>{s.class_name}</small></span>
            </button>
          ))}
        </div>
      )}
      {!filters.className && !filters.yearGroup && everyone.length === 0 && (
        <p className="awMuted">Choose a year group or class above to search its students.</p>
      )}
    </div>
  );

  if (!studentId) {
    return (
      <>
        {picker}
        <Empty icon={<UserRound />} title="Choose a student" text="Search by name to see every award they have received at TBS, ready to print or save as PDF." />
      </>
    );
  }
  if (loading || !record) return <>{picker}<AwardsLoading /></>;

  const name = student?.full_name || record[0]?.student_name || 'Student';
  const cls = student?.class_name || record[0]?.class_name || '';
  const byYear = new Map();
  [...record]
    .sort((a, b) => String(b.academic_year).localeCompare(String(a.academic_year)) || String(a.term).localeCompare(String(b.term)))
    .forEach(n => {
      const key = n.academic_year;
      if (!byYear.has(key)) byYear.set(key, []);
      byYear.get(key).push(n);
    });
  const thisYear = record.filter(n => n.academic_year === currentAcademicYear()).length;
  const topCat = countBy(record, n => n.category)[0];
  const comments = record.filter(n => n.reason).length;

  function exportStudent() {
    downloadCsv(`TBS-award-record-${safe(name)}.csv`, [
      ['Student', 'Class', 'Academic year', 'Term', 'Award', 'Award / subject', 'Term focus', 'Teacher comment', 'Given by', 'Date'],
      ...record.map(n => [name, n.class_name, n.academic_year, n.term, awardById.get(n.award_id)?.name || '', nominationLabel(n, awardById.get(n.award_id)), n.focus || '', n.reason || '', n.entered_by_name || '', fmtDay(n.entered_at, true)])
    ]);
  }

  return (
    <>
      {picker}
      <div className="awRepActions awNoPrint">
        <button className="awBtn line sm" onClick={() => setStudentId('')}>← Choose another student</button>
        <button className="awBtn line sm" onClick={exportStudent}><Download /> Export record (Excel)</button>
        <button className="awBtn navy sm" onClick={() => window.print()}><Printer /> Generate award record (PDF)</button>
      </div>
      <section className="awPanel awRecord">
        <header className="awRecordHead">
          <span className="awAv big">{initialsOf(name)}</span>
          <div>
            <small>School award record · all years</small>
            <h2>{name}</h2>
            <p>{cls}{student?.year_group ? ` · ${student.year_group}` : ''}</p>
          </div>
          <div className="awRecordStats">
            <div><b>{record.length}</b><span>awards at TBS</span></div>
            <div><b>{thisYear}</b><span>this year</span></div>
            {topCat && <div><b>{topCat[0]}</b><span>most recognised</span></div>}
            <div><b>{comments}</b><span>teacher comments</span></div>
          </div>
        </header>
        {!record.length ? (
          <Empty icon={<Star />} title="No awards yet" text={`${name} hasn’t received a school award yet.`} />
        ) : (
          [...byYear.entries()].map(([yr, list]) => (
            <div key={yr} className="awRecordYear">
              <h3>{yr} <small>{list.length} award{list.length === 1 ? '' : 's'}</small></h3>
              <div className="awRecordList">
                {list.map(n => (
                  <article key={n.id}>
                    <Medal on><Star /></Medal>
                    <div>
                      <b>{awardById.get(n.award_id)?.name || 'School award'}</b>
                      <span>{nominationLabel(n, awardById.get(n.award_id))}</span>
                      <small>
                        {n.term}{n.focus ? ` · focus: ${n.focus}` : ''} · {n.entered_by_name || 'Teacher'} · {fmtDay(n.entered_at, true)}
                      </small>
                      {n.reason && <em>“{n.reason}”</em>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))
        )}
        <footer className="awRecordFoot">Verified by The British School, New Delhi · Generated {today()}</footer>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Subjects & areas                                                    */
/* ------------------------------------------------------------------ */
function SubjectsReport({ noms, awardById, scopeClasses }) {
  const withCat = noms.filter(n => n.category);
  if (!withCat.length) return <Empty icon={<BookOpen />} title="No subject or area awards here" text="Subject Awards, Going for Gold and Learner Profile awards appear here." />;
  const cats = countBy(withCat, n => n.category).map(([c]) => c);
  const cls = [...new Set(withCat.map(n => n.class_name))].sort(byYearThenClass);
  const options = [...new Set(withCat.map(n => n.option_label))].filter(o => o !== 'Awarded');
  const cell = (c, k) => withCat.filter(n => n.category === c && n.class_name === k).length;
  const max = Math.max(1, ...cats.flatMap(c => cls.map(k => cell(c, k))));

  function exportSubjects() {
    downloadCsv('TBS-awards-by-subject.csv', [
      ['Subject / area', ...options, ...cls, 'Total'],
      ...cats.map(c => [c, ...options.map(o => withCat.filter(n => n.category === c && n.option_label === o).length), ...cls.map(k => cell(c, k)), withCat.filter(n => n.category === c).length])
    ]);
  }

  return (
    <>
      <div className="awRepActions awNoPrint">
        <button className="awBtn line sm" onClick={exportSubjects}><Download /> Export (Excel)</button>
        <button className="awBtn navy sm" onClick={() => window.print()}><Printer /> Generate report</button>
      </div>
      <section className="awPanel">
        <div className="awGridWrap awRepWrap">
          <table className="awRepTable awHeat">
            <thead>
              <tr>
                <th>Subject / area</th>
                {options.map(o => <th key={o} className="c">{o}</th>)}
                {cls.map(k => <th key={k} className="c">{k}</th>)}
                <th className="c">Total</th>
              </tr>
            </thead>
            <tbody>
              {cats.map(c => (
                <tr key={c}>
                  <td><b>{c}</b></td>
                  {options.map(o => <td key={o} className="c">{withCat.filter(n => n.category === c && n.option_label === o).length || ''}</td>)}
                  {cls.map(k => {
                    const v = cell(c, k);
                    return (
                      <td key={k} className="c" style={v ? { background: `rgba(238, 192, 88, ${0.12 + (v / max) * 0.6})` } : undefined}>
                        {v || ''}
                      </td>
                    );
                  })}
                  <td className="c"><b>{withCat.filter(n => n.category === c).length}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="awMuted">Darker gold = more awards. Gaps show subjects or classes that may need a look.</p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Coverage — who hasn't been recognised yet                           */
/* ------------------------------------------------------------------ */
function CoverageReport({ noms, scopeClasses, rosters }) {
  const ready = scopeClasses.every(c => rosters.has(c.class_name));
  if (!ready) return <AwardsLoading />;
  const counts = new Map();
  noms.forEach(n => counts.set(n.student_id, (counts.get(n.student_id) || 0) + 1));
  const all = scopeClasses.flatMap(c => (rosters.get(c.class_name) || []).map(s => ({ ...s, class_name: c.class_name, n: counts.get(s.student_id) || 0 })));
  const buckets = [0, 1, 2, 3, 4].map(k => [k === 4 ? '4+' : String(k), all.filter(s => (k === 4 ? s.n >= 4 : s.n === k)).length]);
  const maxB = Math.max(1, ...buckets.map(([, v]) => v));
  const zero = all.filter(s => !s.n);

  function exportNotYet() {
    downloadCsv('TBS-not-yet-recognised.csv', [['Student', 'Class'], ...zero.map(s => [s.full_name, s.class_name])]);
  }

  return (
    <>
      <div className="awRepActions awNoPrint">
        <button className="awBtn line sm" onClick={exportNotYet} disabled={!zero.length}><Download /> Export “not yet” list</button>
        <button className="awBtn navy sm" onClick={() => window.print()}><Printer /> Generate report</button>
      </div>
      <Kpis
        items={[
          [all.length, 'Students in scope'],
          [all.length - zero.length, 'Recognised'],
          [zero.length, 'Not yet recognised'],
          [`${pct(all.length - zero.length, all.length)}%`, 'Coverage']
        ]}
      />
      <div className="awRepGrid2">
        <section className="awPanel awPadded">
          <div className="awKicker">Awards per student</div>
          <div className="awHisto">
            {buckets.map(([label, v]) => (
              <div key={label}>
                <i style={{ height: `${Math.max(4, (v / maxB) * 120)}px` }} className={label === '0' ? 'zero' : ''} />
                <b>{v}</b>
                <small>{label} award{label === '1' ? '' : 's'}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="awPanel">
          <table className="awRepTable">
            <thead><tr><th>Class</th><th className="c">Students</th><th className="c">Recognised</th><th>Coverage</th></tr></thead>
            <tbody>
              {scopeClasses.map(c => {
                const kids = all.filter(s => s.class_name === c.class_name);
                const yes = kids.filter(s => s.n).length;
                return (
                  <tr key={c.class_name}>
                    <td><b>{c.class_name}</b></td>
                    <td className="c">{kids.length}</td>
                    <td className="c">{yes}</td>
                    <td><div className="awCover"><i style={{ width: `${pct(yes, kids.length)}%` }} /><span>{pct(yes, kids.length)}%</span></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
      <section className="awPanel awPadded">
        <div className="awKicker">Not yet recognised · {zero.length}</div>
        {!zero.length && <p className="awMuted">Everyone in scope has at least one award.</p>}
        {scopeClasses.map(c => {
          const z = zero.filter(s => s.class_name === c.class_name);
          if (!z.length) return null;
          return (
            <div key={c.class_name} className="awNotYetRow">
              <b>{c.class_name}</b>
              <div className="awTagCloud awNotYet">{z.map(s => <span key={s.student_id}>{s.full_name}</span>)}</div>
            </div>
          );
        })}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Export centre                                                       */
/* ------------------------------------------------------------------ */
function ExportCentre({ noms, awardById, scopeClasses, rosters, scopeLabel, filters, say }) {
  const tag = `${safe(scopeLabel)}-${safe(filters.academicYear || 'all')}`;
  const people = byStudent(noms);
  const awardIds = [...new Set(noms.map(n => n.award_id))];

  const exportsList = [
    [FileText, 'Every award (detailed)', 'One row per award: student, class, award, subject, term, focus, comment, teacher, date.', () =>
      downloadCsv(`TBS-awards-detailed-${tag}.csv`, [
        ['Student', 'Year', 'Class', 'Award', 'Option', 'Subject / area', 'Term', 'Term focus', 'Academic year', 'Teacher comment', 'Given by', 'Date'],
        ...noms.map(n => [n.student_name, n.year_group, n.class_name, awardById.get(n.award_id)?.name || '', n.option_label, n.category, n.term, n.focus || '', n.academic_year, n.reason, n.entered_by_name || '', fmtDay(n.entered_at, true)])
      ])],
    [UserRound, 'Per-student summary', 'One row per student with a count for each award and a total.', () =>
      downloadCsv(`TBS-awards-by-student-${tag}.csv`, [
        ['Student', 'Class', ...awardIds.map(id => awardById.get(id)?.name || 'Award'), 'Total'],
        ...people.map(p => [p.name, p.cls, ...awardIds.map(id => p.items.filter(n => n.award_id === id).length), p.items.length])
      ])],
    [Users, 'Class summary', 'One row per class: students, recognised, coverage and awards per award type.', () => {
      const rows = scopeClasses.map(c => {
        const n = noms.filter(x => x.class_name === c.class_name);
        const kids = new Set(n.map(x => x.student_id)).size;
        return [c.class_name, c.year_group, c.students, kids, `${pct(kids, c.students)}%`, ...awardIds.map(id => n.filter(x => x.award_id === id).length), n.length];
      });
      downloadCsv(`TBS-awards-by-class-${tag}.csv`, [['Class', 'Year', 'Students', 'Recognised', 'Coverage', ...awardIds.map(id => awardById.get(id)?.name || 'Award'), 'Total'], ...rows]);
    }],
    [BookOpen, 'Subject & area summary', 'Counts per subject / area and option (Gold, Prize, Certificate, Effort…).', () => {
      const withCat = noms.filter(n => n.category);
      const options = [...new Set(withCat.map(n => n.option_label))];
      const cats = countBy(withCat, n => n.category).map(([c]) => c);
      downloadCsv(`TBS-awards-by-subject-${tag}.csv`, [['Subject / area', ...options, 'Total'], ...cats.map(c => [c, ...options.map(o => withCat.filter(n => n.category === c && n.option_label === o).length), withCat.filter(n => n.category === c).length])]);
    }],
    [Target, 'Not yet recognised', 'Students in scope with no award yet, by class.', () => {
      const missing = scopeClasses.filter(c => !rosters.has(c.class_name));
      if (missing.length) return say('Class lists are still loading — try again in a moment.', 'error');
      const got = new Set(noms.map(n => n.student_id));
      const rows = scopeClasses.flatMap(c => (rosters.get(c.class_name) || []).filter(s => !got.has(s.student_id)).map(s => [s.full_name, c.class_name]));
      downloadCsv(`TBS-not-yet-recognised-${tag}.csv`, [['Student', 'Class'], ...rows]);
    }],
    [GraduationCap, 'Comments only', 'Every teacher comment with the student and award — useful for reports and assemblies.', () =>
      downloadCsv(`TBS-award-comments-${tag}.csv`, [
        ['Student', 'Class', 'Award', 'Subject / area', 'Term', 'Comment', 'Teacher'],
        ...noms.filter(n => n.reason).map(n => [n.student_name, n.class_name, awardById.get(n.award_id)?.name || '', n.category, n.term, n.reason, n.entered_by_name || ''])
      ])]
  ];

  return (
    <>
      <p className="awLead">
        Exports follow the filters above ({scopeLabel}, {filters.term || 'all terms'}, {filters.academicYear || 'all years'}). Files open in Excel or Google Sheets.
        <b> Admission numbers are never included.</b>
      </p>
      <div className="awExportGrid">
        {exportsList.map(([Icon, title, text, run]) => (
          <section key={title} className="awPanel awExportCard">
            <span className="awExportIcon"><Icon /></span>
            <h3>{title}</h3>
            <p>{text}</p>
            <button className="awBtn navy sm" onClick={run} disabled={!noms.length && title !== 'Not yet recognised'}>
              <Download /> Download
            </button>
          </section>
        ))}
        <section className="awPanel awExportCard isPrint">
          <span className="awExportIcon"><Sparkles /></span>
          <h3>Generate a printed report</h3>
          <p>Open any report tab — Overview, Class, Student, Subjects or Coverage — and press “Generate report”. Choose “Save as PDF” to keep a copy.</p>
          <button className="awBtn gold sm" onClick={() => window.print()}><Printer /> Print this page</button>
        </section>
      </div>
    </>
  );
}
