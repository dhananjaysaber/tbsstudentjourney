import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Clock3, Lock, PenLine, Search, X } from 'lucide-react';

import {
  loadYearGroups,
  privateEvidenceBlobUrl,
  searchDirectory,
  submitAccessRequest
} from '../journeyApi';

import './BrowsePortfolios.css';
import { friendlyError } from '../lib/friendly';

const OPEN_ACCESS = ['staff', 'own', 'community', 'granted'];

function initialsOf(person) {
  if (person.initials) return person.initials;
  return String(person.name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');
}

/* Real photo only when the portfolio is open to this member; otherwise initials. */
function Portrait({ person }) {
  const [src, setSrc] = useState('');
  const open = OPEN_ACCESS.includes(person.access);

  useEffect(() => {
    let alive = true;
    let url = '';
    if (open && person.photoId) {
      privateEvidenceBlobUrl(person.photoId)
        .then(blobUrl => {
          url = blobUrl;
          if (alive) setSrc(blobUrl);
          else URL.revokeObjectURL(blobUrl);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [person.photoId, open]);

  return (
    <span className={`bpPortrait ${open ? 'isOpen' : ''}`}>
      {src ? <img src={src} alt="" /> : <b>{initialsOf(person)}</b>}
    </span>
  );
}

/* Browse every student's portfolio — server-side search, nothing preloaded. */
export default function BrowsePortfolios({ onEdit }) {
  const [years, setYears] = useState([]);
  const [year, setYear] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ loading: false, error: '', total: 0, people: null });
  const [requested, setRequested] = useState({});
  const requestId = useRef(0);

  useEffect(() => {
    loadYearGroups().then(setYears).catch(() => setYears([]));
  }, []);

  const active = query.trim().length >= 2 || Boolean(year);

  useEffect(() => {
    if (!active) {
      setState({ loading: false, error: '', total: 0, people: null });
      return undefined;
    }

    const id = ++requestId.current;
    setState(current => ({ ...current, loading: true, error: '' }));

    const timer = window.setTimeout(() => {
      searchDirectory({ q: query.trim().length >= 2 ? query : '', year })
        .then(result => {
          if (id === requestId.current) setState({ loading: false, error: '', ...result });
        })
        .catch(error => {
          if (id === requestId.current) {
            setState({ loading: false, error: friendlyError(error, 'Search is taking a short break. Please try again in a moment.'), total: 0, people: [] });
          }
        });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [query, year, active]);

  async function request(person) {
    setRequested(current => ({ ...current, [person.key]: 'sending' }));
    try {
      await submitAccessRequest({ key: person.key, message: '', website: '' });
      setRequested(current => ({ ...current, [person.key]: 'sent' }));
    } catch (error) {
      setRequested(current => ({ ...current, [person.key]: friendlyError(error, 'Your request couldn’t be sent. Please try again.') }));
    }
  }

  const summary = useMemo(() => {
    if (!state.people) return '';
    if (!state.total) return 'No portfolios match.';
    if (state.total > state.people.length) {
      return `Showing ${state.people.length} of ${state.total} — add a name or year group to narrow it down.`;
    }
    return `${state.total} portfolio${state.total === 1 ? '' : 's'}`;
  }, [state]);

  return (
    <section className="bp">
      <header className="bpHead">
        <small>TBS STUDENT PORTFOLIO</small>
        <h2>Browse portfolios</h2>
        <p>Find any student by name or year group. Results load only when you search.</p>
      </header>

      <div className="bpBar">
        <label className="bpSearch">
          <Search />
          <input
            type="search"
            value={query}
            placeholder="Search by student name"
            onChange={event => setQuery(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" aria-label="Clear" onClick={() => setQuery('')}>
              <X />
            </button>
          )}
        </label>

        <label className="bpYear">
          <span className="bpVisuallyHidden">Year group</span>
          <select value={year} onChange={event => setYear(event.target.value)}>
            <option value="">All year groups</option>
            {years.map(item => (
              <option key={item} value={item}>
                {/^(year\s|reception$|nursery$)/i.test(item) ? item : `\u00a0\u00a0\u00a0${item}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!active && (
        <div className="bpEmpty">
          <Search />
          <p>Type at least two letters of a name, or choose a year group.</p>
        </div>
      )}

      {active && (
        <p className="bpSummary" aria-live="polite">
          {state.loading ? 'Searching…' : state.error || summary}
        </p>
      )}

      {active && state.people?.length > 0 && (
        <div className={`bpGrid ${state.loading ? 'isLoading' : ''}`}>
          {state.people.map(person => {
            const open = OPEN_ACCESS.includes(person.access);
            const canEdit = (person.access === 'own' || person.access === 'staff') && person.studentId;
            const sent = requested[person.key];

            return (
              <article key={person.key} className="bpCard">
                <Portrait person={person} />
                <div className="bpCardText">
                  <b>{person.name}</b>
                  <small>{person.yearGroup || 'The British School'}</small>
                </div>

                <div className="bpCardActions">
                  {open ? (
                    <a className="bpBtn isPrimary" href={`/portfolio/${encodeURIComponent(person.key)}`}>
                      View <ArrowUpRight />
                    </a>
                  ) : person.pending || sent === 'sent' ? (
                    <span className="bpBtn isPending">
                      <Clock3 /> Requested
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="bpBtn"
                      disabled={sent === 'sending'}
                      onClick={() => request(person)}
                    >
                      <Lock /> {sent === 'sending' ? 'Sending…' : 'Request access'}
                    </button>
                  )}

                  {canEdit && (
                    <button type="button" className="bpBtn" onClick={() => onEdit?.(person)}>
                      <PenLine /> Edit
                    </button>
                  )}
                </div>

                {sent && !['sending', 'sent'].includes(sent) && <p className="bpError">{sent}</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
