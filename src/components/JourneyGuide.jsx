/* =========================================================================
   JOURNEY GUIDE (v33)
   Help for students adding a Journey Moment:
   · GuideIntro   the "Before you start" page, shown until the student ticks
                  "Don't show this guide again" (remembered on this device)
   · GuidePanel   tips beside each step, open by default, can be hidden
   · WordCount / ReflectionChecklist   live feedback under the text boxes
   ========================================================================= */
import React from 'react';
import { ArrowRight, Check, FileText, HelpCircle, ImagePlus, Images, Lightbulb, ShieldCheck, Star, Trash2, Upload, X } from 'lucide-react';
import './JourneyGuide.css';

const SKIP_KEY = 'tbs.journeyGuide.skipIntro';
const PANEL_KEY = 'tbs.journeyGuide.panel';

function readKey(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeKey(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode: the guide simply shows again next time */
  }
}

export const guideIntroSkipped = () => readKey(SKIP_KEY) === '1';
export const setGuideIntroSkipped = skip => writeKey(SKIP_KEY, skip ? '1' : null);
export const guidePanelOpen = () => readKey(PANEL_KEY) !== 'closed';
export const setGuidePanelOpen = open => writeKey(PANEL_KEY, open ? null : 'closed');

export const TYPE_INFO = {
  activity: 'Something you take part in regularly.',
  achievement: 'A result you earned: a medal, a grade, a personal best.',
  award: 'Someone recognised you for it.',
  role: 'A position of responsibility.',
  project: 'Something you planned and made over time.',
  milestone: 'A first, or a turning point.',
  reflection: 'A change in how you think. No event needed.'
};

const TYPE_ORDER = ['activity', 'achievement', 'award', 'role', 'project', 'milestone', 'reflection'];
const TYPE_LABEL = {
  activity: 'Activity',
  achievement: 'Achievement',
  award: 'Award',
  role: 'Role',
  project: 'Project',
  milestone: 'Milestone',
  reflection: 'Reflection'
};

const AREA_LABEL = {
  academic: 'Academic',
  sport: 'Sport',
  creative_arts: 'Creative Arts',
  leadership: 'Leadership',
  service: 'Service',
  co_curricular: 'Co-curricular',
  personal: 'Personal Growth',
  other: 'Other'
};

/* Good and vague titles for each area. */
const TITLES = {
  academic: { good: ['Extended Essay: water quality in the Yamuna', 'Silver, Intermediate Maths Challenge'], vague: 'Maths' },
  sport: { good: ['Goalkeeper, U14 Football — DSO Zonal Finals', 'Swim squad: three early sessions a week, Term 1'], vague: 'Football' },
  creative_arts: { good: ['Lead role, Senior School musical', 'Grade 6 Piano, distinction'], vague: 'Music' },
  leadership: { good: ['House Captain, 2026–27', 'Chair, Student Council events committee'], vague: 'Leadership' },
  service: { good: ['CAS project: Saturday reading club for Year 3', 'Volunteer, winter clothing drive'], vague: 'Helping' },
  co_curricular: { good: ['Delegate, Delhi MUN — Security Council', 'Robotics Club: regional finals build'], vague: 'Club' },
  personal: { good: ['Learning to speak up in class discussions', 'My first time travelling alone by metro'], vague: 'Growing up' },
  other: { good: ['Work experience: a week at an architecture studio', 'Teaching myself Python over the summer'], vague: 'Stuff I did' }
};

/* Ideas on the intro page: tapping one starts the moment with type + area set. */
const IDEAS = [
  { label: 'Academic', domain: 'academic', items: [['An extended essay or IA I’m proud of', 'project'], ['An olympiad, competition or MUN', 'achievement'], ['A subject I finally cracked', 'milestone']] },
  { label: 'Sport', domain: 'sport', items: [['A tournament or fixture with Panthers', 'activity'], ['A personal best or team selection', 'achievement'], ['Coming back from an injury', 'milestone']] },
  { label: 'Creative Arts', domain: 'creative_arts', items: [['A performance, exhibition or recital', 'activity'], ['A graded music or drama exam', 'achievement'], ['Something I made from scratch', 'project']] },
  { label: 'Leadership · Service', domain: 'leadership', items: [['A role: prefect, captain, council', 'role'], ['A CAS or community project', 'project'], ['Helping or mentoring younger students', 'activity']] }
];

/* ------------------------------------------------------------------ */
/* The "Before you start" page                                         */
/* ------------------------------------------------------------------ */
export function GuideIntro({ onStart, onIdea }) {
  const [dontShow, setDontShow] = React.useState(guideIntroSkipped());

  function start(extra) {
    setGuideIntroSkipped(dontShow);
    if (extra) onIdea(extra);
    onStart();
  }

  return (
    <div className="jgIntro">
      <section className="jgHero">
        <div className="jgHeroText">
          <small>Before you start · a 2-minute read</small>
          <h1>Your journey, one moment at a time.</h1>
          <p>
            A Journey Moment is one experience that shaped you: a match, a project, a role, a performance, even a setback.
            Add it while it’s fresh. Together, your moments become your portfolio, your CV and the story you tell universities.
          </p>
          <div className="jgHeroActions">
            <button type="button" className="jgBtn primary" onClick={() => start()}>
              Start my moment <ArrowRight />
            </button>
            <a className="jgBtn line" href="#jg-ideas">I need an idea</a>
          </div>
        </div>
        <figure className="jgSample" aria-label="Example of a finished Journey Moment">
          <figcaption>What a finished moment looks like</figcaption>
          <article>
            <header>
              <span>Role · Sport · School</span>
              <em><Check /> Verified by TBS</em>
            </header>
            <h3>Captain, U16 Football — Inter-School Cup</h3>
            <p>
              I captained our U16 squad through five matches. After a 3–0 loss in the group stage, I reorganised training so
              defenders and midfielders practised together. We reached the semi-final.
            </p>
            <blockquote>“I learnt that leading isn’t shouting louder — it’s noticing who has gone quiet.”</blockquote>
            <div className="jgChips">
              <span>Leadership</span>
              <span>Communicators</span>
              <span>Resilience</span>
            </div>
          </article>
        </figure>
      </section>

      <section className="jgBlock">
        <div className="jgBlockHead">
          <h2>Four steps. About ten minutes.</h2>
          <span>You can go back and change anything before you submit.</span>
        </div>
        <ol className="jgSteps">
          <li><b>01</b><strong>The moment</strong><span>The facts: what it was, when, where, and at what level.</span><small>≈ 1 min</small></li>
          <li><b>02</b><strong>The story</strong><span>30–60 words on what you actually did. Say “I”, not “we”.</span><small>≈ 3 min</small></li>
          <li className="isKey"><b>03</b><strong>The reflection</strong><span>Why it mattered: what changed, what you learnt, what’s next. This is the part readers remember.</span><small>≈ 4 min · most important</small></li>
          <li><b>04</b><strong>Evidence</strong><span>One photo, certificate, video or link is enough.</span><small>≈ 2 min</small></li>
        </ol>
      </section>

      <section className="jgBlock">
        <h2>What makes a <em>strong</em> moment</h2>
        <div className="jgQualities">
          <div><strong>Specific</strong><span>Names, dates, numbers. “Raised ₹42,000 for the clothing drive” beats “did some fundraising”.</span></div>
          <div><strong>Personal</strong><span>Your role, your choices. A team won; what did <i>you</i> do?</span></div>
          <div><strong>Honest</strong><span>Include what was hard. A setback you learnt from is worth more than an easy win.</span></div>
          <div><strong>Evidenced</strong><span>A photo or certificate lets TBS verify it, so it can appear on your CV.</span></div>
        </div>
      </section>

      <section className="jgBlock" id="jg-ideas">
        <div className="jgBlockHead col">
          <h2>Not sure what counts?</h2>
          <span>Small moments count too. Tap an idea to start with it.</span>
        </div>
        <div className="jgIdeas">
          {IDEAS.map(group => (
            <div key={group.label} className="jgIdeaCard">
              <strong>{group.label}</strong>
              {group.items.map(([text, type]) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => start({ domain: text.includes('CAS') || text.includes('mentoring') ? 'service' : group.domain, entry_type: type, idea: text })}
                >
                  {text}
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="jgPrivacy">
        <div className="jgPrivacyText">
          <span className="jgPrivacyIcon"><ShieldCheck /></span>
          <div>
            <strong>Private until you say so</strong>
            <span>
              When you submit, only you and TBS staff can see your moment. A teacher verifies it, then you choose whether it
              appears on your shared portfolio and CV.
            </span>
          </div>
        </div>
        <div className="jgPrivacyActions">
          <label>
            <input type="checkbox" checked={dontShow} onChange={event => setDontShow(event.target.checked)} />
            Don’t show this guide again
          </label>
          <button type="button" className="jgBtn gold" onClick={() => start()}>
            Start my moment <ArrowRight />
          </button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ideas under the Step 1 question: tap one to set Type and Area       */
/* ------------------------------------------------------------------ */
export function ideaFor(group, text, type) {
  return { domain: text.includes('CAS') || text.includes('mentoring') ? 'service' : group.domain, entry_type: type, idea: text };
}

export function IdeaPicker({ picked, onPick }) {
  return (
    <section className="jgIdeaStrip" aria-label="Ideas to start from">
      <div className="jgIdeaStripHead">
        <strong>Not sure what counts?</strong>
        <span>Small moments count too. Tap an idea to fill in the Type and Area.</span>
      </div>
      <div className="jgIdeas compact">
        {IDEAS.map(group => (
          <div key={group.label} className="jgIdeaCard">
            <strong>{group.label}</strong>
            {group.items.map(([text, type]) => (
              <button
                key={text}
                type="button"
                className={picked === text ? 'on' : ''}
                aria-pressed={picked === text}
                onClick={() => onPick(ideaFor(group, text, type))}
              >
                {picked === text && <Check />}
                {text}
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Photos: up to 7, one featured                                       */
/* ------------------------------------------------------------------ */
export const MAX_PHOTOS = 7;
const MAX_BYTES = 50 * 1024 * 1024;
const isImage = file => /^image\//.test(file?.type || '');

export function PhotoPicker({ files, featured, onChange, max = MAX_PHOTOS, already = 0, autoFeature = true, onChooseLibrary = null, libraryCount = 0 }) {
  const [menu, setMenu] = React.useState(false);
  const inputRef = React.useRef(null);
  const menuRef = React.useRef(null);
  React.useEffect(() => {
    if (!menu) return undefined;
    const close = event => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !menuRef.current?.contains(event.target)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);
  const urls = React.useMemo(() => files.map(f => (isImage(f) ? URL.createObjectURL(f) : '')), [files]);
  React.useEffect(() => () => urls.forEach(u => u && URL.revokeObjectURL(u)), [urls]);
  const left = max - files.length;

  function add(list) {
    const all = [...list];
    const tooBig = all.filter(f => f.size > MAX_BYTES);
    if (tooBig.length) {
      window.alert(`${tooBig.map(f => f.name).join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} larger than 50 MB. Please add ${tooBig.length === 1 ? 'it' : 'them'} as a Google Drive or YouTube link instead.`);
    }
    const next = [...files, ...all.filter(f => f.size <= MAX_BYTES)].slice(0, Math.max(0, max));
    const firstImage = next.findIndex(isImage);
    const keep = featured != null && featured < next.length && isImage(next[featured]) ? featured : autoFeature && firstImage >= 0 ? firstImage : null;
    onChange(next, keep);
  }
  function remove(i) {
    const next = files.filter((_, n) => n !== i);
    let keep = featured === i ? null : featured != null && featured > i ? featured - 1 : featured;
    if (keep == null && autoFeature) {
      const firstImage = next.findIndex(isImage);
      keep = firstImage >= 0 ? firstImage : null;
    }
    onChange(next, keep);
  }

  return (
    <div className="jgPhotos">
      <div className="jgPhotosHead">
        <strong>{already ? 'Add more photos' : 'Photos & files'} <span>· up to {MAX_PHOTOS}{already ? `, ${already} already added` : ''}</span></strong>
        <span>Tap ★ to choose the <b>featured</b> photo. It leads your moment; the rest appear in its gallery.</span>
      </div>
      <div className="jgPhotoGrid">
        {files.map((file, i) => (
          <figure key={`${file.name}-${i}`} className={`jgPhoto ${featured === i ? 'isFeatured' : ''}`}>
            {urls[i] ? <img src={urls[i]} alt={file.name} /> : <span className="jgFileIcon"><FileText /><small>{file.name}</small></span>}
            {featured === i && <em className="jgFeaturedTag">Featured</em>}
            <div className="jgPhotoTools">
              {isImage(file) && (
                <button
                  type="button"
                  className={featured === i ? 'on' : ''}
                  aria-pressed={featured === i}
                  aria-label={featured === i ? 'Featured photo' : 'Make this the featured photo'}
                  title={featured === i ? 'Featured photo' : 'Make featured'}
                  onClick={() => onChange(files, i)}
                >
                  <Star />
                </button>
              )}
              <button type="button" aria-label={`Remove ${file.name}`} title="Remove" onClick={() => remove(i)}>
                <Trash2 />
              </button>
            </div>
          </figure>
        ))}
        {left > 0 && onChooseLibrary && (
          <div className="jgPhotoAddWrap" ref={menuRef}>
            <button type="button" className="jgPhotoAdd" aria-haspopup="menu" aria-expanded={menu} onClick={() => {
                setMenu(v => !v);
                window.requestAnimationFrame(() => menuRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
              }}>
              <ImagePlus />
              <b>{files.length || already ? 'Add more' : 'Add photos'}</b>
              <span>{files.length || already ? `${left} more allowed` : `Up to ${MAX_PHOTOS} · images, video or PDF`}</span>
            </button>
            {menu && (
              <div className="jgAddMenu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!libraryCount}
                  onClick={() => {
                    setMenu(false);
                    onChooseLibrary();
                  }}
                >
                  <Images />
                  <span>
                    <b>From Media &amp; evidence</b>
                    <small>{libraryCount ? `${libraryCount} photo${libraryCount === 1 ? '' : 's'} already in the app` : 'No other photos in the app yet'}</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    inputRef.current?.click();
                  }}
                >
                  <Upload />
                  <span>
                    <b>Upload from this device</b>
                    <small>Images, video or PDF · up to 50 MB each</small>
                  </span>
                </button>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              accept="image/*,video/*,application/pdf"
              onChange={event => {
                add(event.target.files);
                event.target.value = '';
              }}
            />
          </div>
        )}
        {left > 0 && !onChooseLibrary && (
          <label className="jgPhotoAdd">
            <ImagePlus />
            <b>{files.length ? 'Add more' : 'Add photos'}</b>
            <span>{files.length || already ? `${left} more allowed` : `Up to ${MAX_PHOTOS} · images, video or PDF`}</span>
            <input
              type="file"
              multiple
              accept="image/*,video/*,application/pdf"
              onChange={event => {
                add(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tips beside each step                                               */
/* ------------------------------------------------------------------ */
function Tick({ ok, children }) {
  return (
    <div className={`jgEx ${ok ? 'isGood' : 'isVague'}`}>
      {ok ? <Check aria-label="Good" /> : <X aria-label="Too vague" />}
      <span>{children}</span>
    </div>
  );
}

export function GuidePanel({ step, values, open, onToggle }) {
  if (!open) {
    return (
      <button type="button" className="jgShowTips" onClick={onToggle}>
        <Lightbulb /> Show tips
      </button>
    );
  }

  const areaLabel = AREA_LABEL[values.domain] || 'this area';
  const typeLabel = TYPE_LABEL[values.entry_type] || 'Moment';
  const titles = TITLES[values.domain] || TITLES.other;

  const head = {
    1: [`${typeLabel} in ${areaLabel}`, 'A good title tells someone what you did in one glance.'],
    2: ['Telling the story', 'Show what you did, not just what happened.'],
    3: ['Reflecting', 'What? So what? Now what?'],
    4: ['Evidence', 'One great photo leads. The rest tell the story.']
  }[step];

  return (
    <aside className="jgPanel" aria-label="Tips for this step">
      <div className="jgPanelMain">
        <div className="jgPanelTop">
          <span><Lightbulb /> Guide · {head[0]}</span>
          <button type="button" onClick={onToggle}>Hide</button>
        </div>
        <h2>{head[1]}</h2>

        {step === 1 && (
          <div className="jgExList">
            {titles.good.map(t => <Tick key={t} ok>{t}</Tick>)}
            <Tick ok={false}><s>{titles.vague}</s> — too vague. Which team or group, what role, which event?</Tick>
          </div>
        )}
        {step === 2 && (
          <ul className="jgTips">
            <li><b>Say “I”</b>, not “we”. What was your part?</li>
            <li><b>One real detail</b>: a date, a score, a number, a name.</li>
            <li><b>30–60 words</b> is plenty. Save the feelings for the next step.</li>
          </ul>
        )}
        {step === 3 && (
          <ol className="jgWhat">
            <li><b>1</b><span><strong>What</strong> happened that tested you?</span></li>
            <li><b>2</b><span><strong>So what</strong> — what did it teach you about yourself?</span></li>
            <li><b>3</b><span><strong>Now what</strong> — where will you use it next?</span></li>
          </ol>
        )}
        {step === 4 && (
          <ul className="jgTips">
            <li><b>Up to 7 photos.</b> Star your best one as featured: it leads your moment, and the rest form its gallery.</li>
            <li><b>A photo of you</b> doing it, a certificate, a result sheet, a programme, a short video or the work itself.</li>
            <li><b>Drive links</b>: set sharing to “Anyone at TBS with the link”, or your teacher can’t open it.</li>
            <li><b>Other students in the photo?</b> Check they’re happy for it to be used.</li>
          </ul>
        )}
      </div>

      {step === 1 && (
        <div className="jgPanelCard">
          <strong>Which type is it?</strong>
          <dl>
            {TYPE_ORDER.map(t => (
              <React.Fragment key={t}>
                <dt className={values.entry_type === t ? 'on' : ''}>{TYPE_LABEL[t]}</dt>
                <dd>{TYPE_INFO[t]}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      )}
      {step === 2 && (
        <div className="jgPanelCard">
          <strong>See the difference</strong>
          <div className="jgCompare weak">
            <small>Vague</small>
            <span>“We played in a football tournament and it was really fun.”</span>
          </div>
          <div className="jgCompare strong">
            <small>Specific · clearly yours</small>
            <span>“On 14 March I kept goal for our U14 team at the DSO zonal finals. We went behind early, so I started organising the back line out loud. We won 2–1 on penalties; I saved two.”</span>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="jgPanelCard">
          <strong>See the difference</strong>
          <div className="jgCompare weak">
            <small>Generic</small>
            <span>“It was a great experience. I learnt a lot about teamwork and had fun.”</span>
          </div>
          <div className="jgCompare strong">
            <small>Specific · truly yours</small>
            <span>“At 2–0 down I wanted to shout louder. Talking to each defender quietly worked better. I now ask before I instruct — and I’ll use that as a prefect.”</span>
          </div>
          <p>Universities read hundreds of “I learnt teamwork”. One real detail makes yours stand out.</p>
        </div>
      )}
      {step === 4 && (
        <div className="jgPanelCard">
          <strong>Why it matters</strong>
          <p>Evidence lets a teacher verify your moment. Verified moments can appear on your CV as “Verified by The British School”.</p>
          <p>Every moment needs at least one photo, file or link, so a teacher can verify it.</p>
        </div>
      )}

      <p className="jgPanelFoot">
        {step === 3
          ? 'Write it the way you’d say it to a teacher. It doesn’t need to sound formal — it needs to sound like you.'
          : 'Every field is needed. Go back and change anything before you submit.'}
      </p>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Live feedback under the text boxes                                  */
/* ------------------------------------------------------------------ */
export const wordCount = text => (String(text || '').trim().match(/\S+/g) || []).length;

export function WordCount({ text, min, max }) {
  const n = wordCount(text);
  const state = !n ? '' : n < min ? 'short' : n > max ? 'long' : 'good';
  const note = { '': `Aim for ${min}–${max}`, short: `Aim for ${min}–${max}`, good: 'Good length', long: 'A little long — trim to the best bits' }[state];
  return (
    <span className={`jgCount ${state}`}>
      {n} word{n === 1 ? '' : 's'} · {note}
    </span>
  );
}

const CHECKS = [
  ['A challenge', /\b(hard|difficult|challeng|struggl|nervous|scared|mistake|lost|losing|fail|setback|behind)/i],
  ['What you did', /\bI\s+(decided|started|tried|changed|organi[sz]ed|chose|asked|stopped|practi[sc]ed|spoke|led|kept|made|took|went|helped|learnt to)\b/i],
  ['What you learnt', /\b(learn|realis|realiz|understood|understand now|discovered|taught me|showed me)/i],
  ['What’s next', /\b(next time|in future|in the future|from now|i will|i’ll|i'll|going to|plan to)\b/i]
];

export function ReflectionChecklist({ text }) {
  return (
    <div className="jgChecks" aria-label="Reflection checklist">
      {CHECKS.map(([label, re]) => {
        const ok = re.test(text || '');
        return (
          <span key={label} className={ok ? 'ok' : ''}>
            {ok && <Check />} {label}
          </span>
        );
      })}
    </div>
  );
}

export function GuideLink({ onClick }) {
  return (
    <button type="button" className="jgGuideLink" onClick={onClick}>
      <HelpCircle /> GUIDE
    </button>
  );
}
