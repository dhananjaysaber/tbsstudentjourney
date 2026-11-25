import React, { useEffect, useMemo, useState } from 'react';
import { Check, EyeOff, Eye, Lock, MessageSquareQuote, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { AwardStage, AwardsLoading, Empty, useFlash } from './Awards';
import {
  COMMENT_CATEGORIES,
  SUGGESTED_LINES,
  addCommentLine,
  deleteCommentLine,
  loadAllCommentLines,
  updateCommentLine
} from '../awardCommentsApi';
import { friendlyError } from '../lib/friendly';
import './AwardComments.css';

/* =========================================================================
   AWARD COMMENTS · SuperAdmin and Coaches
   The lines shown on award cards in the portfolio. Each award gets one
   line from the list that matches its type (and criterion, e.g. Effort),
   so students with the same award read different, school-written lines.
   ========================================================================= */

const MAX = 240;
const ANY = '';
const STARTER_CRITERIA = ['Effort', 'Improvement', 'Teamwork', 'Leadership', 'Attitude'];

export default function AwardComments({ email, superadmin = false, roleLabel }) {
  const [lines, setLines] = useState(undefined);
  const [loadError, setLoadError] = useState('');
  const [category, setCategory] = useState('coach_award');
  const [criterion, setCriterion] = useState('Effort');
  const [extraCriteria, setExtraCriteria] = useState([]);
  const [newCriterion, setNewCriterion] = useState('');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, say] = useFlash();

  const cat = COMMENT_CATEGORIES.find(c => c.id === category);
  const canEdit = superadmin || cat.panthers;

  async function refresh() {
    try {
      setLines(await loadAllCommentLines());
      setLoadError('');
    } catch (error) {
      setLines([]);
      setLoadError(friendlyError(error));
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  const ofCategory = useMemo(() => (lines || []).filter(l => l.category === category), [lines, category]);

  const criteria = useMemo(() => {
    if (!cat.hasCriteria) return [];
    const names = new Set([
      ...ofCategory.map(l => l.criteria).filter(Boolean),
      ...extraCriteria.filter(x => x.category === category).map(x => x.name),
      ...(category === 'coach_award' ? STARTER_CRITERIA : [])
    ]);
    return [...names];
  }, [ofCategory, extraCriteria, category, cat.hasCriteria]);

  const activeCriterion = cat.hasCriteria ? criterion : ANY;
  const shown = ofCategory.filter(l => (l.criteria || '') .toLowerCase() === (activeCriterion || '').toLowerCase());
  const countFor = name => ofCategory.filter(l => (l.criteria || '').toLowerCase() === (name || '').toLowerCase()).length;

  function pickCategory(id) {
    const next = COMMENT_CATEGORIES.find(c => c.id === id);
    setCategory(id);
    setEditing(null);
    setConfirmDelete(null);
    setDraft('');
    setCriterion(id === 'coach_award' ? 'Effort' : ANY);
    if (!next.hasCriteria) setCriterion(ANY);
  }

  function addCriterion(event) {
    event.preventDefault();
    const name = newCriterion.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const exists = criteria.find(c => c.toLowerCase() === name.toLowerCase());
    if (!exists) setExtraCriteria(list => [...list, { category, name }]);
    setCriterion(exists || name);
    setNewCriterion('');
  }

  async function run(task, message) {
    setBusy(true);
    try {
      await task();
      if (message) say(message);
      await refresh();
    } catch (error) {
      say(friendlyError(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function add(event) {
    event.preventDefault();
    const body = draft.trim();
    if (body.length < 10) return say('Write at least a short sentence (10+ characters).', 'error');
    run(async () => {
      await addCommentLine({ category, criteria: activeCriterion, body }, email);
      setDraft('');
    }, 'Line added');
  }

  function addSuggested() {
    const pool = SUGGESTED_LINES[category] || {};
    const key = cat.hasCriteria ? Object.keys(pool).find(k => k.toLowerCase() === (activeCriterion || '').toLowerCase()) ?? '' : '';
    const suggestions = (pool[key] || []).filter(body => !shown.some(l => l.body === body));
    if (!suggestions.length) return say('No suggestions for this one. Write your own below.', 'error');
    run(async () => {
      for (const body of suggestions) {
        // eslint-disable-next-line no-await-in-loop
        await addCommentLine({ category, criteria: cat.hasCriteria ? activeCriterion : '', body }, email);
      }
    }, `${suggestions.length} suggested line${suggestions.length === 1 ? '' : 's'} added. Edit them to suit.`);
  }

  if (lines === undefined) return <AwardsLoading />;

  const hasSuggestion = (() => {
    const pool = SUGGESTED_LINES[category] || {};
    const key = cat.hasCriteria ? Object.keys(pool).find(k => k.toLowerCase() === (activeCriterion || '').toLowerCase()) : '';
    return Boolean(key !== undefined && (pool[key ?? ''] || []).length);
  })();

  return (
    <div className="awPage acPage">
      <AwardStage
        eyebrow={`Award comments · ${roleLabel || (superadmin ? 'SuperAdmin' : 'Coach')}`}
        title={<>The words on <em>every award card</em></>}
        sub="Write the lines families see under each award on a student's portfolio. Each award picks one line from the matching list, so students with the same award read different lines. A coach's own comment on an award is still shown as the quote."
        watermark="Words"
      />
      {flash}
      {loadError && <p className="acError">{loadError}</p>}

      <div className="acTabs" role="tablist" aria-label="Award type">
        {COMMENT_CATEGORIES.map(c => {
          const locked = !superadmin && !c.panthers;
          const count = (lines || []).filter(l => l.category === c.id && l.active).length;
          return (
            <button
              type="button"
              role="tab"
              key={c.id}
              aria-selected={category === c.id}
              className={`acTab is-${c.kind} ${category === c.id ? 'on' : ''}`}
              onClick={() => pickCategory(c.id)}
            >
              <i aria-hidden="true" />
              <span>{c.label}</span>
              {locked ? <Lock className="acLock" aria-label="Admin and SuperAdmin only" /> : <small>{count}</small>}
            </button>
          );
        })}
      </div>

      <div className={`acBody ${cat.hasCriteria ? 'hasCriteria' : ''}`}>
        {cat.hasCriteria && (
          <aside className="acCriteria">
            <div className="acSideHead">
              <b>{category === 'school' ? 'Award' : 'Criterion'}</b>
              <small>
                {category === 'school'
                  ? 'Matched to the school award name, e.g. Going for Gold.'
                  : 'Matched to the award title, e.g. “Best Effort” → Effort.'}
              </small>
            </div>
            <button
              type="button"
              className={`acCrit ${activeCriterion === ANY ? 'on' : ''}`}
              onClick={() => setCriterion(ANY)}
            >
              <span>Any {category === 'school' ? 'school award' : 'Coach’s Award'}</span>
              <small>{countFor(ANY)}</small>
            </button>
            {criteria.map(name => (
              <button
                type="button"
                key={name}
                className={`acCrit ${activeCriterion.toLowerCase() === name.toLowerCase() ? 'on' : ''}`}
                onClick={() => setCriterion(name)}
              >
                <span>{name}</span>
                <small>{countFor(name)}</small>
              </button>
            ))}
            {canEdit && (
              <form className="acAddCrit" onSubmit={addCriterion}>
                <input
                  value={newCriterion}
                  onChange={e => setNewCriterion(e.target.value)}
                  placeholder={category === 'school' ? 'Add an award name' : 'Add a criterion'}
                  maxLength={40}
                  aria-label={category === 'school' ? 'New award name' : 'New criterion'}
                />
                <button type="submit" aria-label="Add" disabled={!newCriterion.trim()}><Plus /></button>
              </form>
            )}
          </aside>
        )}

        <section className="acLines">
          <header className="acLinesHead">
            <div>
              <small>{cat.label}</small>
              <h2>{cat.hasCriteria ? (activeCriterion || (category === 'school' ? 'Any school award' : 'Any Coach’s Award')) : 'All awards'}</h2>
            </div>
            <span className="acCount">{shown.filter(l => l.active).length} shown · {shown.filter(l => !l.active).length} hidden</span>
          </header>

          <p className="acHint">
            {cat.hasCriteria && activeCriterion
              ? <>Used for {category === 'school' ? 'the award' : 'Coach’s Awards whose title includes'} <b>{activeCriterion}</b>. If this list is empty, the “Any” list is used.</>
              : cat.hasCriteria
                ? <>Used when no criterion matches the award.</>
                : <>Used for every {cat.label} card.</>}{' '}
            With no lines at all, the card shows a plain factual line.
          </p>

          {!canEdit && (
            <div className="acLocked"><Lock /> School award lines are managed by Admin and SuperAdmin.</div>
          )}

          {shown.length === 0 ? (
            <Empty
              icon={<MessageSquareQuote />}
              title="No lines yet"
              text="Write one or two short lines below. Keep each to one sentence about what the award recognises."
              action={
                canEdit && hasSuggestion ? (
                  <button type="button" className="acGhost" onClick={addSuggested} disabled={busy}>
                    <Sparkles /> Add suggested lines
                  </button>
                ) : null
              }
            />
          ) : (
            <ol className="acList">
              {shown.map(line => (
                <li key={line.id} className={line.active ? '' : 'isHidden'}>
                  {editing?.id === line.id ? (
                    <form
                      className="acEdit"
                      onSubmit={event => {
                        event.preventDefault();
                        const body = editing.body.trim();
                        if (body.length < 10) return say('Write at least a short sentence (10+ characters).', 'error');
                        run(async () => {
                          await updateCommentLine(line.id, { body });
                          setEditing(null);
                        }, 'Line saved');
                      }}
                    >
                      <textarea
                        value={editing.body}
                        maxLength={MAX}
                        rows={2}
                        autoFocus
                        onChange={e => setEditing({ ...editing, body: e.target.value })}
                      />
                      <div className="acRowActions">
                        <span className="acChars">{editing.body.length}/{MAX}</span>
                        <button type="button" className="acGhost" onClick={() => setEditing(null)}><X /> Cancel</button>
                        <button type="submit" className="acMain" disabled={busy}><Check /> Save</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p>“{line.body}”</p>
                      {canEdit && (
                        <div className="acRowActions">
                          {!line.active && <span className="acTag">Hidden</span>}
                          <button
                            type="button"
                            className="acIcon"
                            title={line.active ? 'Hide from cards' : 'Show on cards'}
                            aria-label={line.active ? 'Hide from cards' : 'Show on cards'}
                            onClick={() => run(() => updateCommentLine(line.id, { active: !line.active }), line.active ? 'Hidden from cards' : 'Shown on cards')}
                            disabled={busy}
                          >
                            {line.active ? <EyeOff /> : <Eye />}
                          </button>
                          <button type="button" className="acIcon" title="Edit" aria-label="Edit" onClick={() => setEditing({ id: line.id, body: line.body })}>
                            <Pencil />
                          </button>
                          {confirmDelete === line.id ? (
                            <span className="acConfirm">
                              Delete?
                              <button type="button" className="acDanger" onClick={() => run(async () => { await deleteCommentLine(line.id); setConfirmDelete(null); }, 'Line deleted')}>Yes</button>
                              <button type="button" className="acGhost" onClick={() => setConfirmDelete(null)}>No</button>
                            </span>
                          ) : (
                            <button type="button" className="acIcon" title="Delete" aria-label="Delete" onClick={() => setConfirmDelete(line.id)}>
                              <Trash2 />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}

          {canEdit && (
            <form className="acAdd" onSubmit={add}>
              <label htmlFor="acNewLine">Add a line</label>
              <textarea
                id="acNewLine"
                value={draft}
                maxLength={MAX}
                rows={2}
                onChange={e => setDraft(e.target.value)}
                placeholder={
                  category === 'coach_award'
                    ? 'e.g. Recognised by the coaches for giving full effort in every session.'
                    : category === 'player_of_month'
                      ? 'e.g. Chosen by the coaches for consistent commitment this month.'
                      : category === 'player_of_match'
                        ? 'e.g. Named Player of the Match by the coaching staff.'
                        : 'e.g. Recognised by the school for living the Learner Profile.'
                }
              />
              <div className="acRowActions">
                <span className="acChars">{draft.length}/{MAX}</span>
                {shown.length > 0 && hasSuggestion && (
                  <button type="button" className="acGhost" onClick={addSuggested} disabled={busy}><Sparkles /> Suggestions</button>
                )}
                <button type="submit" className="acMain" disabled={busy || draft.trim().length < 10}><Plus /> Add line</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
