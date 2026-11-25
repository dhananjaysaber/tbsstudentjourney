import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Check, Globe2, Inbox, Mail, RefreshCw, Search, UserCheck, X } from 'lucide-react';

import {
  loadAccessRequests,
  matchAccessRequest,
  reviewAccessRequest,
  revokeAccessGrant,
  searchStudents
} from '../journeyApi';

import './AccessRequests.css';
import { friendlyError } from '../lib/friendly';

const FILTERS = [
  ['pending', 'Pending'],
  ['approved', 'Approved'],
  ['declined', 'Declined'],
  ['all', 'All']
];

function when(value) {
  if (!value) return '';
  const date = new Date(value);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 1 && days > -1) return 'today';
  if (days === 1) return 'yesterday';
  if (days > 1 && days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateOnly(value) {
  return value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
}

function replyLink(request) {
  const student = request.student?.full_name || 'the student';
  const subject = `Your request to view ${student}’s portfolio`;
  const body =
    request.requester_type === 'member'
      ? `Dear ${request.requester_name},\n\nYour request to view ${student}’s TBS Student Portfolio has been approved. Sign in to the TBS Student Portfolio page and open it from “View all portfolios”. Access lasts 30 days.\n\nWith best wishes,\nThe British School, New Delhi`
      : `Dear ${request.requester_name},\n\nThank you for your interest in ${student}’s TBS Student Portfolio. Your request has been approved. Here is a private link:\n\n[paste the secure link from Public Sharing]\n\nThe link expires automatically.\n\nWith best wishes,\nThe British School, New Delhi`;
  return `mailto:${encodeURIComponent(request.requester_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* Requests from the sign-in page arrive without a student: the SuperAdmin
 * finds the student the visitor named, then approves as usual. */
function MatchStudent({ hint, busy, onPick }) {
  const [q, setQ] = useState(hint || '');
  const [results, setResults] = useState([]);
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    let alive = true;
    setLooking(true);
    const timer = window.setTimeout(() => {
      searchStudents(q)
        .then(rows => alive && setResults(rows.slice(0, 6)))
        .catch(() => alive && setResults([]))
        .finally(() => alive && setLooking(false));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [q]);

  return (
    <div className="arMatch">
      <label>
        <Search size={14} />
        <input value={q} onChange={event => setQ(event.target.value)} placeholder="Find the student by name" />
      </label>
      {q.trim().length >= 2 && (
        <ul>
          {looking && !results.length && <li className="arMatchNote">Searching…</li>}
          {!looking && !results.length && <li className="arMatchNote">No student matches “{q.trim()}”.</li>}
          {results.map(student => (
            <li key={student.student_id}>
              <button type="button" disabled={busy} onClick={() => onPick(student)}>
                <b>{student.full_name}</b>
                <small>{student.year_group || 'The British School'}</small>
                <span>Choose</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AccessRequests({ onOpenSharing, onCountChange }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [state, setState] = useState({ loading: true, error: '' });
  const [busyId, setBusyId] = useState('');

  async function refresh() {
    setState({ loading: true, error: '' });
    try {
      const list = await loadAccessRequests();
      setRows(list);
      onCountChange?.(list.filter(row => row.status === 'pending').length);
      setState({ loading: false, error: '' });
    } catch (error) {
      setState({
        loading: false,
        error: friendlyError(error, 'Requests will appear here soon. Please check back in a little while.')
      });
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function act(row, work) {
    setBusyId(row.id);
    try {
      await work();
      await refresh();
    } catch (error) {
      setState(current => ({ ...current, error: friendlyError(error) }));
    } finally {
      setBusyId('');
    }
  }

  const shown = useMemo(
    () => (filter === 'all' ? rows : rows.filter(row => row.status === filter)),
    [rows, filter]
  );

  const counts = useMemo(() => {
    const out = { all: rows.length, pending: 0, approved: 0, declined: 0 };
    rows.forEach(row => {
      out[row.status] = (out[row.status] || 0) + 1;
    });
    return out;
  }, [rows]);

  return (
    <section className="panel accessRequests">
      <div className="panelHead">
        <div>
          <small>SUPERADMIN</small>
          <h2>Access requests</h2>
        </div>
        <button className="ghost" onClick={refresh} disabled={state.loading}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <p className="arIntro">
        Requests to view private portfolios come only to you. <b>Members</b> (parents, students, staff)
        get 30 days of access in the app when you approve. <b>Visitors</b> can only view through a
        secure link you send them.
      </p>

      <div className="arFilters" role="tablist">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? 'on' : ''}
            onClick={() => setFilter(value)}
          >
            {label}
            <small>{counts[value] || 0}</small>
          </button>
        ))}
      </div>

      {state.error && <div className="arError">{state.error}</div>}

      {!state.error && !state.loading && !shown.length && (
        <div className="arEmpty">
          <Inbox />
          <p>{filter === 'pending' ? 'No requests waiting.' : 'Nothing here yet.'}</p>
        </div>
      )}

      <div className="arList">
        {shown.map(row => {
          const member = row.requester_type === 'member';
          const grantLive =
            row.grant && !row.grant.revoked_at && new Date(row.grant.expires_at) > new Date();

          return (
            <article key={row.id} className={`arItem is-${row.status}`}>
              <header>
                <div>
                  <b>
                    {row.requester_name}
                    <span className={`arType ${member ? 'isMember' : ''}`}>
                      {member ? 'TBS member' : 'Visitor'}
                    </span>
                  </b>
                  <a href={`mailto:${row.requester_email}`}>{row.requester_email}</a>
                </div>
                <span className="arStatus">{row.status}</span>
              </header>

              <dl>
                <div>
                  <dt>Portfolio</dt>
                  <dd>
                    {row.student_id
                      ? `${row.student?.full_name || 'Student'}${row.student?.year_group ? ` · ${row.student.year_group}` : ''}`
                      : 'Not matched yet · from the sign-in page'}
                  </dd>
                </div>
                {row.student_hint && (
                  <div>
                    <dt>Visitor typed</dt>
                    <dd>“{row.student_hint}”</dd>
                  </div>
                )}
                <div>
                  <dt>Relationship</dt>
                  <dd>{row.relationship || '—'}</dd>
                </div>
                <div>
                  <dt>Received</dt>
                  <dd>{when(row.created_at)}</dd>
                </div>
              </dl>

              {row.message && <blockquote>“{row.message}”</blockquote>}

              {!row.student_id && row.status === 'pending' && (
                <MatchStudent
                  hint={row.student_hint}
                  busy={busyId === row.id}
                  onPick={student => act(row, () => matchAccessRequest(row.id, student.student_id))}
                />
              )}

              <footer>
                {row.status === 'pending' ? (
                  <>
                    <button
                      className="primary"
                      disabled={busyId === row.id || !row.student_id}
                      title={row.student_id ? undefined : 'Find the student first'}
                      onClick={() => act(row, () => reviewAccessRequest(row, 'approved'))}
                    >
                      {member ? <UserCheck /> : <Check />}
                      {member ? 'Approve · 30 days' : 'Approve'}
                    </button>
                    <button
                      className="ghost"
                      disabled={busyId === row.id}
                      onClick={() => act(row, () => reviewAccessRequest(row, 'declined'))}
                    >
                      <X size={15} /> Decline
                    </button>
                  </>
                ) : (
                  <span className="arReviewed">
                    {row.status === 'approved' ? 'Approved' : 'Declined'} {when(row.reviewed_at)}
                  </span>
                )}

                {row.status === 'approved' && member && row.grant && (
                  <span className={`arGrant ${grantLive ? 'isLive' : ''}`}>
                    {row.grant.revoked_at
                      ? `Access revoked ${dateOnly(row.grant.revoked_at)}`
                      : grantLive
                      ? `Access until ${dateOnly(row.grant.expires_at)}`
                      : `Access expired ${dateOnly(row.grant.expires_at)}`}
                  </span>
                )}

                {row.status === 'approved' && (
                  <a className="ghost arLinkBtn" href={replyLink(row)}>
                    <Mail size={15} /> Reply by email
                  </a>
                )}

                {grantLive && (
                  <button
                    className="ghost"
                    disabled={busyId === row.id}
                    onClick={() => act(row, () => revokeAccessGrant(row.grant.id))}
                  >
                    <Ban size={15} /> Revoke access
                  </button>
                )}

                {row.status === 'approved' && !member && (
                  <button className="ghost" onClick={() => onOpenSharing?.(row)}>
                    <Globe2 size={15} /> Create secure link
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
