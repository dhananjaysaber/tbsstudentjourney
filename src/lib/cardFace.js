/* The approved gallery card, drawn to a canvas for the 3D galleries:
 *   header — AREA · YEAR (gold small caps) and the moment's number (italic)
 *   photo  — cover-fit in a rounded frame
 *   footer — title (up to 2 lines), top skill tag, "Open story →"
 * Drawn from the full-size photo, so what shows on the card stays sharp. */

const NAVY = '#141a5e';
const GOLD = '#e8c066';

let fontsReady = null;
export function cardFontsReady() {
  if (!fontsReady) {
    fontsReady = document.fonts
      ? Promise.all([
          document.fonts.load('500 40px "Playfair Display"'),
          document.fonts.load('italic 500 40px "Playfair Display"'),
          document.fonts.load('20px "DM Mono"'),
          document.fonts.load('500 20px Inter')
        ]).catch(() => {})
      : Promise.resolve();
  }
  return fontsReady;
}

const AREA = {
  academic: 'Academic',
  sport: 'Sport',
  creative_arts: 'Creative Arts',
  leadership: 'Leadership',
  service: 'Service',
  co_curricular: 'Co-curricular',
  personal: 'Personal',
  other: 'Other'
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach(word => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  });
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

/**
 * card: { domain, year, number, story: { title, skills } }
 * image: a loaded HTMLImageElement / canvas, or null for no photo
 * ratio: card height ÷ width
 */
export function drawCardFace({ card, image = null, ratio = 1.78, width = 1024, withHeader = true }) {
  const W = width;
  const H = Math.round(width * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  /* One unit = the card's width on a portrait card; landscape cards scale
   * the header and footer down so the photo keeps its space. */
  const u = Math.min(W, H / 1.15) / 300;

  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);

  /* Without a header the photo starts near the top edge. */
  const header = withHeader ? 46 * u : 10 * u;
  const footer = (ratio < 1 ? 96 : 118) * u; /* tighter on wide cards */
  const side = 18 * u;
  const inset = 10 * u;

  /* header */
  if (withHeader) {
    const area = (AREA[card.domain] || 'Journey').toUpperCase();
    const label = card.year ? `${area} · ${card.year}` : area;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = GOLD;
    ctx.font = `${10 * u}px "DM Mono", monospace`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${1.8 * u}px`;
    ctx.fillText(label, side, header / 2);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = `italic 500 ${18 * u}px "Playfair Display", Georgia, serif`;
    ctx.fillText(card.number || '', W - side, header / 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    ctx.fillRect(0, header - Math.max(1, u), W, Math.max(1, u));
  }

  /* photo */
  const px = inset;
  const py = header;
  const pw = W - inset * 2;
  const ph = H - header - footer;
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 12 * u);
  ctx.clip();
  if (image) {
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    const scale = Math.max(pw / iw, ph / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(px, py, px + pw, py + ph);
    g.addColorStop(0, '#24236a');
    g.addColorStop(1, '#0d0c33');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, pw, ph);
  }
  ctx.restore();

  /* footer: title */
  const title = card.story?.title || card.title || 'Journey moment';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.font = `500 ${19 * u}px "Playfair Display", Georgia, serif`;
  const lines = wrap(ctx, title, W - side * 2, 2);
  const titleTop = H - footer + 16 * u;
  lines.forEach((line, i) => ctx.fillText(line, side, titleTop + i * 22.5 * u));

  /* footer: skill tag + Open story */
  const rowY = H - 16 * u - 24 * u;
  const skill = (card.story?.skills || [])[0];
  if (skill) {
    ctx.font = `${11 * u}px Inter, system-ui, sans-serif`;
    const tw = ctx.measureText(skill).width + 18 * u;
    roundRect(ctx, side, rowY, tw, 24 * u, 8 * u);
    ctx.strokeStyle = 'rgba(232,192,102,.45)';
    ctx.lineWidth = Math.max(1, u);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.textBaseline = 'middle';
    ctx.fillText(skill, side + 9 * u, rowY + 12 * u);
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,.65)';
  ctx.font = `${10 * u}px "DM Mono", monospace`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${1.2 * u}px`;
  ctx.fillText('Open story →', W - side, rowY + 12 * u);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';

  return canvas;
}

/* Order cards round a closed ring so the same photo never sits next to
 * itself (and, where possible, the same moment neither). */
export function ringOrder(cards, count) {
  if (!cards.length) return [];
  const uses = new Map();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const prev = out[i - 1];
    const first = out[0];
    let best = null;
    let bestScore = Infinity;
    cards.forEach((c, k) => {
      let score = (uses.get(c.key) || 0) * 10 + k * 0.001;
      if (prev && prev.key === c.key) score += 1000;
      if (prev && prev.story?.id === c.story?.id) score += 100;
      if (i === count - 1 && first) {
        if (first.key === c.key) score += 1000;
        if (first.story?.id === c.story?.id) score += 100;
      }
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    });
    out.push(best);
    uses.set(best.key, (uses.get(best.key) || 0) + 1);
  }
  return out;
}
