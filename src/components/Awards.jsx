/* =========================================================================
   AWARD BUILDER (v33)
   · AwardSetup      SuperAdmin / Admin create and manage any school award
   · AwardEntry      Key Stage Office, Heads of Year, Tutors and Teachers tick a class
   · AwardReports    compact summary + detailed per-student table, export
   · AwardStaff      Staff & classes: who enters awards for which classes
   · AwardLists      Lists & settings: subjects, curriculum areas, Learner Profile
   (No approval step: submitted awards count straight away; Heads of Year
    and the Key Stage Office can edit or remove them afterwards.)
   ========================================================================= */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Trash2,
  Award as AwardIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Loader2,
  Lock,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Send,
  Star,
  UserPlus,
  Upload,
  X
} from 'lucide-react';
import { friendlyError } from '../lib/friendly';
import {
  ACTIONS,
  AWARD_ROLES,
  CHOOSE_FIRST,
  TERMS,
  academicYearOptions,
  awardState,
  currentAcademicYear,
  daysLeft,
  deleteNomination,
  downloadCsv,
  loadAllClasses,
  loadAwardStaff,
  loadAwards,
  countAwardNominations,
  deleteAward,
  loadClassNominations,
  loadLists,
  loadMyClasses,
  loadNominations,
  loadRoster,
  nominationLabel,
  reviewNominations,
  publishNominations,
  saveAward,
  saveAwardStaff,
  saveClassSheet,
  sheetKey,
  saveListItem,
  importAwardStaff,
  parseCsv,
  roleCovers
} from '../awardsApi';
import './Awards.css';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const STATE_LABEL = { open: 'Open', soon: 'Opens', closed: 'Closed', draft: 'Draft', archived: 'Archived' };

export function fmtDay(iso, withYear = false) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
}

export function initialsOf(name) {
  return (
    String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(p => p[0].toUpperCase())
      .join('') || '•'
  );
}

export function byYearThenClass(a, b) {
  const num = s => {
    const t = String(s || '');
    if (/^nursery/i.test(t)) return -2;
    if (/^(reception|R[A-Z]$)/i.test(t)) return -1;
    return Number(t.match(/\d+/)?.[0] ?? 999);
  };
  return num(a) - num(b) || String(a).localeCompare(String(b));
}

/* A year_group without a section, e.g. "Year 6" (not yet "Yr6C"). */
const isNoClass = c => /^(year\s*\d+|reception|nursery)$/i.test(String(c || '').trim());

export function StatePill({ award, dark = false }) {
  const state = awardState(award);
  const text = state === 'soon' ? `Opens ${fmtDay(award.opens_on)}` : STATE_LABEL[state];
  return <span className={`awPill is-${state} ${dark ? 'onDark' : ''}`}>{text}</span>;
}

export function AwardStage({ eyebrow, title, sub, actions, watermark, children }) {
  return (
    <header className="awStage">
      {watermark && <div className="awWatermark" aria-hidden="true">{watermark}</div>}
      <div className="awStageRow">
        <div>
          {eyebrow && <div className="awEyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="awStageActions">{actions}</div>}
      </div>
      {children && <div className="awCtrls">{children}</div>}
    </header>
  );
}

export function Select({ label, value, onChange, options, gold = false, disabled = false, placeholder }) {
  return (
    <label className={`awSel ${gold ? 'isGold' : ''} ${disabled ? 'isDisabled' : ''}`}>
      <small>{label}</small>
      <span>
        <select value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map(opt =>
            typeof opt === 'string' ? (
              <option key={opt} value={opt}>{opt}</option>
            ) : (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            )
          )}
        </select>
        <ChevronDown aria-hidden="true" />
      </span>
    </label>
  );
}

export function Medal({ on, onClick, label, disabled, children }) {
  return (
    <button
      type="button"
      className={`awMedal ${on ? 'on' : ''}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
    >
      {children ?? <Star />}
    </button>
  );
}

function Chip({ on, onClick, children, disabled }) {
  return (
    <button type="button" className={`awChip ${on ? 'on' : ''}`} onClick={onClick} disabled={disabled} aria-pressed={on}>
      {children}
    </button>
  );
}

function Toggle({ on, onChange, label, hint }) {
  return (
    <button type="button" className={`awToggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <i aria-hidden="true" />
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
    </button>
  );
}

export function Empty({ icon = <AwardIcon />, title, text, action }) {
  return (
    <div className="awEmpty">
      <span>{icon}</span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function NotReady() {
  return (
    <Empty
      icon={<Lock />}
      title="Awards are almost ready"
      text="The Award Builder needs a one-time database update (migration 20261006). Once it has run, this page comes to life."
    />
  );
}

export function useFlash() {
  const [flash, setFlash] = useState(null);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);
  const node = flash ? (
    <div className={`awFlash is-${flash.kind}`} role="status" onClick={() => setFlash(null)}>
      {flash.kind === 'ok' ? <CheckCircle2 /> : <X />}
      {flash.text}
    </div>
  ) : null;
  return [node, (text, kind = 'ok') => setFlash({ text, kind })];
}

const DEFAULT_PERMISSIONS = {
  key_stage_office: { view: true, enter: true, edit: true, delete: true },
  head_of_year: { view: true, enter: true, edit: true, delete: false },
  class_teacher: { view: true, enter: true, edit: false, delete: false },
  subject_teacher: { view: true, enter: true, edit: false, delete: false }
};

const SCOPE_TEXT = {
  key_stage_office: 'Their key stage years',
  head_of_year: 'Own year group',
  class_teacher: 'Own form class',
  subject_teacher: 'Classes they teach · own subjects'
};

const OPTION_PRESETS = [
  ['Single award', ['Awarded']],
  ['Gold', ['Gold']],
  ['Prize · Certificate · Effort', ['Prize', 'Certificate', 'Effort']]
];

function blankAward() {
  const today = new Date();
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const close = new Date(today.getTime() + 14 * 86400000);
  return {
    name: '',
    description: '',
    choose_first: 'none',
    options: ['Awarded'],
    terms: ['Term 1'],
    academic_year: currentAcademicYear(),
    opens_on: iso(today),
    closes_on: iso(close),
    year_groups: [],
    permissions: DEFAULT_PERMISSIONS,
    show_on_portfolio: true,
    needs_approval: false,
    limit_count: null,
    limit_scope: 'class',
    term_focus: {},
    status: 'draft'
  };
}

/* ------------------------------------------------------------------ */
/* 1 · Award setup                                                     */
/* ------------------------------------------------------------------ */

export function AwardSetup({ account }) {
  const [awards, setAwards] = useState(undefined);
  const [lpList, setLpList] = useState([]);
  const [years, setYears] = useState([]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [optionText, setOptionText] = useState('');
  const [flash, say] = useFlash();

  const [showArchived, setShowArchived] = useState(false);

  async function refresh(selectId) {
    try {
      const list = await loadAwards({ includeArchived: true });
      setAwards(list);
      if (list && selectId) setDraft(list.find(a => a.id === selectId) || null);
      else if (list && !draft) {
        const first = list.find(a => a.status !== 'archived');
        setDraft(first ? { ...first } : blankAward());
      }
    } catch (error) {
      say(friendlyError(error), 'error');
      setAwards([]);
    }
  }

  useEffect(() => {
    refresh();
    loadAllClasses()
      .then(rows => setYears([...new Set(rows.map(r => r.year_group).filter(Boolean))].sort(byYearThenClass)))
      .catch(() => setYears([]));
    loadLists()
      .then(rows => setLpList(rows.filter(r => r.kind === 'learner_profile' && r.active).map(r => r.label)))
      .catch(() => setLpList([]));
  }, []);

  if (awards === undefined) return <AwardsLoading />;
  if (awards === null) return <NotReady />;

  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const toggleIn = (key, value) =>
    set({ [key]: draft[key].includes(value) ? draft[key].filter(v => v !== value) : [...draft[key], value] });

  async function persist(patch = {}, message = 'Award saved.') {
    setBusy(true);
    try {
      const saved = await saveAward({ ...draft, ...patch }, account.email);
      say(message);
      await refresh(saved.id);
    } catch (error) {
      say(friendlyError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  const liveAwards = awards.filter(a => a.status !== 'archived');
  const archivedAwards = awards.filter(a => a.status === 'archived');

  async function removeForever() {
    if (!draft?.id) return;
    let count = 0;
    try {
      count = await countAwardNominations(draft.id);
    } catch {
      count = 0;
    }
    const typed = window.prompt(
      `Delete “${draft.name}” permanently?\n\n` +
        (count
          ? `This also deletes ${count} award${count === 1 ? '' : 's'} already given to students, and removes them from portfolios and CVs. `
          : 'No students have received this award yet. ') +
        'This cannot be undone.\n\nTo confirm, type DELETE:'
    );
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== 'DELETE') {
      say('Not deleted. Type DELETE to confirm.', 'error');
      return;
    }
    setBusy(true);
    try {
      await deleteAward(draft.id);
      say(`“${draft.name}” deleted.`);
      setDraft(null);
      await refresh();
    } catch (error) {
      say(friendlyError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  const state = draft ? awardState(draft) : 'draft';
  const progress = (() => {
    if (!draft?.opens_on || !draft?.closes_on) return 0;
    const a = new Date(draft.opens_on).getTime();
    const b = new Date(draft.closes_on).getTime() + 86400000;
    return Math.max(0, Math.min(1, (Date.now() - a) / Math.max(1, b - a)));
  })();
  const yearChoices = [
    ...new Set([
      ...(years.length ? years : ['Year 3', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13']),
      ...(draft?.year_groups || [])
    ])
  ].sort(byYearThenClass);

  return (
    <div className="awPage">
      <AwardStage
        eyebrow={`School awards · ${currentAcademicYear()}`}
        title={<>Every award, <em>one place.</em></>}
        sub="Set an award up once. Staff can only enter nominations while it is open."
        watermark="Awards"
        actions={
          <button className="awBtn gold" onClick={() => setDraft(blankAward())}>
            <Plus /> New award
          </button>
        }
      />
      {flash}

      <div className="awSetupGrid">
        <aside className="awPanel awList">
          <div className="awKicker">{liveAwards.length} award{liveAwards.length === 1 ? '' : 's'}</div>
          {!liveAwards.length && <p className="awMuted">No awards yet. Start with “New award”.</p>}
          {[...liveAwards, ...(showArchived ? archivedAwards : [])].map(a => (
            <button
              key={a.id}
              className={`awListItem ${draft?.id === a.id ? 'on' : ''}`}
              onClick={() => setDraft({ ...a })}
            >
              <span>
                <b>{a.name}</b>
                <small>
                  {a.terms.join(' · ')} · {a.choose_first === 'none' ? a.options.join(' / ') : CHOOSE_FIRST[a.choose_first].toLowerCase()}
                </small>
              </span>
              <StatePill award={a} dark={draft?.id === a.id} />
            </button>
          ))}
          {archivedAwards.length > 0 && (
            <button type="button" className="awArchivedToggle" onClick={() => setShowArchived(v => !v)}>
              <Archive /> {showArchived ? 'Hide' : 'Show'} archived ({archivedAwards.length})
            </button>
          )}
        </aside>

        {draft && (
          <section className="awPanel awEditor">
            <div className="awEditorHead">
              <div>
                <div className="awKicker">{draft.id ? 'Editing' : 'New award'}</div>
                <input
                  className="awTitleInput"
                  value={draft.name}
                  placeholder="Award name, e.g. Going for Gold"
                  onChange={e => set({ name: e.target.value })}
                />
              </div>
              <div className="awEditorState">
                <StatePill award={draft} />
                {state === 'open' && <small>Closes {fmtDay(draft.closes_on)} · {daysLeft(draft)} days left</small>}
              </div>
            </div>

            <textarea
              className="awDesc"
              rows={2}
              value={draft.description}
              placeholder="Short description (optional) — shown to staff when they enter awards."
              onChange={e => set({ description: e.target.value })}
            />

            <div className="awWindow">
              <label>
                <small>Opens</small>
                <input type="date" value={draft.opens_on || ''} onChange={e => set({ opens_on: e.target.value })} />
              </label>
              <div className="awWindowBar" aria-hidden="true">
                <i style={{ width: `${progress * 100}%` }} />
                {progress > 0 && progress < 1 && <b style={{ left: `${progress * 100}%` }} />}
              </div>
              <label>
                <small>Closes</small>
                <input type="date" value={draft.closes_on || ''} onChange={e => set({ closes_on: e.target.value })} />
              </label>
            </div>

            <div className="awFormGrid">
              <div>
                <div className="awKicker">Staff choose first</div>
                <div className="awSelectPlain">
                  <select value={draft.choose_first} onChange={e => set({ choose_first: e.target.value })}>
                    {Object.entries(CHOOSE_FIRST).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <ChevronDown />
                </div>
              </div>
              <div>
                <div className="awKicker">Academic year</div>
                <div className="awSelectPlain">
                  <select value={draft.academic_year} onChange={e => set({ academic_year: e.target.value })}>
                    {academicYearOptions().map(y => (
                      <option key={y}>{y}</option>
                    ))}
                  </select>
                  <ChevronDown />
                </div>
              </div>
              <div>
                <div className="awKicker">Terms</div>
                <div className="awChips">
                  {TERMS.map(t => (
                    <Chip key={t} on={draft.terms.includes(t)} onClick={() => toggleIn('terms', t)}>{t}</Chip>
                  ))}
                </div>
              </div>
            </div>

            <div className="awBlock">
              <div className="awKicker">Learner Profile focus for each term · optional</div>
              <div className="awFocusGrid">
                {(draft.terms || []).map(t => (
                  <label key={t} className="awFocusPick">
                    <small>{t}</small>
                    <span className="awSelectPlain">
                      <select
                        value={draft.term_focus?.[t] || ''}
                        onChange={e => set({ term_focus: { ...(draft.term_focus || {}), [t]: e.target.value } })}
                      >
                        <option value="">No focus</option>
                        {lpList.map(l => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                      <ChevronDown />
                    </span>
                  </label>
                ))}
              </div>
              <p className="awHint">Shown to teachers when they enter awards for that term, and with the award on the portfolio and CV (e.g. Going for Gold · Term 1 focus: Inquirers).</p>
            </div>

            <div className="awBlock">
              <div className="awKicker">Options per student</div>
              <div className="awChips">
                {draft.options.map(o => (
                  <span key={o} className="awChip on removable">
                    {o}
                    <button
                      type="button"
                      aria-label={`Remove ${o}`}
                      onClick={() => set({ options: draft.options.filter(x => x !== o) })}
                    >
                      <X />
                    </button>
                  </span>
                ))}
                <form
                  className="awAddOption"
                  onSubmit={e => {
                    e.preventDefault();
                    const v = optionText.trim();
                    if (v && !draft.options.includes(v)) set({ options: [...draft.options, v] });
                    setOptionText('');
                  }}
                >
                  <input value={optionText} onChange={e => setOptionText(e.target.value)} placeholder="Add option" />
                  <button type="submit" aria-label="Add option"><Plus /></button>
                </form>
              </div>
              <div className="awPresets">
                Quick set:
                {OPTION_PRESETS.map(([label, opts]) => (
                  <button key={label} type="button" onClick={() => set({ options: opts })}>{label}</button>
                ))}
              </div>
            </div>

            <div className="awBlock">
              <div className="awKicker">Year groups {draft.year_groups.length ? '' : '· all'}</div>
              <div className="awChips">
                {yearChoices.map(y => (
                  <Chip key={y} on={draft.year_groups.includes(y)} onClick={() => toggleIn('year_groups', y)}>{y}</Chip>
                ))}
              </div>
            </div>

            <div className="awBlock">
              <div className="awKicker">Who can do what</div>
              <table className="awPermTable">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Scope</th>
                    {ACTIONS.map(a => (
                      <th key={a}>{a[0].toUpperCase() + a.slice(1)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(AWARD_ROLES).map(role => (
                    <tr key={role}>
                      <td><b>{ROLE_PLURAL[role]}</b></td>
                      <td className="awMuted">{SCOPE_TEXT[role]}</td>
                      {ACTIONS.map(action => {
                        const on = Boolean(draft.permissions?.[role]?.[action]);
                        return (
                          <td key={action}>
                            <Medal
                              on={on}
                              label={`${AWARD_ROLES[role]}: ${action}`}
                              onClick={() =>
                                set({
                                  permissions: {
                                    ...draft.permissions,
                                    [role]: { ...draft.permissions?.[role], [action]: !on }
                                  }
                                })
                              }
                            >
                              {on ? <Check /> : null}
                            </Medal>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="awHint">Admins and the SuperAdmin can always do everything. Awards count as soon as a teacher submits them; anyone with Edit or Delete can change them afterwards.</p>
            </div>

            <div className="awToggles">
              <Toggle
                on={draft.show_on_portfolio !== false}
                onChange={v => set({ show_on_portfolio: v })}
                label="Show on portfolio & CV"
                hint="As a verified school achievement."
              />
              <div className="awLimit">
                <Toggle
                  on={Boolean(draft.limit_count)}
                  onChange={v => set({ limit_count: v ? 1 : null })}
                  label="Limit per class / year"
                  hint="Optional, e.g. one Sportsperson per class."
                />
                {Boolean(draft.limit_count) && (
                  <div className="awLimitRow">
                    Max
                    <input
                      type="number"
                      min={1}
                      value={draft.limit_count}
                      onChange={e => set({ limit_count: Math.max(1, Number(e.target.value) || 1) })}
                    />
                    per
                    <select value={draft.limit_scope} onChange={e => set({ limit_scope: e.target.value })}>
                      <option value="class">class</option>
                      <option value="year_group">year group</option>
                    </select>
                    {draft.options.length > 1 ? 'for each option' : ''}
                    {draft.choose_first !== 'none' ? `, per ${CHOOSE_FIRST[draft.choose_first].toLowerCase()}` : ''}
                  </div>
                )}
              </div>
            </div>

            <footer className="awEditorFoot">
              <div className="awFootLeft">
                {draft.id && draft.status === 'published' && !draft.closed_early_at && (
                  <button className="awBtn line" disabled={busy} onClick={() => persist({ closed_early_at: new Date().toISOString() }, 'Award closed. Staff can no longer enter nominations.')}>
                    <Lock /> Close now
                  </button>
                )}
                {draft.id && draft.closed_early_at && (
                  <button className="awBtn line" disabled={busy} onClick={() => persist({ closed_early_at: null }, 'Award reopened.')}>
                    <RotateCcw /> Reopen
                  </button>
                )}
                {draft.id && draft.status !== 'archived' && (
                  <button
                    className="awBtn text"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Archive “${draft.name}”?\n\nStaff will no longer see it. Awards already given stay on portfolios and CVs, and you can restore it any time from “Show archived”.`)) return;
                      persist({ status: 'archived' }, 'Award archived. Find it under “Show archived”.').then(() => setDraft(null));
                    }}
                  >
                    <Archive /> Archive
                  </button>
                )}
                {draft.id && draft.status === 'archived' && (
                  <button className="awBtn line" disabled={busy} onClick={() => persist({ status: 'published' }, 'Award restored.')}>
                    <RotateCcw /> Restore
                  </button>
                )}
                {draft.id && (
                  <button className="awBtn text danger" disabled={busy} onClick={removeForever}>
                    <Trash2 /> Delete
                  </button>
                )}
              </div>
              <div className="awFootRight">
                <button className="awBtn line" disabled={busy} onClick={() => persist({ status: draft.status === 'draft' ? 'draft' : draft.status })}>
                  <Save /> {draft.status === 'draft' || !draft.status ? 'Save draft' : 'Save changes'}
                </button>
                {(draft.status === 'draft' || !draft.status) && (
                  <button className="awBtn navy" disabled={busy} onClick={() => persist({ status: 'published' }, 'Award published. Staff will see it from the open date.')}>
                    {busy ? <Loader2 className="spin" /> : <Send />} Publish award
                  </button>
                )}
              </div>
            </footer>
          </section>
        )}
      </div>
    </div>
  );
}

export function AwardsLoading() {
  return (
    <div className="awLoading">
      <Loader2 className="spin" /> Loading awards…
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2 · Staff entry                                                     */
/* ------------------------------------------------------------------ */

export function AwardEntry({ account, awardRole, admin }) {
  const [awards, setAwards] = useState(undefined);
  const [classes, setClasses] = useState([]);
  const [lists, setLists] = useState([]);
  const [awardId, setAwardId] = useState('');
  const [className, setClassName] = useState('');
  const [term, setTerm] = useState('');
  const [year, setYear] = useState('');
  const [roster, setRoster] = useState([]);
  const [existing, setExisting] = useState([]);
  const [ticks, setTicks] = useState(new Map());
  const [cell, setCell] = useState(null); // open cell editor { student, category }
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [flash, say] = useFlash();

  useEffect(() => {
    (async () => {
      try {
        const [list, cls, lst] = await Promise.all([loadAwards(), loadMyClasses().catch(() => []), loadLists()]);
        if (list === null) return setAwards(null);
        const usable = list.filter(a => a.status === 'published' && (admin || ['open'].includes(awardState(a)) || awardRole?.isKso));
        setAwards(usable);
        setClasses(cls);
        setLists(lst);
        const firstOpen = usable.find(a => awardState(a) === 'open') || usable[0];
        if (firstOpen) setAwardId(firstOpen.id);
      } catch (error) {
        say(friendlyError(error), 'error');
        setAwards([]);
      }
    })();
  }, []);

  const award = awards?.find(a => a.id === awardId) || null;
  const open = award && (awardState(award) === 'open' || admin || awardRole?.isKso);
  const grid = Boolean(award && award.choose_first !== 'none');

  const classChoices = useMemo(() => {
    if (!award) return [];
    return classes
      .filter(c => !award.year_groups.length || award.year_groups.includes(c.year_group))
      .map(c => c.class_name)
      .sort(byYearThenClass);
  }, [award, classes]);

  const classYear = classes.find(c => c.class_name === className)?.year_group || '';

  /* Subject limit for this class: the person's roles that cover it decide.
   * null = every subject (a Tutor / Head of Year / KSO role without a
   * limit covers the class). A Teacher always has only their subjects. */
  const mySubjects = useMemo(() => {
    if (admin || !awardRole?.roles?.length || !className) return null;
    const covering = awardRole.roles.filter(r => roleCovers(r, classYear, className));
    if (!covering.length || covering.some(r => r.award_role !== 'subject_teacher' && !(r.subjects || []).length)) return null;
    return [...new Set(covering.flatMap(r => r.subjects || []))];
  }, [admin, awardRole, classYear, className]);

  /* Columns: every subject / area offered in this year (all visible). */
  const columns = useMemo(() => {
    if (!grid) return [''];
    return lists
      .filter(l => l.kind === award.choose_first && l.active)
      .filter(l => !classYear || !(l.year_groups || []).length || l.year_groups.includes(classYear))
      .map(l => l.label);
  }, [grid, award, lists, classYear]);

  /* Columns this person may change (their assigned subjects). */
  const editableCols = useMemo(() => {
    if (!open) return new Set();
    if (!grid || award.choose_first === 'learner_profile' || !mySubjects) return new Set(columns);
    const mine = mySubjects.map(x => x.toLowerCase());
    return new Set(columns.filter(c => mine.includes(c.toLowerCase())));
  }, [open, grid, award, columns, (mySubjects || ['*']).join('|')]);

  useEffect(() => {
    if (!award) return;
    setTerm(award.terms[0] || 'Term 1');
    setYear(award.academic_year);
  }, [awardId]);
  useEffect(() => {
    if (!award) return;
    setClassName(c => (classChoices.includes(c) ? c : classChoices[0] || ''));
  }, [awardId, classChoices.length]);

  /* Load the class sheet: every column at once. */
  useEffect(() => {
    if (!award || !className || !term || !year) {
      setRoster([]);
      setExisting([]);
      setTicks(new Map());
      return;
    }
    let alive = true;
    setLoadingSheet(true);
    Promise.all([
      loadRoster(className),
      loadClassNominations({ awardId: award.id, className, term, academicYear: year })
    ])
      .then(([students, noms]) => {
        if (!alive) return;
        setRoster(students);
        setExisting(noms);
        setTicks(
          new Map(
            noms
              .filter(n => n.status !== 'rejected')
              .map(n => [sheetKey(n.student_id, n.category, n.option_label), { reason: n.reason || '' }])
          )
        );
        setDirty(false);
      })
      .catch(error => say(friendlyError(error), 'error'))
      .finally(() => alive && setLoadingSheet(false));
    return () => {
      alive = false;
    };
  }, [award?.id, className, term, year]);

  if (awards === undefined) return <AwardsLoading />;
  if (awards === null) return <NotReady />;

  const options = award?.options || [];
  const single = options.length <= 1;
  const existingByKey = new Map(existing.map(n => [sheetKey(n.student_id, n.category, n.option_label), n]));
  const focus = award?.term_focus?.[term] || '';

  const ticksIn = (studentId, category) => options.filter(o => ticks.has(sheetKey(studentId, category, o)));
  const commentOf = (studentId, category) => {
    const o = ticksIn(studentId, category)[0];
    return o ? ticks.get(sheetKey(studentId, category, o))?.reason || '' : '';
  };
  const colCount = category => [...ticks.keys()].filter(k => k.split('|')[1] === (category || '')).length;
  const usedFor = (category, option) => [...ticks.keys()].filter(k => {
    const [, c, o] = k.split('|');
    return c === (category || '') && o === option;
  }).length;

  const myTicks = [...ticks.keys()].filter(k => editableCols.has(k.split('|')[1]));
  const tickedCount = ticks.size;
  const myCount = myTicks.length;
  const studentsTicked = new Set([...ticks.keys()].map(k => k.split('|')[0])).size;
  const toSend = myTicks.filter(k => !['approved', 'submitted'].includes(existingByKey.get(k)?.status)).length;
  const draftCount = existing.filter(n => n.status === 'draft' && editableCols.has(n.category)).length;

  function toggle(studentId, category, option) {
    if (!editableCols.has(category)) return;
    const key = sheetKey(studentId, category, option);
    const next = new Map(ticks);
    if (next.has(key)) next.delete(key);
    else {
      if (award.limit_count && award.limit_scope === 'class' && usedFor(category, option) >= award.limit_count) {
        say(`Limit: ${award.limit_count} ${option === 'Awarded' ? '' : option + ' '}per class${category ? ` in ${category}` : ''} for ${award.name}.`, 'error');
        return;
      }
      next.set(key, { reason: commentOf(studentId, category) || existingByKey.get(key)?.reason || '' });
    }
    setTicks(next);
    setDirty(true);
  }

  function setComment(studentId, category, value) {
    const next = new Map(ticks);
    options.forEach(o => {
      const key = sheetKey(studentId, category, o);
      if (next.has(key)) next.set(key, { reason: value });
    });
    setTicks(next);
    setDirty(true);
  }

  async function save(status) {
    setBusy(true);
    try {
      await saveClassSheet({
        award,
        existing,
        ticks,
        term,
        academicYear: year,
        status,
        me: { name: account.full_name || account.email },
        editable: editableCols
      });
      const noms = await loadClassNominations({ awardId: award.id, className, term, academicYear: year });
      setExisting(noms);
      setDirty(false);
      say(
        status === 'draft'
          ? 'Draft saved. Nothing is sent until you submit.'
          : `Saved. ${myCount} award${myCount === 1 ? '' : 's'} now show on the students’ portfolios.`
      );
    } catch (error) {
      say(friendlyError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  const questionWhat = award ? (single ? (options[0] === 'Awarded' ? award.name : options[0]) : award.name) : '';
  const lockedCols = columns.filter(c => !editableCols.has(c));

  return (
    <div className="awPage">
      <AwardStage
        eyebrow={
          award
            ? `${award.name} · ${awardState(award) === 'open' ? `open until ${fmtDay(award.closes_on)}` : STATE_LABEL[awardState(award)].toLowerCase()}`
            : 'Award entry'
        }
        title={
          award ? (
            grid ? (
              <><em>{award.name}</em> · {className || 'choose a class'}</>
            ) : single ? (
              <>Who earned <em>{questionWhat}</em>?</>
            ) : (
              <><em>{award.name}</em></>
            )
          ) : (
            <>Nothing to <em>award</em> just now</>
          )
        }
        watermark={single && options[0] !== 'Awarded' ? options[0] : 'Awards'}
      >
        {awards.length > 0 && (
          <>
            <Select
              label="Award"
              value={awardId}
              onChange={v => {
                if (dirty && !window.confirm('You have unsaved ticks. Switch award anyway?')) return;
                setAwardId(v);
              }}
              options={awards.map(a => ({ value: a.id, label: a.name }))}
            />
            <Select
              label="Class"
              value={className}
              onChange={v => {
                if (dirty && !window.confirm('You have unsaved ticks. Switch class anyway?')) return;
                setClassName(v);
              }}
              options={classChoices}
              placeholder={classChoices.length ? undefined : 'No classes'}
              gold
            />
            <Select label="Term" value={term} onChange={setTerm} options={award?.terms || []} />
            <Select label="Academic year" value={year} onChange={setYear} options={[...new Set([award?.academic_year, ...academicYearOptions()].filter(Boolean))]} />
            {focus && (
              <div className="awFocus">
                <small>{term} focus · Learner Profile</small>
                <b>{focus}</b>
              </div>
            )}
          </>
        )}
      </AwardStage>
      {flash}

      {!awards.length ? (
        <Empty title="No awards are open for you right now" text="When the Key Stage Office opens an award for your classes, it appears here." />
      ) : !classChoices.length ? (
        <Empty title="No classes linked to you for this award" text="Ask an Admin to add your class or year group in Staff & classes." />
      ) : (
        <>
          {award?.description && <p className="awLead">{award.description}</p>}
          <div className="awMetaRow">
            {grid && (
              <span className="awTag">
                {single ? `Tap a medal to give ${questionWhat}` : 'Tap a cell to choose'} · <Plus className="awTagIcon" /> adds a comment
              </span>
            )}
            {award?.limit_count ? (
              <span className="awTag">Limit {award.limit_count} per {award.limit_scope === 'class' ? 'class' : 'year group'}{grid ? ' per column' : ''}</span>
            ) : null}
            {grid && lockedCols.length > 0 && editableCols.size > 0 && (
              <span className="awTag isInfo"><Lock /> You can edit: {[...editableCols].join(', ')} · other columns are view only</span>
            )}
            {!open && <span className="awTag isWarn"><Lock /> Closed — view only</span>}
          </div>

          <section className={`awPanel awSheet ${grid ? 'isGrid' : ''}`}>
            {loadingSheet ? (
              <AwardsLoading />
            ) : grid ? (
              <div className="awGridWrap">
                <table className="awGrid">
                  <thead>
                    <tr>
                      <th className="awGridStudent">Student · {className}</th>
                      {columns.map(c => (
                        <th key={c} className={`awGridHead ${editableCols.has(c) ? 'isMine' : 'isLocked'}`} title={editableCols.has(c) ? c : `${c} · view only`}>
                          <span className="awVert">{c}</span>
                          <span className="awColCount">{colCount(c) || '·'}</span>
                        </th>
                      ))}
                      <th className="awGridTotal"><span className="awVert">Total</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map(s => {
                      const rowTotal = [...ticks.keys()].filter(k => k.startsWith(`${s.student_id}|`)).length;
                      return (
                        <tr key={s.student_id} className={rowTotal ? 'won' : ''}>
                          <td className="awGridStudent">
                            <div className="awWho">
                              <span className="awAv">{initialsOf(s.full_name)}</span>
                              <span>{s.full_name}<small>{s.class_name || className}</small></span>
                            </div>
                          </td>
                          {columns.map(c => {
                            const mine = ticksIn(s.student_id, c);
                            const on = mine.length > 0;
                            const can = editableCols.has(c);
                            const note = commentOf(s.student_id, c);
                            return (
                              <td key={c} className={`awGridCell ${can ? '' : 'isLocked'} ${on ? 'isOn' : ''}`}>
                                {single ? (
                                  <Medal on={on} disabled={!can} label={`${options[0]} in ${c} for ${s.full_name}`} onClick={() => toggle(s.student_id, c, options[0])} />
                                ) : (
                                  <button
                                    type="button"
                                    className={`awCellPick ${on ? 'on' : ''}`}
                                    disabled={!can && !on}
                                    onClick={() => setCell({ student: s, category: c })}
                                    title={on ? mine.join(', ') : can ? 'Choose' : ''}
                                  >
                                    {on ? mine.map(o => o[0]).join('') : can ? <Plus /> : ''}
                                  </button>
                                )}
                                {on && (can || note) && (
                                  <button
                                    type="button"
                                    className={`awCellNote ${note ? 'has' : ''}`}
                                    onClick={() => setCell({ student: s, category: c })}
                                    title={note ? `Comment: ${note}` : can ? 'Add a comment' : ''}
                                    disabled={!can && !note}
                                    aria-label={note ? 'Edit comment' : 'Add a comment'}
                                  >
                                    {note ? <MessageSquare /> : <Plus />}
                                  </button>
                                )}
                              </td>
                            );
                          })}
                          <td className="awGridTotal"><b>{rowTotal || ''}</b></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: single ? '38%' : '30%' }}>Student · {className}</th>
                    {single ? <th className="c" style={{ width: 90 }}>{options[0] === 'Awarded' ? 'Award' : options[0]}</th> : <th>Award</th>}
                    <th>Teacher’s comment <span className="awThNote">optional · shown on the portfolio and CV</span></th>
                    <th className="r" style={{ width: 130 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map(s => {
                    const mine = ticksIn(s.student_id, '');
                    const won = mine.length > 0;
                    const statusRow = options.map(o => existingByKey.get(sheetKey(s.student_id, '', o))).filter(Boolean);
                    const reason = commentOf(s.student_id, '');
                    return (
                      <tr key={s.student_id} className={won ? 'won' : ''}>
                        <td>
                          <div className="awWho">
                            <span className="awAv">{initialsOf(s.full_name)}</span>
                            <span>{s.full_name}<small>{s.class_name || className}</small></span>
                          </div>
                        </td>
                        <td className={single ? 'c' : ''}>
                          {single ? (
                            <Medal on={won} disabled={!open} label={`${options[0]} for ${s.full_name}`} onClick={() => toggle(s.student_id, '', options[0])} />
                          ) : (
                            <div className="awOptRow">
                              {options.map(o => (
                                <Chip key={o} on={ticks.has(sheetKey(s.student_id, '', o))} disabled={!open} onClick={() => toggle(s.student_id, '', o)}>
                                  {ticks.has(sheetKey(s.student_id, '', o)) && <Star />} {o}
                                </Chip>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          {won ? (
                            <div className="awComment">
                              <textarea
                                className="awReason"
                                rows={1}
                                value={reason}
                                maxLength={400}
                                disabled={!open}
                                placeholder="Add a comment (optional), e.g. “Led the science fair with real curiosity.”"
                                onChange={e => setComment(s.student_id, '', e.target.value)}
                                onInput={e => {
                                  e.target.style.height = 'auto';
                                  e.target.style.height = `${e.target.scrollHeight}px`;
                                }}
                              />
                              {reason.length > 300 && <small>{400 - reason.length} left</small>}
                            </div>
                          ) : (
                            <span className="awPh">—</span>
                          )}
                        </td>
                        <td className="r">
                          {statusRow.length ? <NomStatus list={statusRow} /> : won ? <span className="awStatus is-new">New</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {!loadingSheet && !roster.length && <p className="awMuted awPad">No students found in {className}.</p>}
          </section>

          {open && editableCols.size > 0 && (
            <div className="awDock">
              <div className="awDockText">
                <Medal on>{grid ? myCount : tickedCount}</Medal>
                <span>
                  <b>{grid ? myCount : tickedCount} award{(grid ? myCount : tickedCount) === 1 ? '' : 's'}</b>
                  {grid && lockedCols.length ? ' in your subjects' : ` to ${studentsTicked} student${studentsTicked === 1 ? '' : 's'}`}
                  <small>
                    {' '}· {grid ? `${tickedCount} across all subjects` : `${roster.length} in ${className}`}
                    {draftCount ? ` · ${draftCount} in draft` : ''}
                    {dirty ? ' · unsaved changes' : ''}
                  </small>
                </span>
              </div>
              <div className="awDockBtns">
                <button className="awBtn ghost" disabled={busy || !dirty} onClick={() => save('draft')}>
                  <Save /> Save draft
                </button>
                <button className="awBtn gold" disabled={busy || (!dirty && !toSend)} onClick={() => save('submitted')}>
                  {busy ? <Loader2 className="spin" /> : <Send />} {toSend ? `Submit ${toSend} award${toSend === 1 ? '' : 's'}` : 'Save changes'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {cell && (
        <CellEditor
          cell={cell}
          award={award}
          options={options}
          picked={ticksIn(cell.student.student_id, cell.category)}
          comment={commentOf(cell.student.student_id, cell.category)}
          editable={editableCols.has(cell.category)}
          focus={focus}
          onToggle={o => toggle(cell.student.student_id, cell.category, o)}
          onComment={v => setComment(cell.student.student_id, cell.category, v)}
          onClose={() => setCell(null)}
        />
      )}
    </div>
  );
}

/* Small editor for one student × subject cell: options + optional comment. */
function CellEditor({ cell, award, options, picked, comment, editable, focus, onToggle, onComment, onClose }) {
  const single = options.length <= 1;
  return (
    <div className="awModalShade" onClick={onClose}>
      <div className="awModal awCellModal" onClick={e => e.stopPropagation()}>
        <button type="button" className="awModalX" onClick={onClose} aria-label="Close"><X /></button>
        <div className="awKicker">{award.name} · {cell.category}{focus ? ` · focus: ${focus}` : ''}</div>
        <h2>{cell.student.full_name}</h2>
        {!single && (
          <>
            <div className="awKicker">Award</div>
            <div className="awChips">
              {options.map(o => (
                <Chip key={o} on={picked.includes(o)} disabled={!editable} onClick={() => onToggle(o)}>
                  {picked.includes(o) && <Star />} {o}
                </Chip>
              ))}
            </div>
          </>
        )}
        {single && !picked.length && editable && (
          <button type="button" className="awBtn line" onClick={() => onToggle(options[0])}>
            <Star /> Give {options[0] === 'Awarded' ? award.name : options[0]}
          </button>
        )}
        <div className="awKicker">Teacher’s comment · optional · shown on the portfolio and CV</div>
        <textarea
          className="awPaste awCellComment"
          rows={4}
          maxLength={400}
          disabled={!editable || !picked.length}
          value={comment}
          placeholder={picked.length ? 'e.g. “Led the science fair with real curiosity.”' : 'Choose an award first.'}
          onChange={e => onComment(e.target.value)}
          autoFocus
        />
        <div className="awModalFoot">
          <span className="awMuted">{400 - comment.length} characters left</span>
          <button type="button" className="awBtn navy" onClick={onClose}><Check /> Done</button>
        </div>
      </div>
    </div>
  );
}

function NomStatus({ list }) {
  const order = ['rejected', 'draft', 'submitted', 'approved'];
  const worst = [...list].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))[0];
  const text = { draft: 'Draft', submitted: 'Saved', approved: 'Saved', rejected: 'Removed' }[worst.status];
  return <span className={`awStatus is-${worst.status}`} title={worst.review_note || ''}>{text}</span>;
}

/* ------------------------------------------------------------------ */
/* 3 · Reports                                                         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 4 · Approvals (inside the Approvals tab)                            */
/* ------------------------------------------------------------------ */

export function AwardApprovals({ onCountChange }) {
  const [awards, setAwards] = useState(undefined);
  const [noms, setNoms] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [filterAward, setFilterAward] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, say] = useFlash();

  async function refresh() {
    try {
      const [list, waiting] = await Promise.all([loadAwards({ includeArchived: true }), loadNominations({ status: 'submitted' })]);
      setAwards(list);
      setNoms(waiting);
      setPicked(new Set());
      onCountChange?.(waiting.length);
    } catch {
      setAwards(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  if (awards === undefined || awards === null) return null;

  const awardById = new Map(awards.map(a => [a.id, a]));
  const shown = noms.filter(n => (!filterAward || n.award_id === filterAward) && (!filterClass || n.class_name === filterClass));
  const classes = [...new Set(noms.map(n => n.class_name).filter(Boolean))].sort(byYearThenClass);
  const allPicked = shown.length > 0 && shown.every(n => picked.has(n.id));

  async function review(ids, status) {
    if (!ids.length) return;
    let note = null;
    if (status === 'rejected') {
      note = window.prompt(`Reason for not approving ${ids.length} award${ids.length === 1 ? '' : 's'} (optional, shown to the teacher):`, '');
      if (note === null) return;
    }
    setBusy(true);
    try {
      const n = await reviewNominations(ids, status, note || null);
      say(`${n} award${n === 1 ? '' : 's'} ${status === 'approved' ? 'approved' : 'not approved'}.`);
      await refresh();
    } catch (error) {
      say(friendlyError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  const pickIds = [...picked].filter(id => shown.some(n => n.id === id));

  return (
    <section className="panel awApprovals">
      <div className="awApprovalsHead">
        <div>
          <small className="awKicker">School awards</small>
          <h2>Awards waiting for approval</h2>
        </div>
        <span className="queueCount">{noms.length} waiting</span>
      </div>
      {flash}

      {!noms.length ? (
        <div className="emptyMini">
          <CheckCircle2 />
          <b>You're all caught up.</b>
        </div>
      ) : (
        <>
          <div className="awBulkBar">
            <label className="awCheck">
              <input
                type="checkbox"
                checked={allPicked}
                onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map(n => n.id)))}
              />
              <span>{pickIds.length ? `${pickIds.length} selected` : `Select all ${shown.length}`}</span>
            </label>
            <div className="awBulkFilters">
              <select value={filterAward} onChange={e => setFilterAward(e.target.value)}>
                <option value="">All awards</option>
                {[...new Set(noms.map(n => n.award_id))].map(id => (
                  <option key={id} value={id}>{awardById.get(id)?.name || 'Award'}</option>
                ))}
              </select>
              <select value={filterClass} onChange={e => setFilterClass(e.target.value)}>
                <option value="">All classes</option>
                {classes.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="awBulkBtns">
              <button className="awBtn line sm" disabled={busy || !pickIds.length} onClick={() => review(pickIds, 'rejected')}>
                <X /> Don’t approve
              </button>
              <button className="awBtn navy sm" disabled={busy || !pickIds.length} onClick={() => review(pickIds, 'approved')}>
                {busy ? <Loader2 className="spin" /> : <Check />} Approve {pickIds.length || ''}
              </button>
            </div>
          </div>

          <div className="awQueue">
            {shown.map(n => (
              <label key={n.id} className={`awQueueRow ${picked.has(n.id) ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={picked.has(n.id)}
                  onChange={() => {
                    const next = new Set(picked);
                    next.has(n.id) ? next.delete(n.id) : next.add(n.id);
                    setPicked(next);
                  }}
                />
                <span className="awAv">{initialsOf(n.student_name)}</span>
                <span className="awQueueMain">
                  <b>{n.student_name}</b> <small>{n.class_name}</small>
                  <span className="awQueueAward">
                    <Star /> {awardById.get(n.award_id)?.name} · {nominationLabel(n, awardById.get(n.award_id))} · {n.term}
                  </span>
                  {n.reason && <em>“{n.reason}”</em>}
                  {!n.reason && <small className="awNoComment">No comment</small>}
                </span>
                <span className="awQueueBy">
                  {n.entered_by_name || n.entered_by_email}
                  <small>{fmtDay(n.entered_at)}</small>
                </span>
                <span className="awQueueBtns" onClick={e => e.preventDefault()}>
                  <button className="awIconBtn" title="Don’t approve" disabled={busy} onClick={() => review([n.id], 'rejected')}><X /></button>
                  <button className="awIconBtn ok" title="Approve" disabled={busy} onClick={() => review([n.id], 'approved')}><Check /></button>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Publish to portfolio · KSO, Head of Year, Admin, SuperAdmin          */
/* ------------------------------------------------------------------ */
/* Awards are entered and reviewed as before. They reach the student's
 * portfolio only when someone with publishing rights publishes them.
 * Until then staff see them everywhere; students and parents don't. */
export function AwardPublish({ awardRole, admin }) {
  const [awards, setAwards] = useState(undefined);
  const [noms, setNoms] = useState([]);
  const [view, setView] = useState('waiting');
  const [picked, setPicked] = useState(new Set());
  const [fAward, setFAward] = useState('');
  const [fTerm, setFTerm] = useState('');
  const [fYear, setFYear] = useState(currentAcademicYear());
  const [fGroup, setFGroup] = useState('');
  const [fClass, setFClass] = useState('');
  const [busy, setBusy] = useState(false);
  const [notReady, setNotReady] = useState(false);
  const [flash, say] = useFlash();

  const pubRoles = (awardRole?.roles || []).filter(r => ['key_stage_office', 'head_of_year'].includes(r.award_role));
  const mine = n => admin || pubRoles.some(r => roleCovers(r, n.year_group, n.class_name));

  async function refresh() {
    try {
      const [list, approved] = await Promise.all([
        loadAwards({ includeArchived: true }),
        loadNominations({ status: 'approved', academicYear: fYear || undefined })
      ]);
      setAwards(list);
      setNotReady(approved.length > 0 && !('published_to_portfolio' in approved[0]));
      setNoms(approved.filter(mine));
      setPicked(new Set());
    } catch {
      setAwards(null);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fYear]);

  if (awards === undefined) return <AwardsLoading />;
  if (awards === null) return <NotReady />;

  const awardById = new Map(awards.map(a => [a.id, a]));
  const portfolioAward = n => awardById.get(n.award_id)?.show_on_portfolio !== false;
  const inView = n => (view === 'waiting' ? !n.published_to_portfolio : !!n.published_to_portfolio);
  const base = noms.filter(n => portfolioAward(n));
  const shown = base.filter(
    n =>
      inView(n) &&
      (!fAward || n.award_id === fAward) &&
      (!fTerm || n.term === fTerm) &&
      (!fGroup || n.year_group === fGroup) &&
      (!fClass || n.class_name === fClass)
  );
  const waitingCount = base.filter(n => !n.published_to_portfolio).length;
  const publishedCount = base.filter(n => n.published_to_portfolio).length;
  const groups = [...new Set(base.map(n => n.year_group).filter(Boolean))].sort(byYearThenClass);
  const classes = [...new Set(base.filter(n => !fGroup || n.year_group === fGroup).map(n => n.class_name).filter(Boolean))].sort(byYearThenClass);
  const allPicked = shown.length > 0 && shown.every(n => picked.has(n.id));
  const pickIds = [...picked].filter(id => shown.some(n => n.id === id));
  const hiddenAwards = noms.length - base.length;

  async function act(ids, publish) {
    if (!ids.length) return;
    setBusy(true);
    try {
      const n = await publishNominations(ids, publish);
      const skipped = ids.length - n;
      say(
        `${n} award${n === 1 ? '' : 's'} ${publish ? 'published to portfolios' : 'taken off portfolios'}.` +
          (skipped ? ` ${skipped} not changed (outside your year groups or already done).` : '')
      );
      await refresh();
    } catch (error) {
      say(friendlyError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="awPage">
      <AwardStage
        eyebrow={`Publish to portfolio · ${admin ? 'Admin' : pubRoles.map(r => AWARD_ROLES[r.award_role]).join(' · ')}`}
        title={<>Review, then <em>publish</em></>}
        sub="Awards entered by staff appear here once submitted. Staff can see them straight away; students and parents see an award on the portfolio only after it is published here."
        watermark="Publish"
      >
        <Select label="Academic year" value={fYear} onChange={setFYear} options={academicYearOptions()} placeholder="All years" gold />
      </AwardStage>
      {flash}
      {notReady && (
        <p className="awLead">Run migration <b>20261016_award_publish_portfolio.sql</b> in Supabase to switch on publishing.</p>
      )}

      <div className="awPubTabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'waiting'} className={view === 'waiting' ? 'on' : ''} onClick={() => { setView('waiting'); setPicked(new Set()); }}>
          Waiting to publish <span>{waitingCount}</span>
        </button>
        <button type="button" role="tab" aria-selected={view === 'published'} className={view === 'published' ? 'on' : ''} onClick={() => { setView('published'); setPicked(new Set()); }}>
          On portfolios <span>{publishedCount}</span>
        </button>
      </div>

      <section className="panel awApprovals">
        {!base.length ? (
          <div className="emptyMini">
            <CheckCircle2 />
            <b>No submitted awards for {fYear || 'any year'} in your year groups yet.</b>
          </div>
        ) : (
          <>
            <div className="awBulkBar">
              <label className="awCheck">
                <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map(n => n.id)))} />
                <span>{pickIds.length ? `${pickIds.length} selected` : `Select all ${shown.length}`}</span>
              </label>
              <div className="awBulkFilters">
                <select value={fAward} onChange={e => setFAward(e.target.value)} aria-label="Award">
                  <option value="">All awards</option>
                  {[...new Set(base.map(n => n.award_id))].map(id => (
                    <option key={id} value={id}>{awardById.get(id)?.name || 'Award'}</option>
                  ))}
                </select>
                <select value={fTerm} onChange={e => setFTerm(e.target.value)} aria-label="Term">
                  <option value="">All terms</option>
                  {[...new Set(base.map(n => n.term))].map(t => <option key={t}>{t}</option>)}
                </select>
                <select value={fGroup} onChange={e => { setFGroup(e.target.value); setFClass(''); }} aria-label="Year group">
                  <option value="">All year groups</option>
                  {groups.map(g => <option key={g}>{g}</option>)}
                </select>
                <select value={fClass} onChange={e => setFClass(e.target.value)} aria-label="Class">
                  <option value="">All classes</option>
                  {classes.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="awBulkBtns">
                {view === 'waiting' ? (
                  <button className="awBtn gold sm" disabled={busy || !pickIds.length} onClick={() => act(pickIds, true)}>
                    {busy ? <Loader2 className="spin" /> : <Upload />} Publish {pickIds.length || ''} to portfolio
                  </button>
                ) : (
                  <button className="awBtn line sm" disabled={busy || !pickIds.length} onClick={() => act(pickIds, false)}>
                    {busy ? <Loader2 className="spin" /> : <RotateCcw />} Take {pickIds.length || ''} off portfolio
                  </button>
                )}
              </div>
            </div>

            {!shown.length ? (
              <div className="emptyMini">
                <CheckCircle2 />
                <b>{view === 'waiting' ? 'Nothing waiting with these filters.' : 'Nothing published with these filters.'}</b>
              </div>
            ) : (
              <div className="awQueue">
                {shown.map(n => (
                  <label key={n.id} className={`awQueueRow ${picked.has(n.id) ? 'on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={picked.has(n.id)}
                      onChange={() => {
                        const next = new Set(picked);
                        next.has(n.id) ? next.delete(n.id) : next.add(n.id);
                        setPicked(next);
                      }}
                    />
                    <span className="awAv">{initialsOf(n.student_name)}</span>
                    <span className="awQueueMain">
                      <b>{n.student_name}</b> <small>{n.class_name}</small>
                      <span className="awQueueAward">
                        <Star /> {awardById.get(n.award_id)?.name} · {nominationLabel(n, awardById.get(n.award_id))} · {n.term}
                      </span>
                      {n.reason ? <em>“{n.reason}”</em> : <small className="awNoComment">No comment</small>}
                    </span>
                    <span className="awQueueBy">
                      {n.entered_by_name || n.entered_by_email}
                      <small>{n.published_to_portfolio ? `On portfolio since ${fmtDay(n.published_at)}` : `Submitted ${fmtDay(n.reviewed_at || n.entered_at)}`}</small>
                    </span>
                    <span className="awQueueBtns" onClick={e => e.preventDefault()}>
                      {n.published_to_portfolio ? (
                        <button className="awIconBtn" title="Take off portfolio" disabled={busy} onClick={() => act([n.id], false)}><RotateCcw /></button>
                      ) : (
                        <button className="awIconBtn ok" title="Publish to portfolio" disabled={busy} onClick={() => act([n.id], true)}><Upload /></button>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </section>
      {hiddenAwards > 0 && (
        <p className="awHint">{hiddenAwards} award{hiddenAwards === 1 ? ' is' : 's are'} not listed because the award has “Show on portfolio” switched off in Award setup.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5 · Staff & classes                                                 */
/* ------------------------------------------------------------------ */

const blankPerson = () => ({ full_name: '', email: '', award_role: 'class_teacher', year_groups: [], class_names: [], active: true });

const ROLE_PLURAL = { key_stage_office: 'Key Stage Office', head_of_year: 'Heads of Year', class_teacher: 'Tutors', subject_teacher: 'Teachers' };
const CLASS_ROLES = ['class_teacher', 'subject_teacher'];

function roleScopeText(r) {
  if (r.award_role === 'subject_teacher')
    return `${(r.class_names || []).join(', ') || 'no classes yet'}${(r.subjects || []).length ? '' : ' · no subjects yet'}`;
  if (r.award_role === 'class_teacher') return (r.class_names || []).join(', ') || 'no classes yet';
  if (r.award_role === 'head_of_year') return (r.year_groups || []).join(', ') || 'no year yet';
  return (r.year_groups || []).length ? r.year_groups.join(', ') : 'all years';
}

const roleIncomplete = r =>
  (CLASS_ROLES.includes(r.award_role) && !(r.class_names || []).length) ||
  (r.award_role === 'subject_teacher' && !(r.subjects || []).length) ||
  (r.award_role === 'head_of_year' && !(r.year_groups || []).length);

/* Classes grouped by year, with a "whole year" button per row. */
function ClassPicker({ value = [], onChange, classesByYear }) {
  const toggle = c => onChange(value.includes(c) ? value.filter(x => x !== c) : [...value, c]);
  return (
    <div className="awYearPick">
      {classesByYear.map(([y, cls]) => {
        const all = cls.length && cls.every(c => value.includes(c));
        return (
          <div key={y} className="awYearRow">
            <button
              type="button"
              className={`awYearBtn ${all ? 'on' : ''}`}
              onClick={() => onChange(all ? value.filter(c => !cls.includes(c)) : [...new Set([...value, ...cls])])}
            >
              {y}
            </button>
            <div className="awChips">
              {cls.map(c => (
                <Chip key={c} on={value.includes(c)} onClick={() => toggle(c)}>{c}</Chip>
              ))}
            </div>
          </div>
        );
      })}
      {!classesByYear.length && <span className="awMuted">No classes found in the student records yet.</span>}
    </div>
  );
}

function ChipSet({ options, value = [], onChange }) {
  return (
    <div className="awChips awChipScroll">
      {options.map(o => (
        <Chip key={o} on={value.includes(o)} onClick={() => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o])}>
          {o}
        </Chip>
      ))}
    </div>
  );
}

/* One role's scope + optional subject limit. */
function RoleEditor({ role, onChange, classesByYear, years, subjects }) {
  const set = patch => onChange({ ...role, ...patch });
  return (
    <>
      {CLASS_ROLES.includes(role.award_role) ? (
        <>
          <div className="awKicker">
            {role.award_role === 'class_teacher' ? 'Form class(es)' : 'Classes they teach · choose any number, across years'}
          </div>
          <ClassPicker value={role.class_names || []} onChange={v => set({ class_names: v })} classesByYear={classesByYear} />
        </>
      ) : (
        <>
          <div className="awKicker">
            Year group{role.award_role === 'head_of_year' ? '(s)' : '(s) · leave empty for all'}
          </div>
          <ChipSet options={years} value={role.year_groups || []} onChange={v => set({ year_groups: v })} />
        </>
      )}
      <div className="awKicker">
        {role.award_role === 'subject_teacher' ? 'Their subjects / areas · required' : 'Limit to subjects / areas · optional'}
      </div>
      <ChipSet options={subjects} value={role.subjects || []} onChange={v => set({ subjects: v })} />
    </>
  );
}

export function AwardStaff() {
  const [people, setPeople] = useState(undefined);
  const [classes, setClasses] = useState([]);
  const [lists, setLists] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [person, setPerson] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  /* Staff who are switched off sit in their own tab, so the Active list stays clean. */
  const [statusView, setStatusView] = useState('active');
  const [onlyNeeds, setOnlyNeeds] = useState(false);
  const [flash, say] = useFlash();

  async function refresh() {
    setPeople(await loadAwardStaff());
  }

  useEffect(() => {
    refresh();
    loadAllClasses().then(setClasses).catch(() => setClasses([]));
    loadLists().then(setLists).catch(() => setLists([]));
  }, []);

  if (people === undefined) return <AwardsLoading />;

  const years = [...new Set(classes.map(c => c.year_group).filter(Boolean))].sort(byYearThenClass);
  const classNames = classes.map(c => c.class_name).filter(c => c && !isNoClass(c)).sort(byYearThenClass);
  const classesByYear = years
    .map(y => [y, classNames.filter(c => classes.some(k => k.class_name === c && k.year_group === y))])
    .filter(([, cls]) => cls.length);
  const subjectChoices = [
    ...new Set(lists.filter(l => ['subject', 'curriculum_area'].includes(l.kind) && l.active).map(l => l.label))
  ].sort((x, y) => x.localeCompare(y));
  const needs = p => p.active && (!(p.roles || []).length || p.roles.some(roleIncomplete));
  const needCount = people.filter(needs).length;
  const shown = people.filter(
    p => (statusView === 'all' || (statusView === 'off' ? !p.active : p.active)) &&
      (!query || `${p.full_name} ${p.email}`.toLowerCase().includes(query.toLowerCase())) && (!onlyNeeds || needs(p))
  );
  const activeCount = people.filter(p => p.active).length;
  const offCount = people.length - activeCount;
  const counts = Object.keys(AWARD_ROLES).map(r => [r, people.filter(p => p.active && (p.roles || []).some(x => x.award_role === r)).length]);
  const picked = people.filter(p => selected.has(p.id));
  const allShownPicked = shown.length > 0 && shown.every(p => selected.has(p.id));
  const editorProps = { classesByYear, years, subjects: subjectChoices };

  function togglePick(id) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function savePersonForm(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await saveAwardStaff(
        {
          email: person.email,
          full_name: person.full_name,
          active: person.active !== false,
          roles: (person.roles || []).map(r => ({
            award_role: r.award_role,
            class_names: r.class_names || [],
            year_groups: r.year_groups || [],
            subjects: r.subjects || []
          }))
        },
        'replace'
      );
      say(result.created?.length ? `${person.full_name} added. They can now sign in with their email code.` : `${person.full_name} saved.`);
      setPerson(null);
      await refresh();
    } catch (error) {
      say(friendlyError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(event) {
    event.preventDefault();
    const role = {
      award_role: bulk.role.award_role,
      class_names: bulk.role.class_names || [],
      year_groups: bulk.role.year_groups || [],
      subjects: bulk.role.subjects || []
    };
    setBusy(true);
    try {
      const results = await importAwardStaff(
        picked.map(p => ({ email: p.email, full_name: p.full_name, active: p.active, roles: [role] })),
        bulk.mode === 'remove' ? 'remove' : 'merge'
      );
      const ok = results.filter(r => r.ok).length;
      const bad = results.filter(r => !r.ok);
      say(
        bulk.mode === 'remove'
          ? `${AWARD_ROLES[role.award_role]} removed from ${ok} ${ok === 1 ? 'person' : 'people'}.`
          : `${AWARD_ROLES[role.award_role]} assigned to ${ok} ${ok === 1 ? 'person' : 'people'}.${bad.length ? ` ${bad.length} failed.` : ''}`,
        bad.length ? 'error' : 'ok'
      );
      setBulk(null);
      setSelected(new Set());
      await refresh();
    } catch (error) {
      say(friendlyError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function switchOff() {
    if (!window.confirm(`Switch off ${picked.length} ${picked.length === 1 ? 'person' : 'people'}? They will no longer see the award screens. Awards they gave stay.`)) return;
    setBusy(true);
    try {
      await importAwardStaff(picked.map(p => ({ email: p.email, full_name: p.full_name, active: false })), 'merge');
      say(`${picked.length} switched off.`);
      setSelected(new Set());
      await refresh();
    } catch (error) {
      say(friendlyError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  const freeRoles = person ? Object.keys(AWARD_ROLES).filter(r => !(person.roles || []).some(x => x.award_role === r)) : [];

  return (
    <div className="awPage">
      <AwardStage
        eyebrow="Staff & classes"
        title={<>Who awards <em>which classes</em></>}
        sub="1 · Import your staff.  2 · Tick people and assign roles in bulk. One person can hold several roles, e.g. Tutor of Yr8A, Teacher of Science in Yr8A–Yr9C and Head of Year 7. Panthers roles are not changed."
        watermark="Staff"
        actions={
          <>
            <button className="awBtn ghost" onClick={downloadStaffTemplate} title="CSV template for Import staff">
              <Download /> CSV template
            </button>
            <button className="awBtn ghost" onClick={() => setImporting(true)}>
              <Upload /> Import staff
            </button>
            <button className="awBtn gold" onClick={() => setPerson({ full_name: '', email: '', active: true, roles: [], isNew: true })}>
              <UserPlus /> Add staff
            </button>
          </>
        }
      >
        {counts.map(([r, n]) => (
          <div key={r} className="awStat"><b>{n}</b><small>{n === 1 ? AWARD_ROLES[r] : ROLE_PLURAL[r]}</small></div>
        ))}
        {needCount > 0 && (
          <button type="button" className={`awStat isAlert ${onlyNeeds ? 'on' : ''}`} onClick={() => setOnlyNeeds(v => !v)}>
            <b>{needCount}</b><small>{onlyNeeds ? 'Showing: need a role' : 'Need a role or classes →'}</small>
          </button>
        )}
      </AwardStage>
      {flash}

      <section className="awPanel">
        {selected.size > 0 ? (
          <div className="awBulkBar">
            <span className="awCheck"><b>{selected.size}</b>&nbsp;selected</span>
            <div className="awBulkBtns">
              <button className="awBtn navy sm" onClick={() => setBulk({ mode: 'add', role: { award_role: 'class_teacher', class_names: [], year_groups: [], subjects: [] } })}>
                <Plus /> Assign role
              </button>
              <button className="awBtn line sm" onClick={() => setBulk({ mode: 'remove', role: { award_role: 'class_teacher' } })}>
                <X /> Remove role
              </button>
              <button className="awBtn line sm" disabled={busy} onClick={switchOff}>Switch off</button>
              <button className="awBtn line sm" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          </div>
        ) : (
          <div className="awTableTools">
            <input className="awSearch" placeholder="Search staff by name or email" value={query} onChange={e => setQuery(e.target.value)} />
            <div className="awStatusTabs" role="tablist" aria-label="Staff status">
              {[['active', `Active ${activeCount}`], ['off', `Switched off ${offCount}`], ['all', 'All']].map(([key, label]) => (
                <button type="button" role="tab" aria-selected={statusView === key} key={key} className={statusView === key ? 'on' : ''} onClick={() => { setStatusView(key); setSelected(new Set()); }}>
                  {label}
                </button>
              ))}
            </div>
            <span className="awMuted">Tick people to assign roles and classes in bulk.</span>
            {onlyNeeds && <button className="awBtn text sm" onClick={() => setOnlyNeeds(false)}>Show everyone</button>}
          </div>
        )}
        {!people.length ? (
          <Empty
            icon={<UserPlus />}
            title="No award staff yet"
            text="Import your staff list (names and emails are enough), then tick people to assign their roles and classes."
            action={
              <div>
                <button className="awBtn navy" onClick={() => setImporting(true)}>
                  <Upload /> Import staff
                </button>
                <div>
                  <button type="button" className="awTemplateLink" onClick={downloadStaffTemplate}>
                    <Download /> Download the CSV template first
                  </button>
                </div>
              </div>
            }
          />
        ) : (
          <table className="awStaffTable">
            <thead>
              <tr>
                <th style={{ width: 44 }}>
                  <input
                    type="checkbox"
                    className="awTick"
                    checked={allShownPicked}
                    onChange={() => {
                      const next = new Set(selected);
                      shown.forEach(p => (allShownPicked ? next.delete(p.id) : next.add(p.id)));
                      setSelected(next);
                    }}
                    aria-label="Select all shown"
                  />
                </th>
                <th>Person</th>
                <th>Roles &amp; classes</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map(p => (
                <tr key={p.id} className={`${p.active ? '' : 'isOff'} ${selected.has(p.id) ? 'isPicked' : ''}`}>
                  <td><input type="checkbox" className="awTick" checked={selected.has(p.id)} onChange={() => togglePick(p.id)} aria-label={`Select ${p.full_name}`} /></td>
                  <td>
                    <div className="awWho">
                      <span className="awAv">{initialsOf(p.full_name)}</span>
                      <span>{p.full_name}<small className="lower">{p.email}</small></span>
                    </div>
                  </td>
                  <td>
                    <div className="awRoleList">
                      {(p.roles || []).map(r => (
                        <span key={r.award_role} className={`awRoleLine ${roleIncomplete(r) ? 'isNeeds' : ''}`}>
                          <span className={`awRole is-${r.award_role}`}>{AWARD_ROLES[r.award_role]}</span>
                          <span>{roleScopeText(r)}</span>
                          {(r.subjects || []).length > 0 && <em>{r.subjects.join(', ')}</em>}
                        </span>
                      ))}
                      {!(p.roles || []).length && (
                        <button className="awNeeds" onClick={() => setPerson({ ...p, roles: [] })}>No role yet · assign →</button>
                      )}
                    </div>
                  </td>
                  <td>{p.active ? <span className="awStatus is-approved">Active</span> : <span className="awStatus is-draft">Off</span>}</td>
                  <td className="r">
                    <button className="awBtn text sm" onClick={() => setPerson({ ...p, roles: (p.roles || []).map(r => ({ ...r })) })}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {person && (
        <div className="awModalShade" onClick={() => !busy && setPerson(null)}>
          <form className="awModal awPersonModal" onClick={e => e.stopPropagation()} onSubmit={savePersonForm}>
            <button type="button" className="awModalX" onClick={() => setPerson(null)} aria-label="Close"><X /></button>
            <div className="awKicker">{person.isNew ? 'Add staff' : 'Edit staff'}</div>
            <h2>{person.full_name || 'New person'}</h2>
            <div className="awFields">
              <label>Full name<input value={person.full_name} onChange={e => setPerson({ ...person, full_name: e.target.value })} required /></label>
              <label>School email<input type="email" value={person.email} disabled={!person.isNew} onChange={e => setPerson({ ...person, email: e.target.value })} required /></label>
            </div>

            {(person.roles || []).map((r, i) => (
              <div key={r.award_role} className="awRoleCard">
                <div className="awRoleCardHead">
                  <span className={`awRole is-${r.award_role}`}>{AWARD_ROLES[r.award_role]}</span>
                  <button
                    type="button"
                    className="awBtn text sm danger"
                    onClick={() => setPerson({ ...person, roles: person.roles.filter((_, k) => k !== i) })}
                  >
                    <X /> Remove role
                  </button>
                </div>
                <RoleEditor
                  role={r}
                  onChange={nr => setPerson({ ...person, roles: person.roles.map((x, k) => (k === i ? nr : x)) })}
                  {...editorProps}
                />
              </div>
            ))}

            {freeRoles.length > 0 && (
              <div className="awAddRole">
                <span className="awKicker">{(person.roles || []).length ? 'Add another role' : 'Give a role'}</span>
                <div className="awChips">
                  {freeRoles.map(r => (
                    <button
                      key={r}
                      type="button"
                      className="awChip"
                      onClick={() =>
                        setPerson({ ...person, roles: [...(person.roles || []), { award_role: r, class_names: [], year_groups: [], subjects: [] }] })
                      }
                    >
                      <Plus /> {AWARD_ROLES[r]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Toggle on={person.active !== false} onChange={v => setPerson({ ...person, active: v })} label="Active" hint="Switch off when someone leaves; their past awards stay." />
            <div className="awModalFoot">
              <button type="button" className="awBtn line" onClick={() => setPerson(null)}>Cancel</button>
              <button className="awBtn navy" disabled={busy}>{busy ? <Loader2 className="spin" /> : <Check />} Save</button>
            </div>
          </form>
        </div>
      )}

      {bulk && (
        <div className="awModalShade" onClick={() => !busy && setBulk(null)}>
          <form className="awModal awPersonModal" onClick={e => e.stopPropagation()} onSubmit={runBulk}>
            <button type="button" className="awModalX" onClick={() => setBulk(null)} aria-label="Close"><X /></button>
            <div className="awKicker">{bulk.mode === 'remove' ? 'Remove a role' : 'Assign a role'} · {picked.length} selected</div>
            <h2>{bulk.mode === 'remove' ? 'Remove from selected staff' : 'Assign to selected staff'}</h2>
            <p className="awMuted awPickedNames">{picked.map(p => p.full_name).join(', ')}</p>
            <div className="awKicker">Role</div>
            <div className="awChips">
              {Object.entries(AWARD_ROLES).map(([v, l]) => (
                <Chip key={v} on={bulk.role.award_role === v} onClick={() => setBulk({ ...bulk, role: { ...bulk.role, award_role: v } })}>{l}</Chip>
              ))}
            </div>
            {bulk.mode !== 'remove' && (
              <>
                <RoleEditor role={bulk.role} onChange={nr => setBulk({ ...bulk, role: nr })} {...editorProps} />
                <p className="awHint">
                  Added to what each person already has: existing roles and classes are kept. To take something away, use Edit on that person.
                </p>
              </>
            )}
            {bulk.mode === 'remove' && (
              <p className="awHint">Removes this role (and its classes) from everyone selected who has it. Their other roles stay.</p>
            )}
            <div className="awModalFoot">
              <button type="button" className="awBtn line" onClick={() => setBulk(null)}>Cancel</button>
              <button className="awBtn navy" disabled={busy}>
                {busy ? <Loader2 className="spin" /> : bulk.mode === 'remove' ? <X /> : <Check />}{' '}
                {bulk.mode === 'remove' ? 'Remove' : 'Assign'} for {picked.length}
              </button>
            </div>
          </form>
        </div>
      )}

      {importing && (
        <StaffImport
          years={years}
          classNames={classNames}
          subjects={subjectChoices}
          existing={people}
          onClose={() => setImporting(false)}
          onDone={async (ok, needsCount) => {
            setImporting(false);
            await refresh();
            if (ok) say(`${ok} staff imported.${needsCount ? ` ${needsCount} still need a role or classes — tick them and use “Assign role”.` : ''}`);
            if (needsCount) setOnlyNeeds(true);
          }}
        />
      )}
    </div>
  );
}

const IMPORT_COLUMNS = ['full_name', 'email', 'award_role', 'classes', 'year_groups', 'subjects'];

/* CSV template for Import staff. Only full_name and email are required.
 * A person with two roles = two rows with the same email. Several classes /
 * years / subjects in one cell: separate with ";". */
export function downloadStaffTemplate() {
  downloadCsv('TBS-award-staff-template.csv', [
    IMPORT_COLUMNS,
    ['Mrs Kavita Rao', 'kavita.rao@british-school.org', 'Key Stage Office', '', 'Year 6; Year 7; Year 8; Year 9', ''],
    ['Ms Anjali Mehta', 'anjali.mehta@british-school.org', 'Tutor', 'Yr8A', '', ''],
    ['Ms Anjali Mehta', 'anjali.mehta@british-school.org', 'Teacher', 'Yr8A; Yr8B; Yr9C', '', 'Science'],
    ['Ms Anjali Mehta', 'anjali.mehta@british-school.org', 'Head of Year', '', 'Year 7', ''],
    ['Mr David Brown', 'david.brown@british-school.org', 'Teacher', 'Yr6A; Yr6B; Yr7C', '', 'Physical Education'],
    ['Ms Sana Iqbal', 'sana.iqbal@british-school.org', '', '', '', '']
  ]);
}

function roleFrom(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return '';
  if (/key|kso|ks office|stage/.test(t)) return 'key_stage_office';
  if (/head|hoy/.test(t)) return 'head_of_year';
  if (/tutor|form|class/.test(t)) return 'class_teacher';
  if (/teacher|subject/.test(t)) return 'subject_teacher';
  return null;
}

const splitList = v =>
  String(v || '')
    .split(/[;|,/]+/)
    .map(x => x.trim())
    .filter(Boolean);

function StaffImport({ years, classNames, subjects, existing, onClose, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);

  const findCi = (list, v) => list.find(x => x.toLowerCase() === String(v).toLowerCase().replace(/\s+/g, '') || x.toLowerCase() === String(v).toLowerCase());
  const yearFix = v => {
    const m = String(v).match(/(\d+)/);
    return m ? `Year ${m[1]}` : String(v).trim();
  };

  const parsed = useMemo(() => {
    const rowsIn = parseCsv(text);
    if (!rowsIn.length) return [];
    const head = rowsIn[0].map(h => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
    const hasHeader = head.includes('email');
    const idx = name => {
      const aliases = {
        full_name: ['full_name', 'name', 'staff_name', 'teacher'],
        email: ['email', 'email_address', 'school_email'],
        award_role: ['award_role', 'role'],
        classes: ['classes', 'class', 'class_names', 'sections'],
        year_groups: ['year_groups', 'year_group', 'years', 'year'],
        subjects: ['subjects', 'subject', 'areas']
      }[name];
      return hasHeader ? head.findIndex(h => aliases.includes(h)) : IMPORT_COLUMNS.indexOf(name);
    };
    const body = hasHeader ? rowsIn.slice(1) : rowsIn;
    const seen = new Map();
    return body.map((r, n) => {
      const get = k => (idx(k) >= 0 ? String(r[idx(k)] || '').trim() : '');
      const email = get('email').toLowerCase();
      let role = roleFrom(get('award_role'));
      const problems = [];
      const notes = [];
      const cls = [];
      splitList(get('classes')).forEach(c => {
        const hit = findCi(classNames, c) || findCi(classNames, `Yr${c}`);
        hit ? cls.push(hit) : notes.push(`class ${c} not found`);
      });
      const yrs = [];
      splitList(get('year_groups')).forEach(y => {
        const hit = findCi(years, yearFix(y));
        hit ? yrs.push(hit) : notes.push(`${y} not found`);
      });
      const subs = [];
      splitList(get('subjects')).forEach(x => {
        const hit = subjects.find(sub => sub.toLowerCase() === x.toLowerCase());
        hit ? subs.push(hit) : notes.push(`subject ${x} not in Lists`);
      });
      // A blank role with classes listed: Teacher if subjects are given, else Tutor.
      if (role === '' && cls.length) role = subs.length ? 'subject_teacher' : 'class_teacher';
      if (!get('full_name')) problems.push('name missing');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push('email not valid');
      if (role === null) problems.push(`role “${get('award_role')}” not recognised`);
      const key = `${email}|${role || ''}`;
      if (email && seen.has(key) && role) problems.push('same person and role twice');
      seen.set(key, true);
      const already = existing.some(p => p.email.toLowerCase() === email);
      const incomplete =
        (CLASS_ROLES.includes(role) && !cls.length) || (role === 'subject_teacher' && !subs.length) || (role === 'head_of_year' && !yrs.length);
      return {
        line: n + (hasHeader ? 2 : 1),
        email,
        name: get('full_name'),
        role: role || '',
        cls,
        yrs,
        subs,
        problems,
        notes,
        already,
        needs: !role || incomplete
      };
    });
  }, [text, years, classNames, subjects, existing]);

  const good = parsed.filter(p => !p.problems.length);

  /* One entry per person; their rows become their roles. */
  const peopleOut = useMemo(() => {
    const byEmail = new Map();
    good.forEach(row => {
      const p = byEmail.get(row.email) || { email: row.email, full_name: row.name, active: true, roles: [] };
      if (!p.full_name) p.full_name = row.name;
      if (row.role) p.roles.push({ award_role: row.role, class_names: row.cls, year_groups: row.yrs, subjects: row.subs });
      byEmail.set(row.email, p);
    });
    return [...byEmail.values()];
  }, [good]);
  const peopleNeeding = peopleOut.filter(p => !p.roles.length || p.roles.some(roleIncomplete)).length;

  async function readFile(file) {
    if (!file) return;
    setText(await file.text());
    setResults(null);
  }

  async function run() {
    setBusy(true);
    try {
      const res = await importAwardStaff(peopleOut, 'merge');
      setResults(res);
      if (res.every(r => r.ok)) onDone(res.length, peopleNeeding);
    } catch (error) {
      setResults([{ email: '', ok: false, error: friendlyError(error) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="awModalShade" onClick={() => !busy && onClose()}>
      <div className="awModal awImport" onClick={e => e.stopPropagation()}>
        <button type="button" className="awModalX" onClick={onClose} aria-label="Close"><X /></button>
        <div className="awKicker">Import staff</div>
        <h2>Add many staff at once</h2>
        <p className="awMuted">
          A CSV with <b>full_name</b> and <b>email</b> is enough — roles and classes can be assigned afterwards in bulk.
          Optional columns: <b>award_role, classes, year_groups, subjects</b>. Roles: Key Stage Office, Head of Year, Tutor (form class) or Teacher (classes taught + subjects). Someone with several roles = one row per role, same email.
          Separate several values with “;”.
        </p>
        <div className="awImportBar">
          <label className="awBtn navy sm">
            <Upload /> Choose CSV file
            <input type="file" accept=".csv,text/csv,.txt" hidden onChange={e => readFile(e.target.files?.[0])} />
          </label>
          <button type="button" className="awBtn line sm" onClick={downloadStaffTemplate}>
            <Download /> Download template
          </button>
        </div>
        <textarea
          className="awPaste"
          rows={5}
          placeholder={'…or paste rows here, e.g.\nfull_name,email\nMs Priya Nair,priya.nair@british-school.org\nMr David Brown,david.brown@british-school.org'}
          value={text}
          onChange={e => {
            setText(e.target.value);
            setResults(null);
          }}
        />

        {parsed.length > 0 && (
          <div className="awImportPreview">
            <div className="awImportSummary">
              <span><b>{peopleOut.length}</b> {peopleOut.length === 1 ? 'person' : 'people'} ready</span>
              {parsed.length - good.length > 0 && <span className="bad"><b>{parsed.length - good.length}</b> rows to fix</span>}
              {peopleNeeding > 0 && <span className="warn"><b>{peopleNeeding}</b> will need a role or classes</span>}
              {peopleOut.filter(p => existing.some(e => e.email.toLowerCase() === p.email)).length > 0 && (
                <span><b>{peopleOut.filter(p => existing.some(e => e.email.toLowerCase() === p.email)).length}</b> already listed (roles added)</span>
              )}
            </div>
            <table>
              <thead><tr><th>#</th><th>Person</th><th>Role</th><th>Covers</th><th>Check</th></tr></thead>
              <tbody>
                {parsed.map(row => {
                  const r = results?.find(x => x.email === row.email);
                  return (
                    <tr key={row.line} className={row.problems.length ? 'isBad' : ''}>
                      <td className="awMuted">{row.line}</td>
                      <td>{row.name || '—'}<small className="lower">{row.email}</small></td>
                      <td>{row.role ? AWARD_ROLES[row.role] : <span className="awMuted">— assign later</span>}</td>
                      <td className="awMuted">
                        {CLASS_ROLES.includes(row.role)
                          ? row.cls.join(', ') || '—'
                          : row.role
                            ? row.yrs.join(', ') || (row.role === 'key_stage_office' ? 'All years' : '—')
                            : ''}
                        {row.subs.length ? ` · ${row.subs.join(', ')}` : ''}
                      </td>
                      <td>
                        {r ? (
                          r.ok ? <span className="awStatus is-approved">Imported</span> : <span className="awStatus is-rejected" title={r.error}>{r.error}</span>
                        ) : row.problems.length ? (
                          <span className="awStatus is-rejected">{row.problems.join(' · ')}</span>
                        ) : (
                          <span className="awImportOk">
                            {row.needs ? 'OK · assign later' : 'OK'}
                            {row.notes.length ? <small>{row.notes.join(' · ')}</small> : null}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="awModalFoot">
          {results && !results.every(r => r.ok) && (
            <span className="awMuted">{results.filter(r => r.ok).length} imported, {results.filter(r => !r.ok).length} not. Fix those rows and import again.</span>
          )}
          <button type="button" className="awBtn line" onClick={() => (results ? onDone(results.filter(r => r.ok).length, peopleNeeding) : onClose())}>
            {results ? 'Done' : 'Cancel'}
          </button>
          <button type="button" className="awBtn navy" disabled={busy || !peopleOut.length || Boolean(results)} onClick={run}>
            {busy ? <Loader2 className="spin" /> : <Upload />} Import {peopleOut.length || ''} {peopleOut.length === 1 ? 'person' : 'staff'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6 · Lists & settings (SuperAdmin)                                   */
/* ------------------------------------------------------------------ */

const LIST_KINDS = [
  ['subject', 'Subjects', 'Subject Awards'],
  ['curriculum_area', 'Curriculum areas', 'Going for Gold'],
  ['learner_profile', 'Learner Profile', 'Learner Profile Award']
];

const offeredIn = (item, year) => !(item.year_groups || []).length || item.year_groups.includes(year);

function yearsLabel(item, allYears) {
  const ys = item.year_groups || [];
  if (!ys.length) return 'All years';
  if (ys.includes('none')) return 'No years';
  const nums = ys.map(y => Number(String(y).match(/\d+/)?.[0])).filter(n => !Number.isNaN(n)).sort((a, b) => a - b);
  const contiguous = nums.length === ys.length && nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  if (contiguous && nums.length > 2) return `Years ${nums[0]}–${nums[nums.length - 1]}`;
  return ys.map(y => y.replace('Year ', 'Y')).join(', ');
}

export function AwardLists() {
  const [lists, setLists] = useState(undefined);
  const [years, setYears] = useState([]);
  const [yearView, setYearView] = useState('');
  const [adding, setAdding] = useState({});
  const [flash, say] = useFlash();

  async function refresh() {
    setLists(await loadLists());
  }
  useEffect(() => {
    refresh();
    loadAllClasses()
      .then(rows => setYears([...new Set(rows.map(r => r.year_group).filter(Boolean))].sort(byYearThenClass)))
      .catch(() => setYears([]));
  }, []);

  if (lists === undefined) return <AwardsLoading />;

  async function save(item, message) {
    try {
      await saveListItem(item);
      if (message) say(message);
      await refresh();
    } catch (error) {
      say(friendlyError(error), 'error');
    }
  }

  /* Tick / untick an item for the chosen year.
   * Empty list = every year; ['none'] = switched off for every year. */
  function toggleYear(item) {
    const current = (item.year_groups || []).length ? item.year_groups.filter(y => y !== 'none') : years;
    let next = current.includes(yearView) ? current.filter(y => y !== yearView) : [...current, yearView];
    if (years.length && years.every(y => next.includes(y))) next = [];
    else if (!next.length) next = ['none'];
    save({ ...item, year_groups: next });
  }

  return (
    <div className="awPage">
      <AwardStage
        eyebrow="Lists & settings · SuperAdmin"
        title={<>The lists behind <em>every award</em></>}
        sub="These feed the drop-downs staff see. Choose a year group to set which subjects and areas it offers; teachers only see those for the class they pick."
        watermark="Lists"
      >
        <Select
          label="Year group"
          value={yearView}
          onChange={setYearView}
          options={years}
          placeholder="All years · edit names"
          gold
        />
      </AwardStage>
      {flash}
      {yearView && (
        <p className="awLead">
          Tick what <b>{yearView}</b> offers. Unticked items are hidden for {yearView} classes only; other years are not affected.
        </p>
      )}
      <div className="awListsGrid">
        {LIST_KINDS.map(([kind, title, usedBy]) => {
          const items = lists.filter(l => l.kind === kind);
          const offered = yearView ? items.filter(i => i.active && offeredIn(i, yearView)).length : items.filter(i => i.active).length;
          return (
            <section key={kind} className="awPanel awPadded">
              <div className="awKicker">Used by {usedBy}</div>
              <h3 className="awPanelTitle">
                {title} <small>{offered}{yearView ? ` in ${yearView}` : ''}</small>
              </h3>
              <ul className="awListItems">
                {items.map(item =>
                  yearView ? (
                    <li key={item.id} className={item.active ? '' : 'isOff'}>
                      <label className="awOffer">
                        <input type="checkbox" disabled={!item.active} checked={item.active && offeredIn(item, yearView)} onChange={() => toggleYear(item)} />
                        <span>{item.label}</span>
                      </label>
                    </li>
                  ) : (
                    <li key={item.id} className={item.active ? '' : 'isOff'}>
                      <input
                        defaultValue={item.label}
                        onBlur={e => {
                          const v = e.target.value.trim();
                          if (v && v !== item.label) save({ ...item, label: v }, 'Renamed.');
                        }}
                      />
                      <span className="awYearsTag" title="Change on a year group view">{yearsLabel(item, years)}</span>
                      <button
                        type="button"
                        className={`awMiniToggle ${item.active ? 'on' : ''}`}
                        title={item.active ? 'Switch off everywhere' : 'Switch on'}
                        onClick={() => save({ ...item, active: !item.active })}
                      >
                        <i />
                      </button>
                    </li>
                  )
                )}
              </ul>
              <form
                className="awAddOption wide"
                onSubmit={e => {
                  e.preventDefault();
                  const label = (adding[kind] || '').trim();
                  if (!label) return;
                  save(
                    { kind, label, sort_order: items.length + 1, year_groups: yearView ? [yearView] : [] },
                    yearView ? `${label} added for ${yearView}.` : `${label} added for all years.`
                  );
                  setAdding(a => ({ ...a, [kind]: '' }));
                }}
              >
                <input
                  value={adding[kind] || ''}
                  onChange={e => setAdding(a => ({ ...a, [kind]: e.target.value }))}
                  placeholder={yearView ? `Add to ${title.toLowerCase()} for ${yearView}` : `Add to ${title.toLowerCase()} (all years)`}
                />
                <button type="submit" aria-label="Add"><Plus /></button>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Portfolio section: verified school awards                           */
/* ------------------------------------------------------------------ */

/* "Inquirers" → "an Inquirer"; "Caring" → "caring". */
function lpPhrase(x = '') {
  const w = String(x).trim();
  if (!w) return '';
  if (/s$/i.test(w)) {
    const one = w.replace(/s$/i, '');
    return `${/^[aeiou]/i.test(one) ? 'an' : 'a'} ${one}`;
  }
  return w.toLowerCase();
}

/* An inspiring line for each school award, from what the award is. */
function schoolAwardNarrative(n, name) {
  const cat = n.category || '';
  const opt = String(n.option_label || '').toLowerCase();
  const award = String(name).toLowerCase();
  if (/gold/.test(award) || opt === 'gold')
    return `Gold${cat ? ` in ${cat}` : ''}: chosen by their teachers for going beyond what was asked${n.focus ? `, and for being ${lpPhrase(n.focus)}` : ''}.`;
  if (n.awards?.choose_first === 'learner_profile' || /learner profile/.test(award))
    return cat
      ? `Recognised for showing, day after day, what it means to be ${lpPhrase(cat)}.`
      : 'Recognised for living the Learner Profile, day after day.';
  if (opt === 'prize') return `A prize${cat ? ` in ${cat}` : ''}, earned through curiosity, persistence and work of real quality.`;
  if (opt === 'certificate') return `Recognised${cat ? ` in ${cat}` : ''} for excellent work and a commitment to doing it well.`;
  if (opt === 'effort') return `Celebrated for outstanding effort${cat ? ` in ${cat}` : ''}: the kind of progress that comes from never settling.`;
  if (/sport/.test(award)) return 'Honoured as one of the school’s outstanding sportspeople: talent matched by dedication.';
  if (/communit|service|contribution/.test(award)) return 'Recognised for making a difference to others, at school and beyond it.';
  if (/attendance/.test(award)) return 'Recognised for being there, every day: reliability that makes everything else possible.';
  if (/igcse|result|academic/.test(award)) return 'Recognised for outstanding results, the reward for steady, determined work.';
  return 'An honour from The British School, for qualities that go beyond grades.';
}

export function schoolAwardCards(rows = []) {
  return rows.map(n => {
    const name = n.awards?.name || 'School award';
    const opts = n.awards?.options || [];
    const single = opts.length <= 1;
    const title = single
      ? n.category ? `${n.option_label !== 'Awarded' ? `${n.option_label} · ` : ''}${n.category}` : name
      : `${n.option_label}${n.category ? ` · ${n.category}` : ''}`;
    return {
      id: `school-${n.id}`,
      kind: 'school',
      label: name,
      category: n.category || '',
      title,
      team: `${n.term} · ${n.academic_year}${n.focus ? ` · Focus: ${n.focus}` : ''}`,
      sport: '',
      date: String(n.reviewed_at || n.entered_at || '').slice(0, 10),
      narrative: schoolAwardNarrative(n, name) + (n.entered_by_name && !n.reason ? ` Nominated by ${n.entered_by_name}.` : ''),
      story: `${name}${title !== name ? ` — ${title}` : ''}, ${n.term} ${n.academic_year}${n.focus ? ` (Learner Profile focus: ${n.focus})` : ''}.`,
      quote: n.reason || '',
      quoteBy: n.reason ? n.entered_by_name || 'Teacher' : '',
      comment: n.reason || '',
      commentBy: n.reason ? n.entered_by_name || '' : '',
      plain: schoolAwardNarrative(n, name)
    };
  });
}

export { deleteNomination };
