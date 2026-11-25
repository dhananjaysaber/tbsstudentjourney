import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, Lock, X } from 'lucide-react';
import QRCode from 'qrcode';

import { setPageScrollLocked } from '../lib/smoothScroll';
import { buildCvModel } from '../lib/cvModel';
import { supabase } from '../supabase';
import './CvView.css';

/* =========================================================================
   STUDENT CV
   Navy cover with every About me field, then the record: numbers,
   awards, experience by academic year, evidenced skills, Panthers teams
   and a coach quote (approved, or the coach's own words).
   The preview is HTML; "Download PDF" builds the same CV as a real PDF
   inside the app (react-pdf), so it is identical in every browser.
   ========================================================================= */

/* The photo on screen is a private blob URL. Re-draw it as a square JPEG
 * data URL so the PDF can embed it (react-pdf needs PNG or JPEG). */
async function photoForPdf(root) {
  const img = root?.querySelector('.cvPhoto img');
  if (!img || !img.complete || !img.naturalWidth) return null;
  try {
    const size = 360;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size
    );
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return null; // a cross-origin image cannot be re-drawn; the initials are used instead
  }
}

/* "jay@british-school.org" -> "j••@british-school.org" */
function maskEmail(email) {
  const [user = '', domain = ''] = String(email || '').split('@');
  if (!domain) return email;
  return `${user.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
}

function Label({ children }) {
  return <div className="cvLbl">{children}</div>;
}

export default function CvView({
  student = {},
  profile = {},
  items = [],
  panthers,
  awards = [],
  approvedQuote = null,
  qrUrl = '',
  photo,
  onClose
}) {
  const model = useMemo(
    () => buildCvModel({ student, profile, items, panthers, awards, approvedQuote, qrUrl }),
    [student, profile, items, panthers, awards, approvedQuote, qrUrl]
  );
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sheet = useRef(null);

  useEffect(() => {
    if (!model.qrUrl) return;
    QRCode.toDataURL(model.qrUrl, { margin: 0, width: 360, color: { dark: '#151449', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [model.qrUrl]);

  useEffect(() => {
    setPageScrollLocked(true);
    document.documentElement.classList.add('cvOpen');
    const onKey = event => {
      if (event.key === 'Escape') return onClose();
      // The CV is view-only: no save, print, copy or view-source shortcuts.
      const k = String(event.key || '').toLowerCase();
      if ((event.metaKey || event.ctrlKey) && ['s', 'p', 'c', 'a', 'u'].includes(k)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const noMenu = event => event.preventDefault();
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('contextmenu', noMenu, true);
    document.addEventListener('copy', noMenu, true);
    document.addEventListener('dragstart', noMenu, true);
    return () => {
      setPageScrollLocked(false);
      document.documentElement.classList.remove('cvOpen');
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('contextmenu', noMenu, true);
      document.removeEventListener('copy', noMenu, true);
      document.removeEventListener('dragstart', noMenu, true);
    };
  }, [onClose]);

  /* Download is protected: a 6-digit code goes to the viewer's registered
   * email, and the PDF is made only after the code is confirmed. */
  const [gate, setGate] = useState(null); // null | { step, email, code, error, resendIn }
  const codeRef = useRef(null);

  useEffect(() => {
    if (!gate?.resendIn) return undefined;
    const timer = setTimeout(() => setGate(g => (g ? { ...g, resendIn: g.resendIn - 1 } : g)), 1000);
    return () => clearTimeout(timer);
  }, [gate?.resendIn]);

  async function askForCode() {
    setError('');
    const { data } = (await supabase?.auth.getSession()) || { data: {} };
    const email = data?.session?.user?.email;
    if (!email) {
      setGate({ step: 'signin' });
      return;
    }
    setGate({ step: 'sending', email, code: '', error: '' });
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    });
    if (sendError) {
      setGate({
        step: 'code', email, code: '', resendIn: 0,
        error: /rate|seconds|security purposes/i.test(sendError.message)
          ? 'A code was sent a moment ago. Please wait a minute, then tap “Send a new code”.'
          : 'We couldn’t send the code just now. Please try again.'
      });
      return;
    }
    setGate({ step: 'code', email, code: '', error: '', resendIn: 45 });
    setTimeout(() => codeRef.current?.focus(), 80);
  }

  async function confirmCode(event) {
    event?.preventDefault();
    const code = String(gate?.code || '').replace(/\D/g, '');
    if (code.length !== 6) return;
    setGate(g => ({ ...g, step: 'checking', error: '' }));
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: gate.email, token: code, type: 'email' });
    if (verifyError) {
      setGate(g => ({ ...g, step: 'code', code: '', error: 'That code didn’t work. Check the latest email and try again.' }));
      setTimeout(() => codeRef.current?.focus(), 50);
      return;
    }
    const email = gate.email;
    setGate(null);
    await download(email);
  }

  async function download(issuedTo) {
    setBusy(true);
    setError('');
    try {
      const [{ pdf }, { default: CvPdf }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./CvPdf.jsx')
      ]);
      const photoData = await photoForPdf(sheet.current);
      const blob = await pdf(<CvPdf model={model} photo={photoData} qr={qr} issuedTo={issuedTo} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = model.fileName;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch (err) {
      console.error('CV PDF failed', err);
      setError('The PDF couldn’t be made just now. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const m = model;
  const hasAboutCards = m.proud || m.goals || m.nextChapter;

  return createPortal(
    <div className="cvOverlay" role="dialog" aria-modal="true" aria-label={`${m.name} portfolio`}>
      <div className="cvToolbar">
        <span>TBS Student Journey Portfolio · {m.name}</span>
        <div>
          {error && <em className="cvError">{error}</em>}
          <button type="button" className="cvPrimary" onClick={askForCode} disabled={busy || Boolean(gate)}>
            {busy ? <Loader2 className="cvSpin" /> : <Lock />}
            {busy ? 'Preparing PDF…' : 'Download PDF'}
          </button>
          <button type="button" className="cvClose" onClick={onClose} aria-label="Close portfolio">
            <X />
          </button>
        </div>
      </div>

      {gate && (
        <div className="cvGate" role="dialog" aria-modal="true" aria-labelledby="cvGateTitle">
          <form className="cvGateCard" onSubmit={confirmCode}>
            <span className="cvGateIcon" aria-hidden="true"><Lock /></span>
            {gate.step === 'signin' ? (
              <>
                <h3 id="cvGateTitle">Sign in to download</h3>
                <p>Downloading the portfolio needs a registered TBS email. Please sign in, then open it again.</p>
                <div className="cvGateActions">
                  <button type="button" className="cvGateGhost" onClick={() => setGate(null)}>Close</button>
                  <a className="cvGateMain" href={`/?next=${encodeURIComponent(window.location.pathname)}`}>Sign in</a>
                </div>
              </>
            ) : (
              <>
                <h3 id="cvGateTitle">Enter your access code</h3>
                <p>
                  {gate.step === 'sending'
                    ? 'Sending a 6-digit code to your registered email…'
                    : <>We sent a 6-digit code to <b>{maskEmail(gate.email)}</b>. Enter it to download this portfolio.</>}
                </p>
                <label className="cvGateField" htmlFor="cvGateCode">
                  <span>Access code</span>
                  <input
                    id="cvGateCode"
                    ref={codeRef}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={gate.code || ''}
                    disabled={gate.step !== 'code'}
                    onChange={event => {
                      const code = event.target.value.replace(/\D/g, '').slice(0, 6);
                      setGate(g => ({ ...g, code, error: '' }));
                    }}
                    placeholder="••••••"
                  />
                </label>
                {gate.error && <p className="cvGateError" role="alert">{gate.error}</p>}
                <div className="cvGateActions">
                  <button type="button" className="cvGateGhost" onClick={() => setGate(null)}>Cancel</button>
                  <button
                    type="submit"
                    className="cvGateMain"
                    disabled={gate.step !== 'code' || String(gate.code || '').length !== 6}
                  >
                    {gate.step === 'checking' ? <Loader2 className="cvSpin" /> : <Download />}
                    {gate.step === 'checking' ? 'Checking…' : 'Verify & download'}
                  </button>
                </div>
                <button
                  type="button"
                  className="cvGateResend"
                  disabled={gate.step !== 'code' || gate.resendIn > 0}
                  onClick={askForCode}
                >
                  {gate.resendIn > 0 ? `Send a new code in ${gate.resendIn}s` : 'Send a new code'}
                </button>
              </>
            )}
          </form>
        </div>
      )}

      <article className="cvSheet" ref={sheet}>
        {/* ================= navy cover: identity + About me ================= */}
        <header className="cvHero">
          <div className="cvWatermark" aria-hidden="true">TBS</div>

          <div className="cvId">
            <div className="cvPhoto">{photo || <span>{m.initials}</span>}</div>
            <div className="cvIdText">
              <div className="cvKicker">TBS Student Journey Portfolio · The British School, New Delhi</div>
              <h1>{m.name}</h1>
              {m.preferred && (
                <div className="cvPref">
                  Known as <b>{m.preferred}</b>
                </div>
              )}
              {m.headline && <p className="cvHeadline">{m.headline}</p>}
            </div>
            {qr && (
              <div className="cvQr">
                <img src={qr} alt="QR code to the live portfolio" />
                <small>Scan · live portfolio</small>
              </div>
            )}
          </div>

          <dl className="cvFacts">
            {m.facts.map(fact => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>
                  {fact.value}
                  {fact.accent && <em> · {fact.accent}</em>}
                </dd>
              </div>
            ))}
          </dl>

          {Boolean(m.about || m.strengths.length || m.interests.length) && (
            <div className={`cvAbout ${m.about ? '' : 'isChipsOnly'}`}>
              {m.about && (
                <div>
                  <Label>About me</Label>
                  <p className="cvAboutText">{m.about}</p>
                </div>
              )}
              <div>
                {m.strengths.length > 0 && (
                  <div className="cvChipSet">
                    <Label>Strengths</Label>
                    <div className="cvChips isSolid">
                      {m.strengths.map(item => <span key={item}>{item}</span>)}
                    </div>
                  </div>
                )}
                {m.interests.length > 0 && (
                  <div className="cvChipSet">
                    <Label>Interests</Label>
                    <div className="cvChips">
                      {m.interests.map(item => <span key={item}>{item}</span>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {hasAboutCards && (
            <div className="cvTrio">
              {m.proud && (
                <div className="cvCard isProud">
                  <Label>Proud moment</Label>
                  <p>“{m.proud}”</p>
                </div>
              )}
              {m.goals && (
                <div className="cvCard">
                  <Label>Goals · this year</Label>
                  <p>{m.goals}</p>
                </div>
              )}
              {m.nextChapter && (
                <div className="cvCard">
                  <Label>Next chapter</Label>
                  <p>{m.nextChapter}</p>
                </div>
              )}
            </div>
          )}
        </header>

        {/* ================= the record ================= */}
        {m.numbers.length > 0 && (
          <div className="cvNums" style={{ '--cols': m.numbers.length }}>
            {m.numbers.map(item => (
              <div key={item.label}>
                <b>{item.value}</b>
                <small>{item.label}</small>
              </div>
            ))}
          </div>
        )}

        {/* The side column floats right; awards and experience wrap beside it
            and use the full width once it ends, so the page never shows a gap. */}
        <div className="cvBody">
          <aside className="cvSide">
            {m.skills.rows.length > 0 && (
              <section>
                <h2 className="cvH">{m.skills.mode === 'skills' ? 'Skills · evidenced' : 'Areas · evidenced'}</h2>
                {m.skills.rows.map((row, index) => (
                  <div className="cvSkill" key={row.label}>
                    <div>
                      <span>{row.label}</span>
                      <span>
                        {row.count}
                        {index === 0 ? ` moment${row.count === 1 ? '' : 's'}` : ''}
                      </span>
                    </div>
                    <i>
                      <b style={{ width: `${Math.max(8, Math.round(row.share * 100))}%` }} />
                    </i>
                  </div>
                ))}
              </section>
            )}

            {m.teams.length > 0 && (
              <section>
                <h2 className="cvH">Panthers · in numbers</h2>
                <ul className="cvTeams">
                  {m.teams.map(team => (
                    <li key={team.id}>
                      <b>{team.name}</b>
                      {team.seasons && <span> · {team.seasons}</span>}
                      {team.stats.length > 0 && <em>{team.stats.join(' · ')}</em>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {m.quote && (
              <section className="cvCoach">
                <span aria-hidden="true">“</span>
                <p>{m.quote.text}</p>
                <small>— {m.quote.attribution}</small>
              </section>
            )}
          </aside>
          <div className="cvMain">
            {m.awards.length > 0 && (
              <section>
                <h2 className="cvH">Awards &amp; Recognition</h2>
                <div className="cvAwards">
                  {m.awards.map(award => (
                    <div className="cvAward" key={award.id}>
                      <span className="cvMedal" aria-hidden="true">★</span>
                      <div>
                        <h4>{award.heading}</h4>
                        {award.meta && <div className="cvAwardMeta">{award.meta}</div>}
                        {award.story && <p>{award.story}</p>}
                        {award.quote && (
                          <blockquote>
                            “{award.quote}”{award.quoteBy && <cite>— {award.quoteBy}</cite>}
                          </blockquote>
                        )}
                        {award.report && <p className="cvAwardReport">Match report: {award.report}</p>}
                      </div>
                      {award.badge && <span className="cvBadge">{award.badge}</span>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {m.experience.length > 0 && (
              <section>
                <h2 className="cvH">Experience</h2>
                {m.experience.map(group => (
                  <div className="cvYear" key={group.year}>
                    <h3>{group.year}</h3>
                    {group.rows.map(row => (
                      <div className="cvExp" key={row.id}>
                        <div className="cvExpDate">{row.date}</div>
                        <div>
                          <h5>{row.title}</h5>
                          {row.meta && <div className="cvExpMeta">{row.meta}{row.verified ? ' · Verified' : ''}</div>}
                          {row.text && <p>{row.text}</p>}
                          {row.reflection && <p className="cvExpReflect">“{row.reflection}”</p>}
                          {row.tags.length > 0 && <div className="cvExpTags">{row.tags.join(' · ')}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            )}
          </div>
          <div className="cvClear" />
        </div>

        <footer className="cvFoot">
          <span className="cvVer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            Moments marked “Verified” and all Panthers records are confirmed by TBS
          </span>
          <span>Issued {m.issued}</span>
        </footer>
      </article>
    </div>,
    document.body
  );
}
