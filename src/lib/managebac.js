/* =========================================================================
   MANAGEBAC CAS REPORT READER (v33)
   Reads the "CAS Reflections · By Activity" PDF exported from ManageBac and
   turns each activity into a pre-filled Journey Moment.

   Layout-based: ManageBac prints every activity the same way —
     <Activity name>
     Dates            Oct 17, 2025 to Oct 17, 2025
     Activity Description  <text>  1. <learning outcome> 2. …
     Supervisor Name: …
     <DAY, DD MONTH YYYY>   <LEARNING OUTCOME TAGS>
     <reflection text | attachment.png 2 MB | photo captions>
     Supervisor Review … This Experience was Completed / Not Completed
   Nothing is sent anywhere to be read: the PDF is read in the browser.
   ========================================================================= */

/* ---------------- PDF → lines ---------------- */

/* Text items of each page → lines (top to bottom), each a list of segments
 * (left to right). Exported so the same code runs in tests. */
export function linesFromPages(pages) {
  const out = [];
  pages.forEach((items, p) => {
    const rows = [];
    items
      .filter(it => String(it.str || '').trim())
      .forEach(it => {
        const x = it.transform[4];
        const y = it.transform[5];
        const row = rows.find(r => Math.abs(r.y - y) < 2.5);
        const seg = { x, w: it.width || 0, str: it.str };
        if (row) row.segs.push(seg);
        else rows.push({ y, segs: [seg] });
      });
    rows
      .sort((a, b) => b.y - a.y)
      .forEach(r => {
        r.segs.sort((a, b) => a.x - b.x);
        let text = '';
        let gaps = 0;
        r.segs.forEach((s, i) => {
          if (i) {
            const prev = r.segs[i - 1];
            const gap = s.x - (prev.x + prev.w);
            if (gap > 14) gaps += 1;
            if (gap > 0.8 && !/\s$/.test(text) && !/^\s/.test(s.str)) text += ' ';
          }
          text += s.str;
        });
        out.push({ page: p + 1, y: r.y, x: r.segs[0].x, text: text.replace(/\s+/g, ' ').trim(), gaps });
      });
  });
  return out;
}

let pdfjsPromise = null;
async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsPromise;
}

export async function readPdfLines(file) {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(content.items);
  }
  return { lines: linesFromPages(pages), pages: doc.numPages, title: (await doc.getMetadata().catch(() => null))?.info?.Title || '' };
}

/* ---------------- lines → activities ---------------- */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');

/* "Oct 17, 2025" or "17 OCTOBER 2025" → "2025-10-17" */
export function isoDate(text) {
  const s = String(text || '').trim();
  let m = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(m[2])}`;
  m = s.match(/(\d{1,2}) ([A-Za-z]{3})[A-Za-z]* (\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`;
  return '';
}

const DATES = /^Dates\s+([A-Za-z]{3,9}\.? \d{1,2}, \d{4})\s+to\s+([A-Za-z]{3,9}\.? \d{1,2}, \d{4})/;
const DAY = /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY), (\d{1,2} [A-Z]+ \d{4})\s*(.*)$/;
const FILE = /\.(png|jpe?g|gif|webp|heic|mp4|mov|m4v|avi|pdf|docx?|pptx?|xlsx?|txt|mp3|wav)\s+[\d.,]+\s?(KB|MB|GB|B)\b/i;
const FOOTER = /^(Page \d+ of \d+|The British School)$/;
const END = /^(Supervisor Review|Thank you for supporting|this evaluation form|Please comment on the student|This Experience was|Completed$|Not Completed$|Supervisor$)/;

/* The seven CAS learning outcomes, as printed in descriptions and tags. */
const OUTCOMES = [
  { re: /strength|growth/i, tag: 'STRENGTH & GROWTH', skill: 'Reflective' },
  { re: /challenge/i, tag: 'CHALLENGE & SKILLS', skill: 'Challenge' },
  { re: /initiat|plan/i, tag: 'INITIATIVE & PLANNING', skill: 'Initiative' },
  { re: /commitment|persever/i, tag: 'COMMITMENT & PERSEVERANCE', skill: 'Perseverance' },
  { re: /collaborat/i, tag: 'COLLABORATIVE SKILLS', skill: 'Collaboration' },
  { re: /global/i, tag: 'GLOBAL ENGAGEMENT', skill: 'Global engagement' },
  { re: /ethic/i, tag: 'ETHICS OF CHOICES & ACTIONS', skill: 'Ethical choices' }
];
const TAG_NAMES = OUTCOMES.map(o => o.tag);
const isTagLine = text => text === text.toUpperCase() && TAG_NAMES.some(t => text.includes(t)) && !/[a-z]/.test(text);

/* Best guess of the portfolio Area from the words used. The student checks it. */
const AREA_WORDS = [
  ['service', /\bngo|charit|volunteer|community|clean ?up|underprivileged|donat|fundrais|service|teach(ing)? (kids|children)|elderly|orphan/i],
  ['sport', /\bsport|football|cricket|basketball|volleyball|tennis|swim|athlet|gymnast|martial|kalari|yoga|fitness|run(ning)?\b|badminton|hockey|rugby|squash|golf|marathon|karate|taekwondo|boxing|cycling|skating/i],
  ['creative_arts', /drama|theatre|theater|acting|actor|dance|ballet|music|sing|choir|band|film|photograph|art\b|paint|draw|design|perform|production|masterclass|lamda|trinity|recital|poetry|creative/i],
  ['leadership', /captain|prefect|president|council|lead(er|ing)|head (boy|girl)|round square|organis/i],
  ['academic', /science|math|research|olympiad|essay|lab\b|stem|coding|robot|physics|chemistry|biology|history|economics/i],
  ['co_curricular', /\bmun\b|model united|debate|club|quiz|society/i]
];
export function guessArea(text) {
  const hit = AREA_WORDS.find(([, re]) => re.test(text));
  return hit ? hit[0] : 'other';
}

function guessType(title, description, start, end) {
  const t = `${title} ${description}`;
  const days = start && end ? (new Date(end) - new Date(start)) / 86400000 : 0;
  if (/\b(captain|president|prefect|head (boy|girl)|chair|leader|coordinator)\b/i.test(title)) return 'role';
  if (/project|short film|production|built|created|wrote|directed|organised|organized/i.test(t) && days > 14) return 'project';
  if (/\b(award|won|winner|medal|selected|certificate|distinction|champion)/i.test(title) && !/prep|practice|class/i.test(title)) return 'achievement';
  return 'activity';
}

const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const importKey = (title, start) => `managebac:${slug(title)}:${start || ''}`;

/* The whole report → { studentName, activities[] } */
export function parseCasReport(rawLines) {
  let studentName = '';
  const lines = [];
  rawLines.forEach(l => {
    const footName = l.text.match(/^(.+?) - CAS$/);
    if (footName) {
      studentName = studentName || footName[1].trim();
      return;
    }
    if (FOOTER.test(l.text)) return;
    lines.push(l);
  });
  if (!studentName) {
    /* Page 1 header: "The British School" then the student's name. */
    const first = rawLines.filter(l => l.page === 1).slice(0, 4).map(l => l.text);
    const at = first.indexOf('The British School');
    if (at >= 0 && first[at + 1]) studentName = first[at + 1];
  }

  const starts = [];
  lines.forEach((l, i) => {
    if (DATES.test(l.text) && i > 0) starts.push(i);
  });

  const activities = starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] - 1 : lines.length;
    const body = lines.slice(s, end);
    const [, fromText, toText] = lines[s].text.match(DATES);
    const title = lines[s - 1].text.replace(/^CAS Reflections\s*By Activity$/, '').trim();

    const desc = [];
    const outcomes = [];
    const tags = new Set();
    const reflections = [];
    const files = [];
    let supervisor = '';
    let mode = 'desc';
    let cur = null;
    let descX = null;

    body.slice(1).forEach(l => {
      const t = l.text;
      if (/^Supervisor Name:/.test(t)) {
        supervisor = t.replace(/^Supervisor Name:\s*/, '');
        mode = 'sup';
        return;
      }
      if (END.test(t)) {
        mode = 'end';
        return;
      }
      const day = t.match(DAY);
      if (day) {
        mode = 'entry';
        cur = { date: isoDate(day[2]), parts: [] };
        reflections.push(cur);
        if (day[3]) TAG_NAMES.forEach(n => day[3].includes(n) && tags.add(n));
        return;
      }
      if (mode === 'desc') {
        const text = t.replace(/^Activity Description\s*/, '');
        if (/^Activity Description/.test(t)) descX = null;
        if (/^\d+\.\s/.test(text)) outcomes.push(text.replace(/^\d+\.\s*/, ''));
        else if (outcomes.length) outcomes[outcomes.length - 1] += ` ${text}`;
        else if (text) desc.push(text);
        return;
      }
      if (mode === 'sup') {
        if (/@/.test(t)) return;
        return;
      }
      if (mode === 'entry') {
        if (isTagLine(t)) {
          TAG_NAMES.forEach(n => t.includes(n) && tags.add(n));
          return;
        }
        if (FILE.test(t)) {
          files.push(t);
          return;
        }
        /* Photo captions sit under thumbnails: short, often several on one
         * line, and before any reflection text. */
        if (!cur.parts.length && (t.length < 45 || l.gaps > 0)) return;
        cur.parts.push(t);
      }
    });

    const start = isoDate(fromText);
    const finish = isoDate(toText);
    const description = desc.join(' ').replace(/\s+/g, ' ').trim();
    const allReflections = reflections
      .map(r => ({ date: r.date, text: r.parts.join(' ').replace(/\s+/g, ' ').trim() }))
      .filter(r => r.text.split(/\s+/).length >= 8)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const skills = [];
    OUTCOMES.forEach(o => {
      if ((tags.has(o.tag) || outcomes.some(x => o.re.test(x))) && !skills.includes(o.skill)) skills.push(o.skill);
    });

    const words = `${title} ${description} ${allReflections.map(r => r.text).join(' ')}`;
    return {
      key: importKey(title, start),
      title,
      start,
      end: finish,
      description,
      outcomes,
      skills,
      reflections: allReflections,
      files: files.length,
      supervisor: supervisor ? true : false,
      domain: guessArea(`${title} ${description}`) !== 'other' ? guessArea(`${title} ${description}`) : guessArea(words),
      entry_type: guessType(title, description, start, finish)
    };
  });

  return { studentName, activities };
}

/* ---------------- name check ---------------- */

const nameTokens = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);

/* True when the report's name and the student's name are the same person,
 * allowing for a missing middle name or a different order. */
export function namesMatch(reportName, studentName) {
  const a = nameTokens(reportName);
  const b = nameTokens(studentName);
  if (!a.length || !b.length) return false;
  const shared = a.filter(w => b.includes(w)).length;
  return shared >= Math.min(2, a.length, b.length) && (a[0] === b[0] || shared >= 2);
}

/* ---------------- activity → Journey Moment ---------------- */

export function momentFromActivity(a, { reflection = a.reflections[0]?.text || '' } = {}) {
  return {
    entry_type: a.entry_type,
    domain: a.domain,
    title: a.title,
    event_date: a.start || '',
    end_date: a.end && a.end !== a.start ? a.end : null,
    organisation: '',
    level: 'School',
    description: a.description,
    reflection,
    skills: a.skills.slice(0, 5)
  };
}
