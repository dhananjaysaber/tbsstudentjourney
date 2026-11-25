/* The downloadable CV, drawn as a real PDF inside the app with react-pdf.
 * Same content as the on-screen preview (both read buildCvModel), so the
 * file is identical in Chrome, Firefox, Safari and on phones.
 * Loaded only when someone presses "Download PDF". */

import React from 'react';
import {
  Document,
  Font,
  Image,
  LinearGradient,
  Page,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  StyleSheet,
  Svg,
  Defs,
  Text,
  View
} from '@react-pdf/renderer';

import playfair400 from '@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff?url';
import playfair400i from '@fontsource/playfair-display/files/playfair-display-latin-400-italic.woff?url';
import playfair600 from '@fontsource/playfair-display/files/playfair-display-latin-600-normal.woff?url';
import playfair600i from '@fontsource/playfair-display/files/playfair-display-latin-600-italic.woff?url';
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff?url';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import mono400 from '@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff?url';

Font.register({
  family: 'Playfair',
  fonts: [
    { src: playfair400 },
    { src: playfair400i, fontStyle: 'italic' },
    { src: playfair600, fontWeight: 600 },
    { src: playfair600i, fontWeight: 600, fontStyle: 'italic' }
  ]
});
Font.register({
  family: 'Inter',
  fonts: [{ src: inter400 }, { src: inter500, fontWeight: 500 }, { src: inter600, fontWeight: 600 }]
});
Font.register({ family: 'Mono', src: mono400 });
Font.registerHyphenationCallback(word => [word]); // never split words

const C = {
  navy: '#151449',
  navyDeep: '#100f3a',
  navyLift: '#26247a',
  gold: '#eec058',
  goldDeep: '#b8892a',
  taupe: '#998670',
  beige: '#decaba',
  grey: '#e7e7e7',
  ink: '#1d1c33',
  soft: '#5d5b72',
  lav: '#c9c7e6',
  aboutInk: '#e6e5f4',
  cardInk: '#dddcef'
};

const PAGE_W = 595.28;
const PAD_X = 33;
const TOP = 28; // top margin on continuation pages

const s = StyleSheet.create({
  page: { paddingTop: TOP, paddingBottom: 46, fontFamily: 'Inter', color: C.ink, backgroundColor: '#ffffff' },
  mono: { fontFamily: 'Mono', textTransform: 'uppercase' },

  hero: { marginTop: -TOP, overflow: 'hidden', backgroundColor: C.navy, paddingTop: 26, paddingBottom: 20, paddingHorizontal: PAD_X, position: 'relative' },
  heroBg: { position: 'absolute', top: 0, left: 0 },
  watermark: { position: 'absolute', right: -10, bottom: -38, fontFamily: 'Playfair', fontWeight: 600, fontSize: 165, color: '#ffffff', opacity: 0.035 },
  goldLine: { height: 2.2 },

  id: { flexDirection: 'row', alignItems: 'center' },
  photoRing: { width: 84, height: 84, borderRadius: 42, borderWidth: 1.1, borderColor: C.gold, padding: 3, marginRight: 18 },
  photo: { width: 76, height: 76, borderRadius: 38, objectFit: 'cover' },
  initials: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#2a2873', alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontFamily: 'Playfair', fontSize: 28, color: C.gold },
  idText: { flex: 1 },
  kicker: { fontSize: 6.4, letterSpacing: 1.1, color: C.gold },
  name: { fontFamily: 'Playfair', fontWeight: 600, fontSize: 28, color: '#ffffff', marginTop: 5, lineHeight: 1.08 },
  pref: { fontFamily: 'Playfair', fontStyle: 'italic', fontSize: 9.8, color: C.lav, marginTop: 1 },
  headline: { fontFamily: 'Playfair', fontStyle: 'italic', fontSize: 11.6, color: C.gold, marginTop: 6, lineHeight: 1.35 },
  qrBox: { width: 66, marginLeft: 14, alignItems: 'center' },
  qr: { width: 64, height: 64, padding: 6, backgroundColor: '#ffffff', borderRadius: 4 },
  qrText: { fontSize: 5.2, letterSpacing: 0.8, color: C.lav, marginTop: 5, textAlign: 'center', lineHeight: 1.5 },

  facts: { flexDirection: 'row', marginTop: 15, borderTopWidth: 0.6, borderBottomWidth: 0.6, borderColor: '#3b3a6e' },
  fact: { flex: 1, paddingVertical: 7, alignItems: 'center' },
  factRule: { borderLeftWidth: 0.6, borderColor: '#3b3a6e' },
  factLabel: { fontSize: 5.2, letterSpacing: 1, color: C.lav },
  factValue: { fontSize: 8.6, fontWeight: 600, color: '#ffffff', marginTop: 3 },
  factAccent: { color: C.gold },

  lblRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  lbl: { fontSize: 6, letterSpacing: 1.1, color: C.gold, marginRight: 6 },
  lblRule: { flex: 1, height: 0.6, backgroundColor: '#7c6a45' },

  about: { flexDirection: 'row', marginTop: 15 },
  aboutText: { fontSize: 8.6, lineHeight: 1.62, color: C.aboutInk },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { fontSize: 7, paddingVertical: 2.4, paddingHorizontal: 6.5, borderRadius: 10, borderWidth: 0.7, borderColor: '#8d7646', color: '#f3ead2', marginRight: 4, marginBottom: 4 },
  chipSolid: { backgroundColor: '#3a3554', borderColor: '#3a3554', color: '#ffffff' },

  trio: { flexDirection: 'row', marginTop: 14 },
  card: { flex: 1, borderWidth: 0.7, borderColor: '#38376a', backgroundColor: '#1b1a52', borderRadius: 3, paddingVertical: 9, paddingHorizontal: 10 },
  cardText: { fontSize: 7.6, lineHeight: 1.5, color: C.cardInk },
  cardProud: { fontFamily: 'Playfair', fontStyle: 'italic', fontSize: 9, lineHeight: 1.42, color: '#ffffff' },

  nums: { flexDirection: 'row', marginHorizontal: PAD_X, borderBottomWidth: 0.7, borderColor: C.grey },
  num: { flex: 1, alignItems: 'center', paddingTop: 11, paddingBottom: 9 },
  numRule: { borderLeftWidth: 0.7, borderColor: C.grey },
  numValue: { fontFamily: 'Playfair', fontWeight: 600, fontSize: 21, color: C.goldDeep },
  numLabel: { fontSize: 5.4, letterSpacing: 1, color: C.soft, marginTop: 4 },

  body: { flexDirection: 'row', paddingHorizontal: PAD_X, paddingTop: 13 },
  main: { flex: 1, marginRight: 19 },
  side: { width: 160 },
  hRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  h: { fontSize: 6.2, letterSpacing: 1.2, color: C.goldDeep, marginRight: 7 },
  hRule: { flex: 1, height: 0.7, backgroundColor: C.beige },
  section: { marginBottom: 15 },

  awards: { borderWidth: 0.9, borderColor: C.gold, borderRadius: 3, paddingHorizontal: 12, paddingVertical: 3, backgroundColor: '#fffcf5' },
  award: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: 0.6, borderColor: '#eadfcf', borderStyle: 'dashed' },
  awardLast: { borderBottomWidth: 0 },
  awardText: { flex: 1, marginLeft: 8 },
  awardTitle: { fontFamily: 'Playfair', fontWeight: 600, fontSize: 9.4, color: C.navy },
  awardDetail: { fontSize: 7, color: C.soft, marginTop: 1.5 },
  badge: { fontSize: 5.6, letterSpacing: 0.7, color: C.navy, backgroundColor: '#f6eedc', paddingVertical: 2.4, paddingHorizontal: 5, borderRadius: 8, marginLeft: 6, marginTop: 1 },

  awardMeta: { fontSize: 6.4, color: C.taupe, marginTop: 1.5 },
  awardStory: { fontSize: 7, color: C.soft, lineHeight: 1.5, marginTop: 3 },
  awardQuote: { marginTop: 4, paddingLeft: 6, borderLeftWidth: 1.1, borderColor: C.gold },
  awardQuoteText: { fontFamily: 'Playfair', fontStyle: 'italic', fontSize: 8, lineHeight: 1.4, color: C.navy },
  awardQuoteBy: { fontSize: 5, letterSpacing: 1, color: C.goldDeep, marginTop: 1.5 },
  year: { fontFamily: 'Playfair', fontSize: 10.5, color: C.navy, marginTop: 3, marginBottom: 3 },
  exp: { flexDirection: 'row', paddingVertical: 4.5 },
  expDate: { width: 50, fontSize: 5.7, letterSpacing: 0.9, color: C.taupe, paddingTop: 2 },
  expBody: { flex: 1 },
  expTitle: { fontSize: 8.1, fontWeight: 600, color: C.ink },
  expMeta: { fontSize: 6.4, color: C.taupe, marginTop: 1 },
  expText: { fontSize: 7.2, color: C.soft, lineHeight: 1.5, marginTop: 1.5 },
  expReflect: { fontFamily: 'Playfair', fontStyle: 'italic', fontSize: 7.6, color: C.navy, lineHeight: 1.45, marginTop: 1.5 },
  expTags: { fontSize: 5.3, letterSpacing: 0.9, color: C.goldDeep, marginTop: 2.5 },

  skill: { marginBottom: 6 },
  skillRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2.4 },
  skillName: { fontSize: 7.4 },
  skillCount: { fontFamily: 'Mono', fontSize: 5.7, color: C.taupe },
  bar: { height: 3, backgroundColor: '#efebe4', borderRadius: 2 },

  teamRow: { marginBottom: 5 },
  team: { fontSize: 7.4, lineHeight: 1.5 },
  teamName: { fontWeight: 600 },
  teamSeason: { color: C.taupe },
  teamStats: { fontSize: 6.6, color: C.goldDeep, marginTop: 1, lineHeight: 1.4 },
  mainFull: { flex: 1 },
  full: { paddingHorizontal: PAD_X, paddingTop: 2 },

  coach: { backgroundColor: C.navy, borderRadius: 3, paddingHorizontal: 11, paddingTop: 9, paddingBottom: 9 },
  coachMark: { fontFamily: 'Playfair', fontSize: 28, lineHeight: 1, color: C.gold, marginBottom: -10 },
  coachText: { fontFamily: 'Playfair', fontStyle: 'italic', fontSize: 9.4, lineHeight: 1.4, color: '#ffffff' },
  coachBy: { fontSize: 5.3, letterSpacing: 0.9, color: C.gold, marginTop: 6, lineHeight: 1.5 },

  foot: { position: 'absolute', bottom: 16, left: PAD_X, right: PAD_X, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 0.7, borderColor: C.grey, paddingTop: 7 },
  footLeft: { flexDirection: 'row', alignItems: 'center' },
  footText: { fontSize: 5.4, letterSpacing: 0.9, color: C.navy, marginLeft: 5 },
  issued: { position: 'absolute', bottom: 7, left: PAD_X, right: PAD_X, fontSize: 5, color: C.taupe, textAlign: 'right' },
  footRight: { fontSize: 5.4, letterSpacing: 0.9, color: C.taupe }
});

function Label({ children, dark = true }) {
  return (
    <View style={s.lblRow}>
      <Text style={[s.mono, s.lbl]}>{children}</Text>
      {dark && <View style={s.lblRule} />}
    </View>
  );
}

function Heading({ children }) {
  return (
    <View style={s.hRow} minPresenceAhead={40}>
      <Text style={[s.mono, s.h]}>{children}</Text>
      <View style={s.hRule} />
    </View>
  );
}

function Medal() {
  return (
    <Svg width={19} height={19} viewBox="0 0 26 26">
      <Defs>
        <RadialGradient id="medal" cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#fbe3a3" />
          <Stop offset="0.55" stopColor={C.gold} />
          <Stop offset="1" stopColor="#c89a3a" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="26" height="26" rx="13" fill="url(#medal)" />
      <Polygon
        points="13,6.2 14.9,10.6 19.6,11 16,14.1 17.1,18.8 13,16.3 8.9,18.8 10,14.1 6.4,11 11.1,10.6"
        fill={C.navy}
      />
    </Svg>
  );
}

function Shield() {
  return (
    <Svg width={9} height={9} viewBox="0 0 24 24">
      <Path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" stroke={C.goldDeep} strokeWidth={2} fill="none" />
      <Path d="M9 12l2 2 4-4" stroke={C.goldDeep} strokeWidth={2} fill="none" />
    </Svg>
  );
}

function HeroBackground() {
  return (
    <Svg style={s.heroBg} width={PAGE_W} height={620} viewBox={`0 0 ${PAGE_W} 620`}>
      <Defs>
        <RadialGradient id="lift" cx="0" cy="0" r="1" fx="0" fy="0">
          <Stop offset="0" stopColor={C.navyLift} />
          <Stop offset="0.55" stopColor={C.navy} />
          <Stop offset="1" stopColor={C.navyDeep} />
        </RadialGradient>
        <RadialGradient id="glow" cx="0.92" cy="-0.05" r="0.55">
          <Stop offset="0" stopColor={C.gold} stopOpacity="0.17" />
          <Stop offset="1" stopColor={C.gold} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={PAGE_W} height="620" fill="url(#lift)" />
      <Rect x="0" y="0" width={PAGE_W} height="620" fill="url(#glow)" />
    </Svg>
  );
}

function GoldLine() {
  return (
    <Svg style={s.goldLine} width={PAGE_W} height={2.2}>
      <Defs>
        <LinearGradient id="gl" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.goldDeep} />
          <Stop offset="0.3" stopColor={C.gold} />
          <Stop offset="0.5" stopColor="#f8e2a4" />
          <Stop offset="0.7" stopColor={C.gold} />
          <Stop offset="1" stopColor={C.goldDeep} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={PAGE_W} height={2.2} fill="url(#gl)" />
    </Svg>
  );
}

function Bar({ share }) {
  const width = Math.max(0.08, Math.min(1, share)) * 160;
  return (
    <Svg width={160} height={3}>
      <Defs>
        <LinearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.goldDeep} />
          <Stop offset="1" stopColor={C.gold} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="160" height="3" rx="1.5" fill="#efebe4" />
      <Rect x="0" y="0" width={width} height="3" rx="1.5" fill="url(#bar)" />
    </Svg>
  );
}


/* ---------- body pieces ---------- */
/* Awards & Recognition: the list box beside the side column, each award
 * with its write-up and the words said about it. */
function AwardsBlock({ awards }) {
  if (!awards.length) return null;
  return (
    <View style={s.section}>
      <View wrap={false}>
        <Heading>Awards &amp; Recognition</Heading>
      </View>
      <View style={s.awards}>
        {awards.map((award, index) => (
          <View key={award.id} style={[s.award, index === awards.length - 1 ? s.awardLast : null]} wrap={false}>
            <Medal />
            <View style={s.awardText}>
              <Text style={s.awardTitle}>{award.heading}</Text>
              {award.meta ? <Text style={s.awardMeta}>{award.meta}</Text> : null}
              {award.story ? <Text style={s.awardStory}>{award.story}</Text> : null}
              {award.quote ? (
                <View style={s.awardQuote}>
                  <Text style={s.awardQuoteText}>“{award.quote}”</Text>
                  {award.quoteBy ? <Text style={[s.mono, s.awardQuoteBy]}>— {award.quoteBy}</Text> : null}
                </View>
              ) : null}
              {award.report ? <Text style={s.awardStory}>Match report: {award.report}</Text> : null}
            </View>
            {award.badge ? <Text style={[s.mono, s.badge]}>{award.badge}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function ExperienceItems({ items }) {
  return items.map(item =>
    item.type === 'year' ? (
      <Text key={`y-${item.year}`} style={s.year} minPresenceAhead={50}>{item.year}</Text>
    ) : (
      <View key={item.row.id} style={s.exp} wrap={false}>
        <Text style={[s.mono, s.expDate]}>{item.row.date}</Text>
        <View style={s.expBody}>
          <Text style={s.expTitle}>{item.row.title}</Text>
          {item.row.meta ? (
            <Text style={s.expMeta}>
              {item.row.meta}
              {item.row.verified ? ' · Verified' : ''}
            </Text>
          ) : null}
          {item.row.text ? <Text style={s.expText}>{item.row.text}</Text> : null}
          {item.row.reflection ? <Text style={s.expReflect}>“{item.row.reflection}”</Text> : null}
          {item.row.tags.length ? <Text style={[s.mono, s.expTags]}>{item.row.tags.join(' · ')}</Text> : null}
        </View>
      </View>
    )
  );
}

function SideColumn({ m }) {
  return (
    <View style={s.side}>
      {m.skills.rows.length ? (
        <View style={s.section} wrap={false}>
          <Heading>{m.skills.mode === 'skills' ? 'Skills · evidenced' : 'Areas · evidenced'}</Heading>
          {m.skills.rows.map((row, index) => (
            <View key={row.label} style={s.skill}>
              <View style={s.skillRow}>
                <Text style={s.skillName}>{row.label}</Text>
                <Text style={s.skillCount}>
                  {row.count}
                  {index === 0 ? ` moment${row.count === 1 ? '' : 's'}` : ''}
                </Text>
              </View>
              <Bar share={row.share} />
            </View>
          ))}
        </View>
      ) : null}

      {m.teams.length ? (
        <View style={s.section} wrap={false}>
          <Heading>Panthers · in numbers</Heading>
          {m.teams.map(team => (
            <View key={team.id} style={s.teamRow}>
              <Text style={s.team}>
                <Text style={s.teamName}>{team.name}</Text>
                {team.seasons ? <Text style={s.teamSeason}> · {team.seasons}</Text> : null}
              </Text>
              {team.stats.length ? <Text style={s.teamStats}>{team.stats.join(' · ')}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {m.quote ? (
        <View style={s.coach} wrap={false}>
          <Text style={s.coachMark}>“</Text>
          <Text style={s.coachText}>{m.quote.text}</Text>
          <Text style={[s.mono, s.coachBy]}>— {m.quote.attribution}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ---------- where Experience switches to full width ----------
 * react-pdf has no floats, so heights are estimated from text length:
 * moments go beside the side column until the column is used up. */
const COL_TEXT = 350 - 50; // main column minus the date gutter
const lines = (text, fontSize, width, em = 0.5) =>
  text ? Math.max(1, Math.ceil((String(text).length * fontSize * em) / width)) : 0;

function rowHeight(row, width) {
  return (
    9 +
    lines(row.title, 8.1, width, 0.55) * 10 +
    (row.meta ? 8.5 : 0) +
    lines(row.text, 7.2, width) * 10.8 +
    (row.reflection ? lines(row.reflection, 7.6, width, 0.45) * 11 + 1.5 : 0) +
    (row.tags.length ? 9 : 0)
  );
}

function awardHeight(award) {
  const w = 350 - 24 - 19 - 60; // box padding, medal, badge
  return (
    12 +
    lines(award.heading, 9.4, w, 0.5) * 11.5 +
    (award.meta ? 9 : 0) +
    (award.story ? lines(award.story, 7, w) * 10.5 + 3 : 0) +
    (award.quote ? lines(award.quote, 8, w - 8, 0.45) * 11.2 + 12 : 0) +
    (award.report ? lines(`Match report: ${award.report}`, 7, w) * 10.5 + 3 : 0)
  );
}

function sideHeight(m) {
  let h = 0;
  if (m.skills.rows.length) h += 15 + m.skills.rows.length * 18.5 + 15;
  if (m.teams.length) h += 15 + m.teams.reduce((sum, t) => sum + 13 + (t.stats.length ? lines(t.stats.join(' · '), 6.6, 160) * 9 : 0) + 4, 0) + 15;
  if (m.quote) h += 22 + lines(m.quote.text, 9.4, 138, 0.45) * 13.2 + lines(m.quote.attribution, 5.3, 138, 0.75) * 8 + 9;
  return h;
}

/* How many items open the full-width part: a year heading plus its first moment. */
const leadCount = items => (items[0]?.type === 'year' ? Math.min(2, items.length) : Math.min(1, items.length));

function splitLayout(m) {
  const side = sideHeight(m);
  const items = [];
  m.experience.forEach(group => {
    items.push({ type: 'year', year: group.year });
    group.rows.forEach(row => items.push({ type: 'row', row }));
  });
  if (!side) return { columnItems: [], fullItems: items, headingInColumn: false };

  let used = m.awards.length
    ? 15 + 8 + m.awards.reduce((sum, a) => sum + awardHeight(a), 0) + 15
    : 0;
  let cut = 0;
  if (items.length) {
    used += 15; // "Experience" heading
    // A moment goes beside the side column only if it fits there completely;
    // a year heading only if its first moment fits too.
    while (cut < items.length) {
      const item = items[cut];
      const next = items[cut + 1];
      const need =
        item.type === 'year'
          ? 19 + (next && next.type === 'row' ? rowHeight(next.row, COL_TEXT) : 0)
          : rowHeight(item.row, COL_TEXT);
      if (used + need > side) break;
      used += item.type === 'year' ? 19 : need;
      cut += 1;
    }
    if (cut && items[cut - 1].type === 'year') cut -= 1;
  }
  return {
    columnItems: items.slice(0, cut),
    fullItems: items.slice(cut),
    headingInColumn: cut > 0
  };
}

export default function CvPdf({ model: m, photo, qr, issuedTo = '' }) {
  const cards = [
    m.proud ? { key: 'proud', label: 'Proud moment', text: `“${m.proud}”`, proud: true } : null,
    m.goals ? { key: 'goals', label: 'Goals · this year', text: m.goals } : null,
    m.nextChapter ? { key: 'next', label: 'Next chapter', text: m.nextChapter } : null
  ].filter(Boolean);
  const hasChips = Boolean(m.strengths.length || m.interests.length);
  const hasSide = Boolean(m.skills.rows.length || m.teams.length || m.quote);
  const layout = splitLayout(m);

  return (
    <Document title={`${m.name} — TBS Student Journey Portfolio`} author="The British School, New Delhi" subject="TBS Student Journey Portfolio" creator="TBS Student Portfolio">
      <Page size="A4" style={s.page}>
        {/* ================= navy cover ================= */}
        <View style={s.hero} wrap={false}>
          <HeroBackground />
          <Text style={s.watermark}>TBS</Text>

          <View style={s.id}>
            <View style={s.photoRing}>
              {photo ? (
                <Image src={photo} style={s.photo} />
              ) : (
                <View style={s.initials}>
                  <Text style={s.initialsText}>{m.initials}</Text>
                </View>
              )}
            </View>
            <View style={s.idText}>
              <Text style={[s.mono, s.kicker]}>TBS Student Journey Portfolio · The British School, New Delhi</Text>
              <Text style={s.name}>{m.name}</Text>
              {m.preferred ? (
                <Text style={s.pref}>
                  Known as <Text style={{ color: C.gold }}>{m.preferred}</Text>
                </Text>
              ) : null}
              {m.headline ? <Text style={s.headline}>{m.headline}</Text> : null}
            </View>
            {qr ? (
              <View style={s.qrBox}>
                <Image src={qr} style={s.qr} />
                <Text style={[s.mono, s.qrText]}>Scan · live portfolio</Text>
              </View>
            ) : null}
          </View>

          <View style={s.facts}>
            {m.facts.map((fact, index) => (
              <View key={fact.label} style={[s.fact, index ? s.factRule : null]}>
                <Text style={[s.mono, s.factLabel]}>{fact.label}</Text>
                <Text style={[s.mono, s.factValue]}>
                  {fact.value}
                  {fact.accent ? <Text style={s.factAccent}> · {fact.accent}</Text> : null}
                </Text>
              </View>
            ))}
          </View>

          {m.about || hasChips ? (
            <View style={s.about}>
              {m.about ? (
                <View style={{ flex: 1.25, marginRight: hasChips ? 20 : 0 }}>
                  <Label>About me</Label>
                  <Text style={s.aboutText}>{m.about}</Text>
                </View>
              ) : null}
              {hasChips ? (
                <View style={{ flex: 1 }}>
                  {m.strengths.length ? (
                    <View style={{ marginBottom: 6 }}>
                      <Label>Strengths</Label>
                      <View style={s.chips}>
                        {m.strengths.map(item => (
                          <Text key={item} style={[s.chip, s.chipSolid]}>{item}</Text>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {m.interests.length ? (
                    <View>
                      <Label>Interests</Label>
                      <View style={s.chips}>
                        {m.interests.map(item => (
                          <Text key={item} style={s.chip}>{item}</Text>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          {cards.length ? (
            <View style={s.trio}>
              {cards.map((card, index) => (
                <View key={card.key} style={[s.card, index < cards.length - 1 ? { marginRight: 9 } : null]}>
                  <Label>{card.label}</Label>
                  <Text style={card.proud ? s.cardProud : s.cardText}>{card.text}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <GoldLine />

        {/* ================= the record ================= */}
        {m.numbers.length ? (
          <View style={s.nums} wrap={false}>
            {m.numbers.map((item, index) => (
              <View key={item.label} style={[s.num, index ? s.numRule : null]}>
                <Text style={s.numValue}>{item.value}</Text>
                <Text style={[s.mono, s.numLabel]}>{item.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Side column beside awards and the first moments; the rest of the
            Experience list then runs full width, so there is never a gap. */}
        {layout.columnItems.length || m.awards.length || hasSide ? (
          <View style={s.body}>
            <View style={hasSide ? s.main : s.mainFull}>
              <AwardsBlock awards={m.awards} />
              {layout.headingInColumn ? <Heading>Experience</Heading> : null}
              <ExperienceItems items={layout.columnItems} />
            </View>
            {hasSide ? <SideColumn m={m} /> : null}
          </View>
        ) : null}

        {layout.fullItems.length ? (
          <View style={s.full}>
            {/* keep the heading with the first year and moment (no lone heading at a page end) */}
            <View wrap={false}>
              {!layout.headingInColumn ? <Heading>Experience</Heading> : null}
              <ExperienceItems items={layout.fullItems.slice(0, leadCount(layout.fullItems))} />
            </View>
            <ExperienceItems items={layout.fullItems.slice(leadCount(layout.fullItems))} />
          </View>
        ) : null}

        <View style={s.foot} fixed>
          <View style={s.footLeft}>
            <Shield />
            <Text style={[s.mono, s.footText]}>Verified moments and all Panthers records are confirmed by TBS</Text>
          </View>
          <Text
            style={[s.mono, s.footRight]}
            render={({ pageNumber, totalPages }) => `${m.name} · Page ${pageNumber} of ${totalPages}`}
          />
        </View>
        {issuedTo ? (
          <Text
            fixed
            style={s.issued}
            render={() => `Issued to ${issuedTo} on ${m.issued} · TBS Student Portfolio`}
          />
        ) : null}
      </Page>
    </Document>
  );
}
