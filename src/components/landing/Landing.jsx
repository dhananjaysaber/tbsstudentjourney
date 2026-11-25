import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  GraduationCap,
  LayoutGrid,
  Lock,
  LogIn,
  LogOut,
  PenLine,
  Search,
  ShieldCheck,
  Shuffle,
  X
} from 'lucide-react';

import { supabase, supabaseUrl } from '../../supabase';
import {
  loadDirectory,
  privateEvidenceBlobUrl,
  searchDirectory,
  submitAccessRequest
} from '../../journeyApi';
import { createSky } from './sky';
import OrbitField from './OrbitField';
import { cardOf } from './cards';
import { TBS_LOGO, TBS_LOGO_WHITE, useColourLogo } from '../../lib/brand';
import ThemeToggle from '../ThemeToggle';
import { useTheme } from '../../lib/theme';

import './Landing.css';
import { friendlyError } from '../../lib/friendly';
import { rankByName } from '../../lib/nameSearch';

/* Sign in, then come straight back to this landing page. */
const LOGIN_TO_GALLERY = `/login?next=${encodeURIComponent('/')}`;
const OPEN_ACCESS = ['staff', 'own', 'community', 'granted'];

const RELATIONSHIPS = [
  'Parent / guardian',
  'Family member',
  'University / admissions',
  'Employer / internship',
  'Coach / mentor',
  'Teacher',
  'Other'
];

/* Short label shown when hovering a card. */
function cardStatus(person, member) {
  if (!member) return 'Private portfolio';
  if (person.access === 'own') return 'Your portfolio';
  if (person.access === 'granted') return 'Access granted';
  if (person.open) return 'View portfolio';
  if (person.pending) return 'Request pending';
  return 'Request access';
}

export function initialsOf(person) {
  if (person.initials) return person.initials;
  return String(person.name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('') || '•';
}

export function firstNameOf(person) {
  return String(person.name || '').trim().split(/\s+/)[0] || '';
}

/* Longer names get slightly smaller type so they fit the card. */
function nameSize(label) {
  if (label.length > 11) return 'isLonger';
  if (label.length > 8) return 'isLong';
  return '';
}

/* "Yuvraj Singh Sahni" → "Yuvraj S." (first name + last-name initial). */
export function shortNameOf(person) {
  const parts = String(person.name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/* Real photo only for portfolios that are open to the viewer;
 * otherwise the student's initials. */
function Avatar({ person, photo, size = 40, shape = 'circle' }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(photo && !failed);
  return (
    <span
      className={`ldAvatar is-${shape} ${person.open ? 'isOpen' : ''} ${showPhoto ? 'hasPhoto' : ''}`}
      style={size ? { width: size, height: size, minWidth: size, minHeight: size } : undefined}
    >
      {showPhoto ? (
        <img src={photo} alt="" onError={() => setFailed(true)} />
      ) : (
        <b className="ldInitials">{initialsOf(person)}</b>
      )}
    </span>
  );
}

/* A graduation cap. The tassel swings; the whole cap spins now and then. */
function Mortarboard() {
  return (
    <svg className="ldCapSvg" viewBox="0 0 48 32" aria-hidden="true">
      <path className="ldCapBase" d="M11 13.6V22.4C11 25.2 16.8 27.4 24 27.4S37 25.2 37 22.4V13.6L24 18.6Z" />
      <path className="ldCapBoard" d="M24 2.2 46 10.4 24 18.6 2 10.4Z" />
      <path className="ldCapEdge" d="M2 10.4 24 18.6 46 10.4" />
      <g className="ldCapTassel">
        <path d="M24 10.4 39.5 12.6V22.6" />
        <rect x="37.9" y="22" width="3.2" height="6.4" rx="1.4" />
      </g>
      <circle className="ldCapButton" cx="24" cy="10.4" r="1.8" />
    </svg>
  );
}

/* Photos for the cards, shared through context so a photo arriving only
 * re-renders its own card (not the whole field). */
const CardPhotos = createContext({});

/* Visitors get a tiny 24px copy from the server, shown heavily blurred:
 * never the real photo. */
const visitorThumb = person =>
  person.photoId ? `${supabaseUrl}/functions/v1/journey-media?evidence=${encodeURIComponent(person.photoId)}` : '';

function CardFace({ person, member }) {
  const photos = useContext(CardPhotos);
  const [failed, setFailed] = useState(false);
  const src = member ? photos[person.key] : visitorThumb(person);
  if (src && !failed) {
    return (
      <span className={`ldCardFace hasPhoto ${member ? '' : 'isBlurred'}`}>
        <img src={src} alt="" loading="lazy" draggable="false" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className="ldCardFace">
      <b>{initialsOf(person)}</b>
    </span>
  );
}

/* One student card in space: the clear photo for members; for visitors a
 * blurred tiny copy and the first name only. */
function StudentCard({ person, member }) {
  const tone = person.open ? 'isOpen' : person.pending ? 'isPending' : '';
  const look = cardOf(person);
  const style = {
    '--ribbon': look.ribbon,
    '--tilt': `${look.tilt}deg`,
    '--spin-delay': `${look.spinDelay}s`,
    '--sway': `${look.sway}s`
  };
  return (
    <span className={`ldCard ${tone} ${member ? '' : 'isPrivate'}`} style={style}>
      <span className="ldCardPhoto">
        <CardFace person={person} member={member} />
        <span className="ldCap">
          <Mortarboard />
        </span>
        {member && !person.open && (
          <i className={`ldCardBadge ${person.pending ? 'isPending' : ''}`}>{person.pending ? <Clock3 /> : <Lock />}</i>
        )}
      </span>
      {member ? (
        <span className={`ldCardName ${nameSize(shortNameOf(person))}`}>{shortNameOf(person)}</span>
      ) : person.firstName ? (
        <span className={`ldCardName ${nameSize(person.firstName)}`}>{person.firstName}</span>
      ) : (
        <span className="ldCardRedacted" aria-hidden="true">
          <i />
          <i />
        </span>
      )}
      <span className="ldCardRibbon" aria-hidden="true" />
      <span className={`ldStarTip ${tone}`}>{cardStatus(person, member)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Request access                                                      */
/* ------------------------------------------------------------------ */

/* Request access to a private portfolio.
 * general: from the sign-in page, without choosing a student first — the
 * visitor types the student's name and the SuperAdmin matches it. */
export function RequestAccess({ person = null, member = false, photo = '', general = false, onClose, onSent }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    relationship: RELATIONSHIPS[2],
    studentName: '',
    message: '',
    website: ''
  });
  const [state, setState] = useState({ busy: false, error: '', done: false });
  const firstField = useRef(null);
  const pending = member && person?.pending;

  useEffect(() => {
    firstField.current?.focus();
    const onKey = event => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    if (state.busy) return;
    setState({ busy: true, error: '', done: false });
    try {
      await submitAccessRequest(
        general
          ? { ...form }
          : member
          ? { key: person.key, message: form.message, website: form.website }
          : { key: person.key, ...form }
      );
      setState({ busy: false, error: '', done: true });
      onSent?.(person);
    } catch (error) {
      setState({ busy: false, error: friendlyError(error, 'Your request couldn’t be sent. Please try again.'), done: false });
    }
  }

  return (
    <div className="ldModalBackdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="ldModal" role="dialog" aria-modal="true" aria-labelledby="ldRequestTitle">
        <button type="button" className="ldModalClose" aria-label="Close" onClick={onClose}>
          <X />
        </button>

        <header className="ldModalHead">
          {general ? (
            <span className="ldAvatar is-square ldAvatarIcon" style={{ width: 68, height: 68, minWidth: 68 }}>
              <GraduationCap />
            </span>
          ) : (
            <Avatar person={person} photo={photo} size={68} shape="square" />
          )}
          <div>
            <small>
              <Lock /> {general ? 'For people outside TBS' : 'Private portfolio'}
            </small>
            <h2 id="ldRequestTitle">{member && person ? person.name : 'Request access'}</h2>
            <span>
              {member && person
                ? `${person.yearGroup ? `${person.yearGroup} · ` : ''}The British School, New Delhi`
                : 'Portfolios are private to the TBS community.'}
            </span>
          </div>
        </header>

        {pending ? (
          <div className="ldModalDone">
            <Clock3 className="isPending" />
            <h3>Request pending</h3>
            <p>You’ve already asked to view this portfolio. The SuperAdmin will review it and you’ll be able to open it here once it’s approved.</p>
            <button type="button" className="ldPrimary" onClick={onClose}>
              {general ? 'Close' : 'Back to portfolios'}
            </button>
          </div>
        ) : state.done ? (
          <div className="ldModalDone">
            <CheckCircle2 />
            <h3>Request sent</h3>
            <p>
              {member
                ? 'The SuperAdmin will review your request. Once approved, the portfolio opens for you here for 30 days.'
                : <>The school’s portfolio administrator will review your request. If it’s approved, you’ll receive a private link at <b>{form.email}</b>.</>}
            </p>
            <button type="button" className="ldPrimary" onClick={onClose}>
              {general ? 'Close' : 'Back to portfolios'}
            </button>
          </div>
        ) : (
          <form className="ldForm" onSubmit={submit}>
            {member ? (
              <p className="ldFormIntro">
                This portfolio is private. Your request goes to the SuperAdmin with your TBS account
                details — just add a note if it helps.
              </p>
            ) : (
              <p className="ldFormIntro">
                To protect our students’ privacy, names and photos are visible only to the TBS
                community. Tell us who you are and the SuperAdmin will review your request.
              </p>
            )}

            {!member && (
              <>
                <div className="ldFormRow">
                  <label>
                    <span>Your full name</span>
                    <input
                      ref={firstField}
                      required
                      minLength={2}
                      maxLength={120}
                      autoComplete="name"
                      value={form.name}
                      onChange={update('name')}
                    />
                  </label>
                  <label>
                    <span>Email</span>
                    <input
                      required
                      type="email"
                      maxLength={200}
                      autoComplete="email"
                      value={form.email}
                      onChange={update('email')}
                    />
                  </label>
                </div>

                <div className="ldFormRow">
                  <label>
                    <span>Your relationship</span>
                    <select value={form.relationship} onChange={update('relationship')}>
                      {RELATIONSHIPS.map(item => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Student’s name {general ? null : <em>(if known)</em>}</span>
                    <input
                      required={general}
                      minLength={general ? 2 : undefined}
                      maxLength={120}
                      value={form.studentName}
                      onChange={update('studentName')}
                    />
                  </label>
                </div>
              </>
            )}

            <label>
              <span>{member ? 'Note for the SuperAdmin' : 'Why would you like to view it?'} <em>(optional)</em></span>
              <textarea
                ref={member ? firstField : undefined}
                rows={3}
                maxLength={1000}
                value={form.message}
                onChange={update('message')}
                placeholder={member ? 'e.g. We are on the same debate team.' : 'e.g. Reviewing an application for our summer programme.'}
              />
            </label>

            <label className="ldHoney" aria-hidden="true">
              Website
              <input tabIndex={-1} autoComplete="off" value={form.website} onChange={update('website')} />
            </label>

            {state.error && (
              <div className="ldFormError" role="alert">
                {state.error}
              </div>
            )}

            <div className="ldFormActions">
              {!member && !general && (
                <a className="ldGhost" href={LOGIN_TO_GALLERY}>
                  I’m a TBS member
                </a>
              )}
              <button type="submit" className="ldPrimary" disabled={state.busy}>
                {state.busy ? 'Sending…' : 'Send request'}
                {!state.busy && <ArrowRight />}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Landing                                                             */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* Members search the whole school on the server (max 24 results).    */
/* Visitors never receive names: searching asks them to sign in, then  */
/* brings them back here with their search already running.           */
/* ------------------------------------------------------------------ */

function TopSearch({ member, ready, photos, onOpen, onPool }) {
  const initial = useMemo(() => new URLSearchParams(window.location.search).get('q') || '', []);
  const [query, setQuery] = useState(initial);
  const [focused, setFocused] = useState(Boolean(initial));
  const [expanded, setExpanded] = useState(Boolean(initial));
  const [state, setState] = useState({ loading: false, error: '', total: 0, people: [] });
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const requestId = useRef(0);
  const q = query.trim();

  // Press "/" anywhere to jump to the search box.
  useEffect(() => {
    function onKey(event) {
      const tag = document.activeElement?.tagName;
      if (event.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        event.preventDefault();
        setExpanded(true);
        setFocused(true);
        window.setTimeout(() => inputRef.current?.focus(), 30);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Drop ?q= from the address bar once it has been picked up.
  useEffect(() => {
    if (!initial) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('q');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, [initial]);

  useEffect(() => {
    if (!member || !ready || q.length < 2) {
      setState({ loading: false, error: '', total: 0, people: [] });
      onPool?.(null);
      return undefined;
    }
    const id = ++requestId.current;
    setState(current => ({ ...current, loading: true, error: '' }));
    const timer = window.setTimeout(() => {
      searchDirectory({ q })
        .then(result => {
          if (id !== requestId.current) return;
          const found = result.people.map(person => ({ ...person, open: OPEN_ACCESS.includes(person.access) }));
          setState({ loading: false, error: '', total: result.total, people: found });
          onPool?.(found);
          setActive(0);
        })
        .catch(error => {
          if (id === requestId.current) setState({ loading: false, error: friendlyError(error, 'Search is taking a short break. Please try again in a moment.'), total: 0, people: [] });
        });
    }, 260);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, member, ready]);

  useEffect(() => {
    function onDown(event) {
      if (boxRef.current && !boxRef.current.contains(event.target)) {
        setFocused(false);
        if (!inputRef.current?.value.trim()) setExpanded(false);
      }
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const loginHref = `/login?next=${encodeURIComponent(q ? `/?q=${encodeURIComponent(q)}` : '/')}`;
  const open = focused && q.length >= 2;
  // While the server catches up, only show earlier results that still match.
  const shown = state.loading ? rankByName(state.people, q, person => person.name) : state.people;

  function toggle() {
    if (expanded && !q) {
      collapse();
      return;
    }
    setExpanded(true);
    setFocused(true);
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }

  function collapse() {
    setQuery('');
    setFocused(false);
    setExpanded(false);
    inputRef.current?.blur();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      collapse();
      return;
    }
    if (!member) {
      if (event.key === 'Enter' && q) window.location.assign(loginHref);
      return;
    }
    if (!shown.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(i => Math.min(shown.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(i => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      if (shown[active]) onOpen(shown[active]);
    }
  }

  return (
    <div
      className={`ldTopSearch ${expanded ? 'isExpanded' : ''} ${open ? 'isOpen' : ''}`}
      ref={boxRef}
    >
      <div className="ldTopSearchField" aria-hidden={!expanded}>
        <input
          ref={inputRef}
          type="search"
          value={query}
          tabIndex={expanded ? 0 : -1}
          placeholder={member ? 'Type a student’s name…' : 'Search student portfolios…'}
          onChange={event => {
            setQuery(event.target.value);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          aria-label="Search portfolios"
        />
        <button type="button" className="ldTopSearchClose" aria-label="Close search" onClick={collapse}>
          <X />
        </button>
      </div>

      <button
        type="button"
        className="ldTopSearchBtn"
        aria-label={expanded ? 'Search' : 'Open search'}
        aria-expanded={expanded}
        title="Search portfolios ( / )"
        onClick={toggle}
      >
        <Search />
      </button>

      {open && (
        <div className={`ldTopResults ${state.loading ? 'isLoading' : ''}`} role="listbox">
          {!member ? (
            <div className="ldGate">
              <span className="ldGateIcon">
                <Lock />
              </span>
              <div>
                <b>Sign in to see results for “{q}”</b>
                <small>Names and portfolios are visible only to the TBS community.</small>
              </div>
              <a className="ldGateBtn" href={loginHref}>
                View portfolio <ArrowRight />
              </a>
            </div>
          ) : state.loading && !shown.length ? (
            <p className="ldEmpty">Searching…</p>
          ) : state.error ? (
            <p className="ldEmpty">{state.error}</p>
          ) : !shown.length ? (
            <p className="ldEmpty">No student matches “{q}”.</p>
          ) : (
            <>
              {shown.map((person, index) => (
                <button
                  type="button"
                  key={person.key}
                  role="option"
                  aria-selected={index === active}
                  className={`ldTopResult ${index === active ? 'isActive' : ''}`}
                  style={{ '--i': index }}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onOpen(person)}
                >
                  <Avatar person={person} photo={photos[person.key]} size={40} />
                  <span className="ldResultText">
                    <b>{person.name}</b>
                    <small>{person.yearGroup || 'The British School'}</small>
                  </span>
                  <span className={`ldBadge ${person.open ? 'isOpen' : person.pending ? 'isPending' : ''}`}>
                    {person.open ? (
                      <>
                        View portfolio <ArrowUpRight />
                      </>
                    ) : person.pending ? (
                      <>
                        <Clock3 /> Pending
                      </>
                    ) : (
                      <>
                        <Lock /> Request access
                      </>
                    )}
                  </span>
                </button>
              ))}
              {!state.loading && state.total > shown.length && (
                <p className="ldMore">
                  Showing {shown.length} of {state.total} — keep typing to narrow it down
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* Visitors: a portfolio opens only after signing in with a TBS email.
 * People outside TBS can ask for access instead. */
function SignInPrompt({ person, onClose }) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    const onKey = event => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (asking) return <RequestAccess person={person} onClose={onClose} />;

  return (
    <div className="ldModalBackdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="ldModal ldChoice" role="dialog" aria-modal="true" aria-labelledby="ldSignInTitle">
        <button type="button" className="ldModalClose" aria-label="Close" onClick={onClose}>
          <X />
        </button>
        <header className="ldModalHead">
          <Avatar person={person} size={68} shape="square" />
          <div>
            <small>
              <Lock /> Private portfolio
            </small>
            <h2 id="ldSignInTitle">Sign in to view</h2>
            <span>Portfolios are open to the TBS community.</span>
          </div>
        </header>

        <div className="ldChoiceGrid">
          <a href={LOGIN_TO_GALLERY}>
            <LogIn />
            <b>Sign in</b>
            <small>Students, parents and staff — use your school or registered email.</small>
          </a>
          <button type="button" onClick={() => setAsking(true)}>
            <ArrowUpRight />
            <b>Request access</b>
            <small>Outside TBS? Ask the school to share this portfolio with you.</small>
          </button>
        </div>
      </div>
    </div>
  );
}

/* Own / staff portfolios: choose to view it, or edit it in the workspace. */
function PortfolioChoice({ person, photo, onClose, onView }) {
  useEffect(() => {
    const onKey = event => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const own = person.access === 'own';
  return (
    <div className="ldModalBackdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="ldModal ldChoice" role="dialog" aria-modal="true" aria-labelledby="ldChoiceTitle">
        <button type="button" className="ldModalClose" aria-label="Close" onClick={onClose}>
          <X />
        </button>
        <header className="ldModalHead">
          <Avatar person={person} photo={photo} size={68} shape="square" />
          <div>
            <small>
              <ShieldCheck /> {own ? 'Your portfolio' : 'Staff access'}
            </small>
            <h2 id="ldChoiceTitle">{person.name}</h2>
            <span>{person.yearGroup || 'The British School, New Delhi'}</span>
          </div>
        </header>

        <div className="ldChoiceGrid">
          <button type="button" onClick={() => onView(person)}>
            <ArrowUpRight />
            <b>View portfolio</b>
            <small>See it exactly as members see it.</small>
          </button>
          <a href={`/login?edit=${encodeURIComponent(person.studentId || '')}`}>
            <PenLine />
            <b>Edit portfolio</b>
            <small>{own ? 'Update the profile, moments and media.' : 'Open this student in the workspace.'}</small>
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const skyRef = useRef(null);
  const sky = useRef(null);
  const centreRef = useRef(null);
  const theme = useTheme();

  const [directory, setDirectory] = useState({ mode: 'visitor', viewer: null, total: 0, people: [] });
  const [status, setStatus] = useState('loading');
  const [photos, setPhotos] = useState({});
  const [requestFor, setRequestFor] = useState(null);
  const [choiceFor, setChoiceFor] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [signInFor, setSignInFor] = useState(null);

  const [searchPool, setSearchPool] = useState(null);

  const member = directory.mode === 'member';
  const people = directory.people;
  /* While searching, only the matching students stay in space. */
  const spacePool = searchPool || people;

  /* ---------- the universe behind the students ---------- */
  useEffect(() => {
    sky.current = createSky(skyRef.current, document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    return () => sky.current?.destroy();
  }, []);

  useEffect(() => {
    sky.current?.setTheme(theme);
  }, [theme]);

  /* ---------- open / request ---------- */
  const viewPerson = useCallback(person => {
    setChoiceFor(null);
    setLeaving(true);
    window.setTimeout(() => window.location.assign(`/portfolio/${encodeURIComponent(person.key)}`), 480);
  }, []);

  const openPerson = useCallback(
    person => {
      if (!person) return;
      /* Visitors: viewing any portfolio needs a TBS sign-in. */
      if (!member) {
        setSignInFor(person);
        return;
      }
      if ((person.access === 'own' || person.access === 'staff') && person.studentId) {
        setChoiceFor(person);
      } else if (person.open) {
        viewPerson(person);
      } else {
        setRequestFor(person);
      }
    },
    [viewPerson, member]
  );

  /* ---------- data: a random 100 from the server ---------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = (await supabase?.auth.getSession()) || { data: {} };
      const signedIn = Boolean(data?.session);

      try {
        const result = await loadDirectory();
        if (!alive) return;
        if (signedIn && result.mode !== 'member') {
          setNotice(
            'Welcome! Your account is still being connected to the TBS community. You can continue in your workspace in the meantime.'
          );
        }
        // A random 150 at most, even if the server sends everyone.
        const pool = [...result.people];
        for (let i = pool.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        setDirectory({
          ...result,
          people: pool.slice(0, 150).map(person => ({
            ...person,
            open: OPEN_ACCESS.includes(person.access)
          }))
        });
        setStatus('ready');
      } catch (error) {
        console.warn('Directory', error);
        if (alive) setStatus('error');
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* Members: every student's profile photo, through the secure media
   * function, 5 at a time. Loaded once and kept while the page is open. */
  const requested = useRef(new Set());
  const blobUrls = useRef([]);
  const photoSignature = useMemo(
    () => [...people, ...(searchPool || [])].filter(p => p.photoId).map(p => `${p.key}:${p.photoId}`).join('|'),
    [people, searchPool]
  );

  useEffect(() => {
    if (!member) return;
    const queue = [...people, ...(searchPool || [])].filter(p => p.photoId && !requested.current.has(p.key));
    queue.forEach(p => requested.current.add(p.key));

    async function worker() {
      while (queue.length) {
        const person = queue.shift();
        try {
          const url = await privateEvidenceBlobUrl(person.photoId, 240); /* small copy: cards and search */
          blobUrls.current.push(url);
          setPhotos(current => ({ ...current, [person.key]: url }));
        } catch {
          /* keep the initials */
        }
      }
    }
    Promise.all(Array.from({ length: 5 }, worker));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member, photoSignature]);

  useEffect(() => () => blobUrls.current.forEach(url => URL.revokeObjectURL(url)), []);

  async function signOut() {
    await supabase?.auth.signOut();
    window.location.assign('/');
  }

  function markPending(person) {
    setDirectory(current => ({
      ...current,
      people: current.people.map(p => (p.key === person.key ? { ...p, pending: true } : p))
    }));
  }

  function feelingCurious() {
    const pool = people.filter(p => p.open && p.access !== 'own');
    if (!pool.length) return;
    viewPerson(pool[Math.floor(Math.random() * pool.length)]);
  }

  const renderStar = useCallback(
    person => <StudentCard key={person.key} person={person} member={member} />,
    [member]
  );

  return (
    <div className={`ld ${leaving ? 'isLeaving' : ''} ${member ? 'isMember' : 'isVisitor'}`}>
      <div className="ldSky" aria-hidden="true">
        <i className="ldNebula ldNebulaA" />
        <i className="ldNebula ldNebulaB" />
        <i className="ldNebula ldNebulaC" />
      </div>
      <canvas ref={skyRef} className="ldStars" aria-hidden="true" />

      <CardPhotos.Provider value={photos}>
        <OrbitField pool={spacePool} renderStar={renderStar} avoidRef={centreRef} onSelect={openPerson} theme={theme} />
      </CardPhotos.Provider>
      <div className="ldVignette" aria-hidden="true" />

      {/* ---------- top bar ---------- */}
      <header className="ldTop">
        <a className="ldBrand" href="/" aria-label="TBS Student Portfolio home">
          <span className="ldCrest">
            <img className="onlyLight" src={TBS_LOGO} alt="The British School, New Delhi" />
            <img className="onlyDark" src={TBS_LOGO_WHITE} onError={useColourLogo} alt="The British School, New Delhi" />
          </span>
          <span className="ldBrandText">
            <b>The British School</b>
            <small>New Delhi</small>
          </span>
        </a>

        <nav className="ldTopNav">
          <TopSearch member={member} ready={status === 'ready'} photos={photos} onOpen={openPerson} onPool={setSearchPool} />
          <ThemeToggle className="ldThemeToggle" />
          {member ? (
            <>
              <span className="ldTopStat">
                <i />
                {directory.viewer?.name || 'Signed in'}
              </span>
              <a className="ldLogin isQuiet" href="/login">
                <LayoutGrid />
                Workspace
              </a>
              <button type="button" className="ldIconBtn" onClick={signOut} aria-label="Sign out">
                <LogOut />
              </button>
            </>
          ) : (
            <a className="ldLogin" href={LOGIN_TO_GALLERY}>
              <LogIn />
              Sign in
            </a>
          )}
        </nav>
      </header>

      {/* ---------- centre ---------- */}
      <main className="ldCentre">
        <div className="ldCentreInner" ref={centreRef}>
          <p className="ldEyebrow">
            <GraduationCap /> {member ? 'TBS community · signed in' : 'Reception to Diploma · verified journeys'}
          </p>

          <h1 className="ldWordmark">
            <span className="ldTbs">TBS</span> <em>Student</em> Portfolio
          </h1>

          <p className="ldTagline">
            {member
              ? 'Every student has a journey. Tap a card to explore theirs.'
              : 'Every student has a journey worth telling — learning, leading and growing at TBS.'}
          </p>

          <div className="ldActions">
            {member ? (
              <button type="button" className="ldGhostBtn" onClick={feelingCurious}>
                <Shuffle /> I’m feeling curious
              </button>
            ) : (
              <a className="ldCta" href={LOGIN_TO_GALLERY}>
                <LogIn /> Sign in to view portfolios
              </a>
            )}
          </div>

          {/* Only status and search messages; no student counts. */}
          {(status !== 'ready' || (member && searchPool)) && (
            <p className="ldMeta">
              {status === 'loading' && 'Gathering student journeys…'}
              {status === 'error' && 'Portfolios are resting — please try again shortly.'}
              {status === 'ready' &&
                (searchPool.length
                  ? `${searchPool.length} matching student${searchPool.length === 1 ? '' : 's'} in space`
                  : 'No student matches your search')}
            </p>
          )}
        </div>
      </main>

      {/* ---------- footer ---------- */}
      <footer className="ldFoot">
        <span>© The British School, New Delhi</span>
        <em>We fly with our own wings</em>
        <span>Private to the TBS community · access by approval</span>
      </footer>

      {notice && (
        <div className="ldNotice" role="status">
          <span>{notice}</span>
          <a href="/login">Open workspace</a>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice('')}>
            <X />
          </button>
        </div>
      )}

      {choiceFor && (
        <PortfolioChoice
          person={choiceFor}
          photo={photos[choiceFor.key]}
          onClose={() => setChoiceFor(null)}
          onView={viewPerson}
        />
      )}

      {signInFor && (
        <SignInPrompt person={signInFor} onClose={() => setSignInFor(null)} />
      )}

      {requestFor && (
        <RequestAccess
          person={requestFor}
          member={member}
          photo={photos[requestFor.key]}
          onClose={() => setRequestFor(null)}
          onSent={member ? markPending : undefined}
        />
      )}
      <div className="ldCurtain" aria-hidden="true" />
    </div>
  );
}
