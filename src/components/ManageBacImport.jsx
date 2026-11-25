/* =========================================================================
   IMPORT FROM MANAGEBAC (v33)
   Upload the CAS "By Activity" PDF → review each activity (Previous / Next,
   Include on/off) → save the included ones as private drafts. Students then
   open each draft, add photos and publish. Students, coaches, Admin and
   SuperAdmin can all do this for the students they can manage.
   ========================================================================= */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, ChevronLeft, ChevronRight, FileText, ShieldCheck, X } from 'lucide-react';
import { addExternalEvidence, saveEntry, uploadJourneyMedia } from '../journeyApi';
import { MAX_SKILLS, SKILL_GROUPS } from '../lib/skills';
import { importKey, momentFromActivity, namesMatch, parseCasReport, readPdfLines } from '../lib/managebac';
import { WordCount } from './JourneyGuide';
import './JourneyGuide.css';
import './ManageBacImport.css';

const fmtMonth = iso => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '');
const fmtRange = (a, b) => (b && b !== a ? `${fmtMonth(a)} – ${fmtMonth(b)}` : fmtMonth(a));
const QUICK_SKILLS = [...SKILL_GROUPS[0].skills, 'Reflective', 'Communicator', 'Risk-taker', 'Caring'];

/* Keys of moments this student already has, so a newer export skips them. */
function existingKeys(entries = []) {
  const keys = new Set();
  entries.forEach(e => {
    if (e.active === false) return;
    if (e.import_key) keys.add(e.import_key);
    keys.add(importKey(e.title, e.event_date));
  });
  return keys;
}

export default function ManageBacImport({ student, staff, admin, entries, options, onClose, onDone }) {
  const [stage, setStage] = useState('upload'); // upload · reading · summary · review · saving
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [items, setItems] = useState([]); // { activity, values, include, extra: Set }
  const [skipped, setSkipped] = useState([]);
  const [confirmOther, setConfirmOther] = useState(false);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0, note: '' });

  async function read(picked) {
    if (!picked) return;
    setError('');
    if (!/pdf$/i.test(picked.type) && !/\.pdf$/i.test(picked.name)) {
      setError('Please choose the PDF you downloaded from ManageBac.');
      return;
    }
    setFile(picked);
    setStage('reading');
    try {
      const { lines } = await readPdfLines(picked);
      const parsed = parseCasReport(lines);
      if (!parsed.activities.length) {
        setError('This doesn’t look like a ManageBac CAS report. Export “CAS Reflections”, grouped By Activity, as a PDF and try again.');
        setStage('upload');
        return;
      }
      const have = existingKeys(entries);
      const fresh = parsed.activities.filter(a => !have.has(a.key));
      setSkipped(parsed.activities.filter(a => have.has(a.key)).map(a => a.title));
      setItems(fresh.map(a => ({ activity: a, values: momentFromActivity(a), include: true, added: [] })));
      setReport(parsed);
      setConfirmOther(false);
      setIndex(0);
      setStage('summary');
    } catch (e) {
      console.error('ManageBac read failed', e);
      setError('We couldn’t read this PDF. Make sure it’s the ManageBac CAS report (not a scan or photo) and try again.');
      setStage('upload');
    }
  }

  const sameStudent = report ? namesMatch(report.studentName, student.full_name) : true;
  const included = items.filter(i => i.include).length;
  const item = items[index];

  const patch = (i, change) =>
    setItems(list => list.map((it, n) => (n === i ? { ...it, ...change, values: { ...it.values, ...(change.values || {}) } } : it)));
  const setValue = (key, value) => patch(index, { values: { [key]: value } });

  async function save() {
    const chosen = items.filter(i => i.include);
    if (!chosen.length) return;
    setStage('saving');
    setProgress({ done: 0, total: chosen.length, note: '' });
    const saved = [];
    let fallback = false;
    try {
      for (const it of chosen) {
        const base = {
          ...it.values,
          skills: (it.values.skills || []).slice(0, MAX_SKILLS),
          end_date: it.values.end_date || null,
          source_type: admin ? 'staff' : 'student',
          verification_status: 'draft',
          visibility: 'private',
          is_public: false,
          is_featured: false,
          active: true
        };
        let row;
        if (!fallback) {
          try {
            row = await saveEntry(student.student_id, { ...base, import_source: 'managebac', import_key: it.activity.key });
          } catch (e) {
            /* Before migration 20261011 the import columns don't exist yet. */
            if (/import_(source|key)|column/i.test(e?.message || '')) fallback = true;
            else throw e;
          }
        }
        if (!row) {
          try {
            row = await saveEntry(student.student_id, base);
          } catch (e) {
            if (/end_date/i.test(e?.message || '')) {
              const { end_date, ...rest } = base;
              row = await saveEntry(student.student_id, rest);
            } else throw e;
          }
        }
        saved.push(row);
        setProgress(p => ({ ...p, done: p.done + 1 }));
      }

      /* The ManageBac report becomes the evidence on every draft: uploaded
       * to Drive once, then linked from the others. */
      let note = '';
      if (file && saved.length) {
        try {
          setProgress(p => ({ ...p, note: 'Attaching your ManageBac report…' }));
          const up = await uploadJourneyMedia({
            studentId: student.student_id,
            entryId: saved[0].id,
            file,
            caption: 'ManageBac CAS report',
            bucket: 'evidence',
            mediaRole: 'evidence'
          });
          const link = up?.evidence?.media_url || up?.evidence?.drive_file_url;
          if (link) {
            for (const row of saved.slice(1)) {
              await addExternalEvidence({
                studentId: student.student_id,
                entryId: row.id,
                url: link,
                caption: 'ManageBac CAS report',
                provider: 'google_drive',
                mediaRole: 'evidence'
              }).catch(() => {});
            }
          }
        } catch (e) {
          console.error('Attaching the ManageBac report failed', e);
          note = ' The drafts are saved, but the ManageBac report couldn’t be attached; add a photo or file to each before publishing.';
        }
      }
      onDone(saved.length, note);
    } catch (e) {
      console.error('Saving drafts failed', e);
      setError(
        `${saved.length ? `${saved.length} draft${saved.length === 1 ? ' was' : 's were'} saved, then this stopped: ` : ''}${e?.message || 'Saving failed.'}`
      );
      setStage('review');
    }
  }

  return (
    <div className="builder mbImport">
      <header className="builderTop">
        <span>IMPORT FROM MANAGEBAC · {student.full_name}{stage === 'review' ? ' · REVIEW' : ''}</span>
        <div className="builderTopActions">
          <button onClick={onClose} disabled={stage === 'saving'}>CLOSE <X /></button>
        </div>
      </header>

      {stage === 'review' && (
        <div className="mbProgress" aria-hidden="true">
          {items.map((it, n) => (
            <i key={it.activity.key} className={n === index ? 'now' : n < index ? 'seen' : ''} />
          ))}
        </div>
      )}

      {(stage === 'upload' || stage === 'reading' || stage === 'summary') && (
        <main className="builderBody mbStart">
          <section className="mbStartMain">
            <small>CAS · done once, used twice</small>
            <h1>Bring your CAS in from ManageBac.</h1>
            <p>
              Upload your CAS report and each activity becomes a Journey Moment, already filled in. Check them one by one,
              save them as drafts, then add photos and publish when you’re ready.
            </p>

            <label className={`mbDrop ${stage === 'reading' ? 'isBusy' : ''}`}>
              <span className="mbDropIcon"><FileText /></span>
              <b>{stage === 'reading' ? 'Reading your report…' : file ? file.name : 'Drop your ManageBac CAS report here'}</b>
              <span>{stage === 'reading' ? 'This takes a few seconds.' : <>or <u>choose the PDF</u> · the “CAS Reflections · By Activity” report</>}</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={stage === 'reading'}
                onChange={event => {
                  read(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            {error && <p className="jgMissing mbError" role="alert">{error}</p>}

            <div className="mbHow">
              <strong>How to get the PDF from ManageBac</strong>
              <ol>
                <li>Open <b>CAS</b> in ManageBac and go to your <b>Reflections</b>.</li>
                <li>Export as <b>PDF</b>, grouped <b>By Activity</b>.</li>
                <li>Save the file, then drop it in the box above.</li>
              </ol>
            </div>
          </section>

          <aside className="mbStartSide">
            {stage === 'summary' && report ? (
              <div className="mbSummary">
                <span className="mbKicker">Your report</span>
                <div className="mbFound">
                  <span className="mbTick"><Check /></span>
                  <div>
                    <b>{report.activities.length} activities found</b>
                    <span>{fmtRange(report.activities.map(a => a.start).sort()[0], report.activities.map(a => a.end).sort().slice(-1)[0])}</span>
                  </div>
                </div>
                <ul>
                  <li><b>{items.length}</b> new, ready to review</li>
                  {skipped.length > 0 && <li><b>{skipped.length}</b> already in this portfolio, skipped</li>}
                </ul>

                {!sameStudent && (
                  <div className="mbNameWarn" role="alert">
                    <AlertTriangle />
                    <div>
                      <b>This report belongs to {report.studentName || 'another student'}.</b>
                      {staff ? (
                        <>
                          <span>You are importing into {student.full_name}’s portfolio.</span>
                          <label>
                            <input type="checkbox" checked={confirmOther} onChange={e => setConfirmOther(e.target.checked)} />
                            I understand — import anyway
                          </label>
                        </>
                      ) : (
                        <span>You can only import your own CAS report. Download yours from ManageBac and try again.</span>
                      )}
                    </div>
                  </div>
                )}

                {items.length ? (
                  <button
                    type="button"
                    className="jgBtn gold"
                    disabled={!sameStudent && !(staff && confirmOther)}
                    onClick={() => setStage('review')}
                  >
                    Review activities <ArrowRight />
                  </button>
                ) : (
                  <p className="mbAllDone">Everything in this report is already in the portfolio.</p>
                )}
              </div>
            ) : (
              <div className="mbSummary">
                <span className="mbKicker">After you upload</span>
                <p>We list every activity in the report. Ones already in the portfolio are skipped, so you can upload a newer report any time.</p>
              </div>
            )}
            <div className="mbSafe">
              <ShieldCheck />
              <span>
                Nothing goes public from the import. Every activity becomes a private draft until it’s published. Supervisor
                names and emails are never shown.
              </span>
            </div>
          </aside>
        </main>
      )}

      {stage === 'review' && item && (
        <main className="builderBody mbReview">
          <nav className="mbList" aria-label="Activities in this report">
            <div className="mbListHead">
              <strong>{items.length} activities</strong>
              <span>{included} included</span>
            </div>
            {items.map((it, n) => (
              <div key={it.activity.key} className={`mbListItem ${n === index ? 'on' : ''} ${it.include ? '' : 'isOut'}`}>
                <button
                  type="button"
                  className="mbCheck"
                  aria-pressed={it.include}
                  aria-label={`${it.include ? 'Leave out' : 'Include'} ${it.values.title}`}
                  onClick={() => patch(n, { include: !it.include })}
                >
                  {it.include && <Check />}
                </button>
                <button type="button" className="mbListName" onClick={() => setIndex(n)} aria-current={n === index}>
                  <b>{it.values.title || 'Untitled'}</b>
                  <small>{fmtRange(it.values.event_date, it.values.end_date)}{it.include ? '' : ' · left out'}</small>
                </button>
              </div>
            ))}
            {skipped.length > 0 && (
              <p className="mbSkipped">
                Already in the portfolio, skipped: {skipped.map((t, i) => <i key={t}>{i ? ', ' : ''}{t}</i>)}.
              </p>
            )}
          </nav>

          <section className="mbForm">
            <div className="mbFormHead">
              <div>
                <small>Activity {index + 1} of {items.length} · from ManageBac</small>
                <h1>{item.values.title || 'Untitled activity'}</h1>
              </div>
              <label className="mbInclude">
                <input type="checkbox" checked={item.include} onChange={e => patch(index, { include: e.target.checked })} />
                <span className="mbSwitch" aria-hidden="true"><i /></span>
                Include in the portfolio
              </label>
            </div>

            <fieldset className="mbCard" disabled={!item.include}>
              <label>
                <span>Title</span>
                <input value={item.values.title} onChange={e => setValue('title', e.target.value)} />
              </label>

              <div className="mbRow3">
                <label>
                  <span>Type</span>
                  <select value={item.values.entry_type} onChange={e => setValue('entry_type', e.target.value)}>
                    {options.types.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Area <em className="mbBadge gold">guessed · check</em></span>
                  <select className="isGuess" value={item.values.domain} onChange={e => setValue('domain', e.target.value)}>
                    {options.areas.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <div className="mbDates">
                  <label>
                    <span>Start</span>
                    <input type="date" value={item.values.event_date || ''} onChange={e => setValue('event_date', e.target.value)} />
                  </label>
                  <label>
                    <span>End</span>
                    <input type="date" value={item.values.end_date || ''} onChange={e => setValue('end_date', e.target.value || null)} />
                  </label>
                </div>
              </div>

              <div className="mbRow2">
                <label>
                  <span>Where or with whom? <em className="mbBadge">not in ManageBac</em></span>
                  <input
                    className="isEmpty"
                    value={item.values.organisation}
                    placeholder="e.g. Flips Gymnastics Academy, TBS Battle of the Bands, Goonj (NGO)"
                    onChange={e => setValue('organisation', e.target.value)}
                  />
                </label>
                <fieldset className="levelPick mbLevel">
                  <legend>Level</legend>
                  <div>
                    {options.levels.map(o => (
                      <button
                        type="button"
                        key={o}
                        className={item.values.level === o ? 'on' : ''}
                        aria-pressed={item.values.level === o}
                        onClick={() => setValue('level', o)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>

              <label>
                <span>Story <i>· from the Activity Description</i></span>
                <textarea rows={3} value={item.values.description} onChange={e => setValue('description', e.target.value)} />
              </label>

              <label>
                <span>Reflection <i>· the latest ManageBac reflection</i></span>
                <textarea rows={6} value={item.values.reflection} onChange={e => setValue('reflection', e.target.value)} />
              </label>
              <div className="jgUnder"><span /><WordCount text={item.values.reflection} min={50} max={100} /></div>

              {item.activity.reflections.length > 1 && (
                <details className="mbMore">
                  <summary>
                    {item.activity.reflections.length - 1} more reflection{item.activity.reflections.length === 2 ? '' : 's'} from
                    ManageBac <i>· tap Add to include one</i>
                  </summary>
                  {item.activity.reflections.slice(1).map((r, n) => {
                    const used = item.added.includes(n);
                    return (
                      <div key={n} className="mbMoreItem">
                        <span>
                          <b>{r.date ? new Date(`${r.date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</b>
                          {r.text}
                        </span>
                        <button
                          type="button"
                          disabled={used}
                          onClick={() =>
                            patch(index, {
                              added: [...item.added, n],
                              values: { reflection: `${item.values.reflection.trim()}\n\n${r.text}`.trim() }
                            })
                          }
                        >
                          {used ? 'Added' : '+ Add'}
                        </button>
                      </div>
                    );
                  })}
                </details>
              )}

              <div className="mbSkills">
                <span>Skills <i>· from the CAS learning outcomes, up to {MAX_SKILLS}</i></span>
                <div>
                  {[...new Set([...(item.values.skills || []), ...QUICK_SKILLS])].map(s => {
                    const on = (item.values.skills || []).includes(s);
                    const full = (item.values.skills || []).length >= MAX_SKILLS;
                    return (
                      <button
                        type="button"
                        key={s}
                        className={on ? 'on' : ''}
                        aria-pressed={on}
                        disabled={!on && full}
                        onClick={() => setValue('skills', on ? item.values.skills.filter(x => x !== s) : [...(item.values.skills || []), s])}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mbEvidence">
                <FileText />
                <span><b>Evidence:</b> the ManageBac report is attached to this draft. Add photos when you finish it.</span>
              </div>
            </fieldset>
            {error && <p className="jgMissing" role="alert">{error}</p>}
          </section>
        </main>
      )}

      {stage === 'review' && (
        <div className="mbBar">
          <div className="mbBarNav">
            <button type="button" className="mbNavBtn" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>
              <ChevronLeft /> Previous
            </button>
            <span className="mbCount">{index + 1} <small>of {items.length}</small></span>
            <button type="button" className="mbNavBtn light" disabled={index === items.length - 1} onClick={() => setIndex(i => i + 1)}>
              Next <ChevronRight />
            </button>
          </div>
          <div className="mbBarSave">
            <span>{included} of {items.length} included</span>
            <button type="button" className="jgBtn gold" disabled={!included} onClick={save}>
              Save {included} as draft{included === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {stage === 'saving' && (
        <main className="builderBody mbSaving">
          <div className="mbSavingCard" role="status">
            <div className="spinner" />
            <h2>Saving drafts… {progress.done} of {progress.total}</h2>
            <p>{progress.note || 'Please keep this window open.'}</p>
          </div>
        </main>
      )}
    </div>
  );
}
