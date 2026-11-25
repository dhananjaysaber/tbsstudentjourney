/* =========================================================================
   STUDENT CARDS
   Every student on the landing page is a small student card with a
   graduation cap on top: photo (or initials) and first name. The look
   comes from the student's opaque key, so the same student always gets the
   same card: its size, the ribbon colour, how the cap sits, and when the
   cap spins.
   ========================================================================= */

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* Ribbon colours, all from the TBS palette. */
export const RIBBONS = ['#e7c069', '#dacabe', '#9c8d7a', '#051f52'];

/* Card body sizes (the cap sits above, inside CAP px). */
export const CARD_SIZES = {
  desktop: [
    { w: 62, h: 68, photo: 34 },
    { w: 70, h: 78, photo: 40 },
    { w: 78, h: 88, photo: 46 }
  ],
  mobile: [
    { w: 50, h: 56, photo: 28 },
    { w: 56, h: 62, photo: 32 },
    { w: 62, h: 70, photo: 36 }
  ]
};

export const CAP = { desktop: 22, mobile: 18 };

/* The largest card, used to space the orbits. */
export function maxCard(mobile) {
  const sizes = CARD_SIZES[mobile ? 'mobile' : 'desktop'];
  const big = sizes[sizes.length - 1];
  return { w: big.w, h: big.h + CAP[mobile ? 'mobile' : 'desktop'] };
}

export function cardOf(person) {
  const h = hash(String(person?.key || person?.name || '•'));
  const r = (h >>> 3) % 10;
  const size = r < 3 ? 0 : r < 7 ? 1 : 2; // 30% small, 40% medium, 30% large
  return {
    size,
    ribbon: RIBBONS[(h >>> 7) % RIBBONS.length],
    tilt: -14 + ((h >>> 11) % 29), // cap tilt, -14° … +14°
    spinDelay: ((h >>> 17) % 90) / 10, // 0 … 9s, so caps don't spin together
    sway: 2.6 + ((h >>> 21) % 16) / 10 // tassel swing, seconds
  };
}

/* Size of the whole button (card + cap) for the orbit layout. */
export function boxOf(person, mobile) {
  const card = CARD_SIZES[mobile ? 'mobile' : 'desktop'][cardOf(person).size];
  return { w: card.w, h: card.h + CAP[mobile ? 'mobile' : 'desktop'], card };
}
