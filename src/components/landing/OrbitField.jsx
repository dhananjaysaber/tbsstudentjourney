import React, { useEffect, useRef, useState } from 'react';
import { boxOf, maxCard } from './cards';

/* =========================================================================
   STUDENT FIELD
   Student cards float through space in straight lines at a gentle, steady
   speed. They bounce off the edges of the screen (below the header, above
   the footer), off the heading block in the middle, and off each other —
   so cards never overlap and never cover the heading.

   About 30 cards are on screen at once (fewer on phones). Every few
   seconds one card fades and another student from the random sample takes
   its place. When the pool changes (a search), cards that don't match fade
   away and matching students fade in.
   ========================================================================= */

const TAU = Math.PI * 2;

function measure(field, avoidEl) {
  const rect = field.getBoundingClientRect();
  const mobile = rect.width < 760;
  const W = rect.width;
  const H = rect.height;
  const top = mobile ? 70 : 90; // below the header
  const bottom = H - (mobile ? 52 : 58); // above the footer strip
  const side = mobile ? 6 : 12; // screen edge

  let core = { x: W * 0.3, y: H * 0.4, w: W * 0.4, h: H * 0.2 };
  if (avoidEl) {
    const a = avoidEl.getBoundingClientRect();
    const pad = mobile ? 4 : 10;
    core = {
      x: a.left - rect.left - pad,
      y: a.top - rect.top - pad,
      w: a.width + pad * 2,
      h: a.height + pad * 2
    };
  }

  const big = maxCard(mobile);
  const gap = mobile ? 8 : 12; // the closest two cards get
  // How many cards fit comfortably, leaving room to move.
  const free = Math.max(0, (W - side * 2) * (bottom - top) - core.w * core.h);
  const perCard = mobile ? (big.w + 34) * (big.h + 34) : (big.w + 60) * (big.h + 60);
  const count = Math.max(6, Math.min(mobile ? 14 : 32, Math.round((free / perCard) * 0.95)));

  return { W, H, top, bottom, side, mobile, core, gap, count, speed: mobile ? 16 : 22 };
}

/* Does a card of size (w, h) centred at (x, y) fit without touching
 * the edges, the heading or another card? */
function fits(g, stars, x, y, w, h, ignore) {
  if (x - w / 2 < g.side || x + w / 2 > g.W - g.side) return false;
  if (y - h / 2 < g.top || y + h / 2 > g.bottom) return false;
  const c = g.core;
  if (x + w / 2 > c.x && x - w / 2 < c.x + c.w && y + h / 2 > c.y && y - h / 2 < c.y + c.h) return false;
  for (const s of stars) {
    if (s === ignore || s.leaving) continue;
    if (
      Math.abs(s.x - x) < (s.box.w + w) / 2 + g.gap &&
      Math.abs(s.y - y) < (s.box.h + h) / 2 + g.gap
    ) {
      return false;
    }
  }
  return true;
}

/* A free spot, as far as possible from the other cards. */
function freeSpot(g, stars, box) {
  let best = null;
  for (let i = 0; i < 80; i += 1) {
    const x = g.side + box.w / 2 + Math.random() * (g.W - g.side * 2 - box.w);
    const y = g.top + box.h / 2 + Math.random() * (g.bottom - g.top - box.h);
    if (!fits(g, stars, x, y, box.w, box.h)) continue;
    let near = Infinity;
    for (const s of stars) {
      if (s.leaving) continue;
      near = Math.min(near, Math.hypot(s.x - x, s.y - y));
    }
    if (!best || near > best.near) best = { x, y, near };
  }
  return best;
}

function launch(star, speed) {
  const angle = Math.random() * TAU;
  // Avoid nearly flat angles, so cards travel across the screen nicely.
  const tilt = Math.abs(Math.sin(angle)) < 0.25 ? angle + 0.5 : angle;
  star.vx = Math.cos(tilt) * speed;
  star.vy = Math.sin(tilt) * speed;
}

export default function OrbitField({ pool, renderStar, avoidRef, onSelect }) {
  const fieldRef = useRef(null);
  const nodes = useRef(new Map());
  const sim = useRef(null);
  const [slots, setSlots] = useState([]);
  const [mobile, setMobile] = useState(false);
  const [version, setVersion] = useState(0);

  /* Re-measure when the screen size changes. */
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return undefined;
    let timer = 0;
    let lastW = field.clientWidth;
    let lastH = field.clientHeight;
    const observer = new ResizeObserver(() => {
      if (Math.abs(field.clientWidth - lastW) < 40 && Math.abs(field.clientHeight - lastH) < 60) return;
      lastW = field.clientWidth;
      lastH = field.clientHeight;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVersion(v => v + 1), 220);
    });
    observer.observe(field);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  /* ---------- the simulation (one per screen size) ---------- */
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const g = measure(field, avoidRef?.current);
    setMobile(g.mobile);

    const previous = sim.current;
    const s = {
      g,
      stars: [],
      nextId: previous?.nextId || 1,
      cursor: previous?.cursor || 0,
      hovered: null,
      pace: 1,
      pool: previous?.pool || [],
      reconcile: null
    };
    sim.current = s;

    const publish = () => setSlots(s.stars.map(star => ({ id: star.id, person: star.person })));

    function spawn(person, from) {
      const box = boxOf(person, g.mobile);
      const spot = (from && fits(g, s.stars, from.x, from.y, box.w, box.h) ? from : null) || freeSpot(g, s.stars, box);
      if (!spot) return null; // no room right now
      const star = { id: `c${s.nextId++}`, person, box, x: spot.x, y: spot.y, vx: 0, vy: 0, alpha: 0, leaving: false, swapping: false };
      if (from?.vx !== undefined) {
        star.vx = from.vx;
        star.vy = from.vy;
      } else {
        launch(star, g.speed);
      }
      s.stars.push(star);
      return star;
    }

    // Keep the students already on screen through a resize.
    for (const old of previous?.stars || []) {
      if (!old.leaving) spawn(old.person, old);
    }

    /* Match the cards on screen to the pool (first load, search). */
    s.reconcile = nextPool => {
      s.pool = nextPool;
      const keys = new Set(nextPool.map(p => p.key));
      for (const star of s.stars) if (!keys.has(star.person.key)) star.leaving = true;
      const live = s.stars.filter(star => !star.leaving);
      const shown = new Set(live.map(star => star.person.key));
      const want = Math.min(g.count, nextPool.length);
      let guard = 0;
      while (live.length < want && guard < nextPool.length * 2) {
        const person = nextPool[s.cursor % nextPool.length];
        s.cursor += 1;
        guard += 1;
        if (shown.has(person.key)) continue;
        const star = spawn(person);
        if (!star) break;
        shown.add(person.key);
        live.push(star);
      }
      for (let i = want; i < live.length; i += 1) live[i].leaving = true;
      publish();
    };
    s.reconcile(s.pool);

    let frame = 0;
    let last = performance.now();

    function step(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Ease to a near-stop while a card is hovered, so it's easy to click.
      const targetPace = s.hovered ? 0.04 : 1;
      s.pace += (targetPace - s.pace) * Math.min(1, dt * 5);
      const move = reducedMotion ? 0 : dt * s.pace;
      const stars = s.stars;

      /* ---- travel ---- */
      for (const a of stars) {
        a.x += a.vx * move;
        a.y += a.vy * move;
      }

      /* ---- bounce off the screen edges ---- */
      for (const a of stars) {
        const hw = a.box.w / 2;
        const hh = a.box.h / 2;
        if (a.x - hw < g.side) {
          a.x = g.side + hw;
          a.vx = Math.abs(a.vx);
        } else if (a.x + hw > g.W - g.side) {
          a.x = g.W - g.side - hw;
          a.vx = -Math.abs(a.vx);
        }
        if (a.y - hh < g.top) {
          a.y = g.top + hh;
          a.vy = Math.abs(a.vy);
        } else if (a.y + hh > g.bottom) {
          a.y = g.bottom - hh;
          a.vy = -Math.abs(a.vy);
        }

        /* ---- bounce off the heading block ---- */
        const c = g.core;
        const ox = Math.min(a.x + hw, c.x + c.w) - Math.max(a.x - hw, c.x);
        const oy = Math.min(a.y + hh, c.y + c.h) - Math.max(a.y - hh, c.y);
        if (ox > 0 && oy > 0) {
          if (ox < oy) {
            const left = a.x < c.x + c.w / 2;
            a.x += left ? -ox : ox;
            a.vx = left ? -Math.abs(a.vx) : Math.abs(a.vx);
          } else {
            const above = a.y < c.y + c.h / 2;
            a.y += above ? -oy : oy;
            a.vy = above ? -Math.abs(a.vy) : Math.abs(a.vy);
          }
        }
      }

      /* ---- bounce off each other (like billiard balls) ---- */
      for (let i = 0; i < stars.length; i += 1) {
        const a = stars[i];
        if (a.leaving) continue;
        for (let j = i + 1; j < stars.length; j += 1) {
          const b = stars[j];
          if (b.leaving) continue;
          const ox = (a.box.w + b.box.w) / 2 + g.gap - Math.abs(b.x - a.x);
          const oy = (a.box.h + b.box.h) / 2 + g.gap - Math.abs(b.y - a.y);
          if (ox <= 0 || oy <= 0) continue;
          if (ox < oy) {
            const dir = b.x >= a.x ? 1 : -1;
            a.x -= (ox / 2) * dir;
            b.x += (ox / 2) * dir;
            // Moving towards each other: swap their sideways speeds.
            if ((b.vx - a.vx) * dir < 0) [a.vx, b.vx] = [b.vx, a.vx];
          } else {
            const dir = b.y >= a.y ? 1 : -1;
            a.y -= (oy / 2) * dir;
            b.y += (oy / 2) * dir;
            if ((b.vy - a.vy) * dir < 0) [a.vy, b.vy] = [b.vy, a.vy];
          }
        }
      }

      /* ---- keep a steady, gentle speed; fade in / out ---- */
      for (const a of stars) {
        const sp = Math.hypot(a.vx, a.vy);
        if (sp < 1) launch(a, g.speed);
        else {
          const k = 1 + (g.speed / sp - 1) * Math.min(1, dt * 1.5);
          a.vx *= k;
          a.vy *= k;
        }
        const target = a.leaving || a.swapping ? 0 : 1;
        a.alpha += (target - a.alpha) * Math.min(1, dt * 2.6);
      }

      if (stars.some(a => a.leaving && a.alpha < 0.02)) {
        s.stars = stars.filter(a => !(a.leaving && a.alpha < 0.02));
        publish();
      }

      /* ---- place the cards ---- */
      for (const a of s.stars) {
        const node = nodes.current.get(a.id);
        if (!node) continue;
        node.style.transform = `translate3d(${(a.x - a.box.w / 2).toFixed(1)}px, ${(a.y - a.box.h / 2).toFixed(1)}px, 0)`;
        node.style.opacity = a.alpha.toFixed(3);
        node.style.pointerEvents = a.alpha > 0.4 ? 'auto' : 'none';
      }

      frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);

    /* Let every student in the sample take a turn: one card at a time fades,
     * and the next student appears in its place. */
    const rotation = window.setInterval(() => {
      const live = s.stars.filter(a => !a.leaving && !a.swapping && a.alpha > 0.9 && a.id !== s.hovered);
      if (s.pool.length <= s.stars.filter(a => !a.leaving).length || !live.length) return;
      const star = live[Math.floor(Math.random() * live.length)];
      star.swapping = true;
      window.setTimeout(() => {
        const shown = new Set(s.stars.map(a => a.person.key));
        for (let guard = 0; guard < s.pool.length; guard += 1) {
          const candidate = s.pool[s.cursor % s.pool.length];
          s.cursor += 1;
          if (!shown.has(candidate.key)) {
            star.person = candidate;
            star.box = boxOf(candidate, g.mobile);
            break;
          }
        }
        star.swapping = false;
        publish();
      }, 1100);
    }, 2600);

    function onVisibility() {
      if (document.hidden) cancelAnimationFrame(frame);
      else {
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(rotation);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [avoidRef, version]);

  /* ---------- the pool changed (first load or a search) ---------- */
  useEffect(() => {
    sim.current?.reconcile?.(pool);
  }, [pool]);

  function setHover(id, on) {
    const s = sim.current;
    if (!s) return;
    if (on) s.hovered = id;
    else if (s.hovered === id) s.hovered = null;
  }

  return (
    <div className="ldOrbit" ref={fieldRef}>
      {slots.map(slot => {
        const box = boxOf(slot.person, mobile);
        return (
          <button
            type="button"
            key={slot.id}
            ref={node => {
              if (node) nodes.current.set(slot.id, node);
              else nodes.current.delete(slot.id);
            }}
            className="ldStar"
            style={{
              opacity: 0,
              width: box.w,
              height: box.h,
              '--card-w': `${box.card.w}px`,
              '--card-h': `${box.card.h}px`,
              '--photo': `${box.card.photo}px`
            }}
            onMouseEnter={() => setHover(slot.id, true)}
            onMouseLeave={() => setHover(slot.id, false)}
            onFocus={() => setHover(slot.id, true)}
            onBlur={() => setHover(slot.id, false)}
            onClick={() => onSelect(slot.person)}
          >
            {renderStar(slot.person)}
          </button>
        );
      })}
    </div>
  );
}
