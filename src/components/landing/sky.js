/* =========================================================================
   TBS STUDENT PORTFOLIO · THE UNIVERSE
   A 2D canvas behind the students: layered twinkling stars and a Milky Way
   band, a few faint distant galaxies slowly turning, and frequent shooting
   stars — sometimes in little showers. Purely decorative.
   Colours follow the TBS palette and the light / dark theme.
   ========================================================================= */

const TAU = Math.PI * 2;

/* Star, galaxy and shooting-star colours for each theme (TBS palette). */
const PALETTES = {
  dark: {
    star: '#ffffff',
    warm: '#e7c069',
    cool: '#dacabe',
    streaks: ['255, 255, 255', '255, 255, 255', '231, 192, 105', '218, 202, 190'],
    galaxies: ['231, 192, 105', '218, 202, 190', '255, 255, 255', '231, 192, 105'],
    head: '255, 255, 255',
    strength: 1
  },
  /* Daybreak: no dust, just crisp gold and navy sparkles and gold
   * shooting stars on a warm, light sky. */
  light: {
    star: '#051f52',
    warm: '#d4ab52',
    cool: '#9c8d7a',
    streaks: ['212, 171, 82', '212, 171, 82', '5, 31, 82', '156, 141, 122'],
    galaxies: ['212, 171, 82', '156, 141, 122', '212, 171, 82', '5, 31, 82'],
    head: '231, 192, 105',
    strength: 0.8,
    sparkles: true
  }
};

/* Pre-render one spiral galaxy to an offscreen canvas (drawn once). */
function makeGalaxy(size, tint) {
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const g = c.getContext('2d');
  const cx = size;
  const cy = size;

  const core = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.55);
  core.addColorStop(0, `rgba(${tint}, 0.9)`);
  core.addColorStop(0.12, `rgba(${tint}, 0.45)`);
  core.addColorStop(0.45, `rgba(${tint}, 0.08)`);
  core.addColorStop(1, `rgba(${tint}, 0)`);
  g.fillStyle = core;
  g.fillRect(0, 0, size * 2, size * 2);

  // Two spiral arms of tiny stars
  const arms = 2;
  for (let arm = 0; arm < arms; arm += 1) {
    for (let i = 0; i < 260; i += 1) {
      const t = i / 260;
      const angle = arm * Math.PI + t * 3.4 * Math.PI + (Math.random() - 0.5) * 0.5;
      const radius = t * size * 0.95 + (Math.random() - 0.5) * size * 0.12;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      g.globalAlpha = (1 - t) * 0.55 * Math.random() + 0.05;
      g.fillStyle = Math.random() < 0.2 && tint !== '5, 31, 82' ? '#ffffff' : `rgb(${tint})`;
      const r = Math.random() < 0.08 ? 1.3 : 0.7;
      g.fillRect(x, y, r, r);
    }
  }
  g.globalAlpha = 1;
  return c;
}

export function createSky(canvas, theme = 'dark') {
  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let stars = [];
  let galaxies = [];
  let streaks = [];
  let frame = 0;
  let last = performance.now();
  let time = 0;
  let nextStreak = 0.6;
  let destroyed = false;
  let palette = PALETTES[theme] || PALETTES.dark;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    // A full night sky: lots of faint dust, fewer clear stars, a handful of bright ones.
    const count = Math.round((width * height) / 1000);
    stars = Array.from({ length: count }, () => {
      const layer = Math.random();
      const inBand = Math.random() < 0.4;
      return {
        x: Math.random() * width,
        // A band sweeping across the sky, like the Milky Way.
        y: inBand
          ? height * (0.18 + Math.random() * 0.64) - (Math.random() - 0.5) * 120 + (Math.random() - 0.5) * width * 0.08
          : Math.random() * height,
        r: layer > 0.992 ? 1.9 : layer > 0.95 ? 1.25 : layer > 0.75 ? 0.9 : 0.55,
        bright: layer > 0.992,
        dim: layer <= 0.75 ? 0.35 + Math.random() * 0.3 : 1,
        warm: Math.random() < 0.12,
        cool: Math.random() < 0.1,
        phase: Math.random() * TAU,
        speed: 0.3 + Math.random() * 1.4,
        drift: (layer - 0.5) * 0.6
      };
    });

    // Distant galaxies near the edges, away from the heading.
    const mobile = width < 760;
    const spots = mobile
      ? [
          [0.82, 0.16],
          [0.14, 0.86]
        ]
      : [
          [0.1, 0.2],
          [0.88, 0.14],
          [0.84, 0.82],
          [0.2, 0.9]
        ];
    galaxies = spots.map(([fx, fy], i) => {
      const size = Math.round((mobile ? 46 : 70) + Math.random() * (mobile ? 30 : 60));
      return {
        x: fx * width + (Math.random() - 0.5) * 60,
        y: fy * height + (Math.random() - 0.5) * 40,
        image: makeGalaxy(size, palette.galaxies[i % palette.galaxies.length]),
        tintIndex: i,
        size,
        tilt: 0.3 + Math.random() * 0.45, // vertical squash = viewing angle
        angle: Math.random() * TAU,
        spin: (Math.random() < 0.5 ? -1 : 1) * (0.012 + Math.random() * 0.02),
        alpha: 0.22 + Math.random() * 0.18
      };
    });
  }

  /* Shooting stars come from any edge-ish point and fall diagonally. */
  function spawnStreak(base) {
    const fromLeft = base ? base.fromLeft : Math.random() < 0.5;
    const angle = base
      ? base.angle + (Math.random() - 0.5) * 0.08
      : (fromLeft ? 0.25 : Math.PI - 0.25) + (Math.random() - 0.2) * 0.7;
    const speed = base ? base.speed * (0.9 + Math.random() * 0.2) : 380 + Math.random() * 560;
    const colour = base ? base.colour : palette.streaks[Math.floor(Math.random() * palette.streaks.length)];
    const streak = {
      fromLeft,
      angle,
      speed,
      colour,
      x: base
        ? base.x + (Math.random() - 0.5) * 140
        : fromLeft
        ? Math.random() * width * 0.7
        : width * 0.3 + Math.random() * width * 0.7,
      y: base ? base.y + (Math.random() - 0.5) * 80 : Math.random() * height * 0.55,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      tail: 70 + Math.random() * 170,
      thick: 0.8 + Math.random() * 1.4,
      life: 0,
      ttl: 0.7 + Math.random() * 0.9
    };
    streaks.push(streak);
    return streak;
  }

  function draw(now) {
    if (destroyed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    /* Distant galaxies */
    for (const galaxy of galaxies) {
      if (!reducedMotion) galaxy.angle += galaxy.spin * dt;
      ctx.save();
      ctx.globalAlpha = galaxy.alpha * palette.strength;
      ctx.translate(galaxy.x, galaxy.y);
      ctx.scale(1, galaxy.tilt);
      ctx.rotate(galaxy.angle);
      ctx.drawImage(galaxy.image, -galaxy.size, -galaxy.size);
      ctx.restore();
    }

    /* Stars */
    for (const s of stars) {
      const twinkle = reducedMotion ? 0.8 : 0.55 + 0.45 * Math.sin(time * s.speed + s.phase);
      const x = (s.x + time * s.drift + width) % width;

      if (palette.sparkles) {
        // Light sky: skip the dust; the clearer stars become small sparkles.
        if (s.r <= 0.9) continue;
        const gold = !s.cool && (s.warm || s.phase > 3.4);
        ctx.fillStyle = gold ? palette.warm : s.cool ? palette.cool : palette.star;
        const size = (s.bright ? 7 : s.r > 1.2 ? 4.2 : 2.6) * (0.75 + twinkle * 0.35);
        ctx.globalAlpha = Math.max(0.12, twinkle) * palette.strength * (gold ? 0.95 : 0.5);
        ctx.beginPath();
        ctx.moveTo(x, s.y - size);
        ctx.quadraticCurveTo(x, s.y, x + size, s.y);
        ctx.quadraticCurveTo(x, s.y, x, s.y + size);
        ctx.quadraticCurveTo(x, s.y, x - size, s.y);
        ctx.quadraticCurveTo(x, s.y, x, s.y - size);
        ctx.fill();
        continue;
      }

      ctx.globalAlpha = Math.max(0.1, twinkle) * s.dim * (s.r > 1 ? 1 : 0.8) * palette.strength;
      ctx.fillStyle = s.warm ? palette.warm : s.cool ? palette.cool : palette.star;
      if (s.r > 1.2) {
        ctx.beginPath();
        ctx.arc(x, s.y, s.r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha *= 0.22;
        ctx.beginPath();
        ctx.arc(x, s.y, s.r * 3.4, 0, TAU);
        ctx.fill();
        if (s.bright) {
          // Soft four-point glint on the brightest stars.
          const len = 9 + twinkle * 7;
          ctx.globalAlpha = 0.35 * twinkle * palette.strength;
          ctx.fillRect(x - len, s.y - 0.4, len * 2, 0.8);
          ctx.fillRect(x - 0.4, s.y - len, 0.8, len * 2);
        }
      } else {
        ctx.fillRect(x, s.y, s.r, s.r);
      }
    }
    ctx.globalAlpha = 1;

    /* Shooting stars — every second or two, sometimes a small shower */
    if (!reducedMotion) {
      nextStreak -= dt;
      if (nextStreak <= 0) {
        const lead = spawnStreak();
        const roll = Math.random();
        const extra = roll < 0.12 ? 2 : roll < 0.3 ? 1 : 0;
        for (let i = 0; i < extra; i += 1) {
          window.setTimeout(() => !destroyed && spawnStreak(lead), 120 + i * 180);
        }
        nextStreak = 0.7 + Math.random() * 1.8;
      }

      streaks = streaks.filter(streak => streak.life < streak.ttl);
      ctx.lineCap = 'round';
      for (const streak of streaks) {
        streak.life += dt;
        streak.x += streak.vx * dt;
        streak.y += streak.vy * dt;
        const fade = Math.sin((streak.life / streak.ttl) * Math.PI) * palette.strength;
        const ux = streak.vx / streak.speed;
        const uy = streak.vy / streak.speed;
        const tail = streak.tail * (0.6 + fade * 0.4);
        const tx = streak.x - ux * tail;
        const ty = streak.y - uy * tail;

        const g = ctx.createLinearGradient(streak.x, streak.y, tx, ty);
        g.addColorStop(0, `rgba(${streak.colour}, ${0.95 * fade})`);
        g.addColorStop(0.25, `rgba(${streak.colour}, ${0.45 * fade})`);
        g.addColorStop(1, `rgba(${streak.colour}, 0)`);
        ctx.strokeStyle = g;
        ctx.lineWidth = streak.thick;
        ctx.beginPath();
        ctx.moveTo(streak.x, streak.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        // Glowing head
        const head = ctx.createRadialGradient(streak.x, streak.y, 0, streak.x, streak.y, 5 + streak.thick * 2);
        head.addColorStop(0, `rgba(${palette.head}, ${0.95 * fade})`);
        head.addColorStop(0.4, `rgba(${streak.colour}, ${0.4 * fade})`);
        head.addColorStop(1, `rgba(${streak.colour}, 0)`);
        ctx.fillStyle = head;
        ctx.beginPath();
        ctx.arc(streak.x, streak.y, 5 + streak.thick * 2, 0, TAU);
        ctx.fill();
      }
    }

    frame = requestAnimationFrame(draw);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  function onVisibility() {
    if (document.hidden) cancelAnimationFrame(frame);
    else {
      last = performance.now();
      frame = requestAnimationFrame(draw);
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  resize();
  frame = requestAnimationFrame(draw);

  return {
    /* Recolour the sky when the theme changes. */
    setTheme(next) {
      palette = PALETTES[next] || PALETTES.dark;
      galaxies.forEach(galaxy => {
        galaxy.image = makeGalaxy(galaxy.size, palette.galaxies[galaxy.tintIndex % palette.galaxies.length]);
      });
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
