import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, LayoutGrid, Play, X } from 'lucide-react';

import { privateEvidenceBlobUrl, publicEvidenceUrl } from '../journeyApi';
import { setPageScrollLocked } from '../lib/smoothScroll';
import './MemoryWall.css';

/* =========================================================================
   MEMORY WALL
   The letters T, B and S, set in the portfolio's serif, are filled with a
   collage of the student's photos — blocks of different sizes with fine
   hairline gaps, like a framed wall — and traced with a thin gold line.
   Click any photo to see it large, with its moment, and open the story.

   Filling the collage:
     · 2 or more photos — spread over the blocks in random order, never the
       same photo side by side where it can be avoided;
     · 1 photo — laid across the whole letter, so it's cut out of one picture;
     · no photos — the profile photo, the same way;
     · nothing at all — the section is hidden.
   On phones the letters stack: T, then B, then S.
   ========================================================================= */

const WORD = ['T', 'B', 'S'];
/* The TBS motto, one word under each letter. */
const MOTTO = ['Thrive', 'Believe', 'Succeed'];
const RIM = 20; // room around each letter for its gold frame
const BOX = { w: 440, h: 540 }; // each letter's drawing area

/* Small seeded random, so every visit gets the same collage shape. */
function seeded(seed) {
  let h = seed;
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

/* A scrapbook collage for one letter: photos of different sizes, slightly
 * tilted and overlapping, scattered over a jittered grid so the whole
 * letter is covered (a full-size photo sits underneath as the base). */
function collageFor(letterIndex) {
  const rand = seeded(97 + letterIndex * 131);
  const blocks = [];
  const cols = 3;
  const rows = 4;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const w = 170 + rand() * 80;
      const h = w * (0.72 + rand() * 0.5);
      const cx = ((c + 0.5) / cols) * BOX.w + (rand() - 0.5) * 60;
      const cy = 40 + ((r + 0.5) / rows) * (BOX.h - 80) + (rand() - 0.5) * 50;
      blocks.push({
        x: cx - w / 2,
        y: cy - h / 2,
        w,
        h,
        rotate: (rand() - 0.5) * 16,
        order: rand()
      });
    }
  }
  // Paint in a shuffled order so the overlaps look natural.
  return blocks.sort((p, q) => p.order - q.order);
}

const COLLAGE = WORD.map((_, i) => collageFor(i));
const BLOCK_COUNT = COLLAGE.reduce((sum, letter) => sum + letter.length, 0);

/* The cinematic sequence (ms from the moment the wall comes into view):
 *   photos fly in one after another and land inside the letters,
 *   the gold frames trace themselves, then the motto slides in. */
const FLY_START = 250;
const FLY_STEP = 48;
const FLY_TIME = 1700;
const ARRIVE = 0.78; // share of the flight spent travelling; the rest settles in
const landAt = order => FLY_START + order * FLY_STEP + FLY_TIME * ARRIVE;
const FLIGHT_ORDER = (() => {
  const rand = seeded(2024);
  const order = [...Array(BLOCK_COUNT).keys()];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const rank = new Array(BLOCK_COUNT);
  order.forEach((block, position) => {
    rank[block] = position;
  });
  return rank; // block index -> its turn to fly
})();

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* Spread photos over all the blocks; a fresh shuffled round each time the
 * photos run out, and never the same photo straight after itself. */
function assignPhotos(count) {
  const total = COLLAGE.reduce((sum, letter) => sum + letter.length + 1, 0);
  if (count <= 1) return Array(total).fill(0);
  const out = [];
  let deck = [];
  for (let i = 0; i < total; i += 1) {
    if (!deck.length) deck = shuffle([...Array(count).keys()]);
    let pick = deck.findIndex(p => p !== out[i - 1]);
    if (pick < 0) pick = 0;
    out.push(deck.splice(pick, 1)[0]);
  }
  return out;
}

function youtubeThumb(item) {
  return item.thumbnail_url || `https://i.ytimg.com/vi/${item.youtube_video_id}/hqdefault.jpg`;
}

/* Load each photo once, however many tiles show it. */
function usePhotoSources(photos, token, preview) {
  const [sources, setSources] = useState({});
  const key = photos.map(p => p.id).join('|');

  useEffect(() => {
    let alive = true;
    const blobs = [];
    photos.forEach(async item => {
      let src = '';
      if (item.media_provider === 'youtube' && item.youtube_video_id) src = youtubeThumb(item);
      else if (token && item.drive_file_id) src = publicEvidenceUrl(item.id, token);
      else if (preview && item.drive_file_id) {
        try {
          src = await privateEvidenceBlobUrl(item.id);
          blobs.push(src);
        } catch {
          src = '';
        }
      } else src = item.thumbnail_url || item.media_url || '';
      if (alive && src) setSources(current => ({ ...current, [item.id]: src }));
    });
    return () => {
      alive = false;
      blobs.forEach(url => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, token, preview]);

  return sources;
}

function Viewer({ photos, sources, index, stories, onClose, onMove, onOpenStory, keepLocked = false }) {
  const item = photos[index];
  const story = item.entry_id ? stories.get(item.entry_id) : null;
  const video = item.media_provider === 'youtube' && item.youtube_video_id;

  useEffect(() => {
    setPageScrollLocked(true);
    const onKey = event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') onMove(1);
      if (event.key === 'ArrowLeft') onMove(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      if (!keepLocked) setPageScrollLocked(false);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, onMove, keepLocked]);

  return (
    <div className="mwViewer" role="dialog" aria-modal="true" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <button type="button" className="mwViewerClose" onClick={onClose} aria-label="Close">
        <X />
      </button>

      <figure className="mwViewerFigure" key={item.id}>
        <div className="mwViewerImage">
          {sources[item.id] ? <img src={sources[item.id]} alt={item.caption || ''} /> : <span className="mwViewerLoading" />}
          {video && (
            <a className="mwViewerPlay" href={item.media_url} target="_blank" rel="noreferrer">
              <Play /> Play film
            </a>
          )}
        </div>
        <figcaption>
          <small>
            Memory {String(index + 1).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}
          </small>
          <h3>{item.caption || story?.title || 'A moment from the journey'}</h3>
          {story && (
            <p>
              {story.title}
              {story.year ? ` · ${story.year}` : ''}
            </p>
          )}
          {story && (
            <button type="button" className="mwViewerStory" onClick={() => onOpenStory(story)}>
              Open the story <ArrowUpRight />
            </button>
          )}
        </figcaption>
      </figure>

      {photos.length > 1 && (
        <>
          <button type="button" className="mwViewerNav isPrev" onClick={() => onMove(-1)} aria-label="Previous photo">
            <ArrowLeft />
          </button>
          <button type="button" className="mwViewerNav isNext" onClick={() => onMove(1)} aria-label="Next photo">
            <ArrowRight />
          </button>
        </>
      )}
    </div>
  );
}

/* View gallery: a full page that slides in from the right with every
 * photo laid out in a gallery. Tap one to see it large. */
function GalleryPage({ photos, sources, stories, name, onOpenPhoto, onClose }) {
  const [leaving, setLeaving] = useState(false);

  const close = () => {
    setLeaving(true);
    window.setTimeout(onClose, 420);
  };

  useEffect(() => {
    setPageScrollLocked(true);
    // Escape closes an open photo first, and only then the gallery.
    const onKey = event => event.key === 'Escape' && !document.querySelector('.mwViewer') && close();
    window.addEventListener('keydown', onKey);
    return () => {
      setPageScrollLocked(false);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`mwGallery ${leaving ? 'isLeaving' : ''}`} role="dialog" aria-modal="true" aria-label="Gallery">
      <div className="mwGalleryPanel">
        <header className="mwGalleryHead">
          <div>
            <small>Memory wall · {photos.length} {photos.length === 1 ? 'photo' : 'photos'}</small>
            <h2>{name ? `${name}’s gallery` : 'The gallery'}</h2>
          </div>
          <button type="button" className="mwGalleryClose" onClick={close}>
            Close <X />
          </button>
        </header>

        <div className="mwGalleryGrid">
          {photos.map((item, index) => {
            const story = item.entry_id ? stories.get(item.entry_id) : null;
            const video = item.media_provider === 'youtube' && item.youtube_video_id;
            return (
              <button
                type="button"
                key={item.id}
                className="mwGalleryItem"
                style={{ '--i': index }}
                onClick={() => onOpenPhoto(index)}
              >
                {sources[item.id] ? <img src={sources[item.id]} alt="" loading="lazy" /> : <span className="mwGalleryBlank" />}
                {video && (
                  <span className="mwGalleryPlay">
                    <Play />
                  </span>
                )}
                <span className="mwGalleryCaption">
                  <b>{item.caption || story?.title || 'A moment from the journey'}</b>
                  {story && (
                    <small>
                      {story.title}
                      {story.year ? ` · ${story.year}` : ''}
                    </small>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function MemoryWall({ number = '05', evidence, profilePhoto, items, token, preview, onOpenStory, name = '' }) {
  /* The student's photos (and film thumbnails); the profile photo if none. */
  const photos = useMemo(() => {
    const list = (evidence || []).filter(
      item =>
        (item.evidence_type === 'image' || (item.media_provider === 'youtube' && item.youtube_video_id)) &&
        !['profile_photo', 'hero_banner'].includes(item.media_role)
    );
    if (list.length) return list;
    return profilePhoto ? [profilePhoto] : [];
  }, [evidence, profilePhoto]);

  const stories = useMemo(() => new Map((items || []).map(item => [item.id, item])), [items]);
  const sources = usePhotoSources(photos, token, preview);
  const layout = useMemo(() => assignPhotos(photos.length), [photos.length]);
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  /* Fit each letter's box to the letter itself, so the spaces between
   * T, B and S are even whatever their widths. Measured once the serif
   * font has loaded. */
  const outlines = useRef([]);
  const [fit, setFit] = useState(null);
  useEffect(() => {
    let alive = true;
    const measure = () => {
      const boxes = outlines.current.map(node => {
        try {
          const b = node.getBBox();
          return b.width ? { x: b.x - RIM, w: b.width + RIM * 2 } : null;
        } catch {
          return null;
        }
      });
      if (alive && boxes.every(Boolean)) setFit(boxes);
    };
    measure();
    document.fonts?.ready.then(measure);
    return () => {
      alive = false;
    };
  }, [photos.length]);
  const single = photos.length === 1;

  const wallRef = useRef(null);
  const flightRef = useRef(null);
  const flown = useRef(false);
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(-1);
  const [gallery, setGallery] = useState(false);
  const [drawn, setDrawn] = useState(false);

  /* When the sequence ends: single photo = one flight per letter. */
  const lastLand = single ? landAt(2 * 5) : landAt(BLOCK_COUNT - 1);
  const timing = {
    '--rim-delay': `${Math.max(600, lastLand - 900)}ms`,
    '--glow-delay': `${FLY_START + 400}ms`,
    '--settle-time': `${lastLand + 400}ms`
  };
  const mottoDelay = li => `${lastLand + 1900 + li * 320}ms`;

  /* After the gold frame has been traced, make it a solid border. */
  useEffect(() => {
    if (!shown) return undefined;
    const timer = window.setTimeout(() => setDrawn(true), Math.max(600, lastLand - 900) + 3300);
    return () => window.clearTimeout(timer);
  }, [shown, lastLand]);

  /* The fly-in: copies of the photos start scattered around the section,
   * spin in towards the letters and land exactly where each print sits,
   * then hand over to the real (clipped) prints. */
  useEffect(() => {
    if (!shown || flown.current) return undefined;
    const layer = flightRef.current;
    const wall = wallRef.current;
    if (!layer || !wall) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      flown.current = true;
      return undefined;
    }
    const ready = photos.every(photo => sources[photo.id]);
    let timer = 0;
    const launch = () => {
      if (flown.current) return;
      flown.current = true;
      const box = wall.getBoundingClientRect();
      // The wall is gently zooming in; work in its own (unzoomed) pixels so
      // every photo lands exactly on its print.
      const zoom = box.width / (wall.offsetWidth || box.width) || 1;
      const cx = wall.offsetWidth / 2;
      const cy = wall.offsetHeight / 2;
      const reach = Math.max(wall.offsetWidth, wall.offsetHeight) * 0.7 + 140;
      const targets = [...wall.querySelectorAll('[data-flight]')];
      targets.forEach(node => {
        const turn = Number(node.dataset.flight);
        const src = node.dataset.src;
        if (!src) return;
        const rect = node.getBoundingClientRect();
        const rotate = Number(node.dataset.rotate || 0);
        const svg = node.ownerSVGElement;
        const scale = svg ? svg.getBoundingClientRect().height / zoom / BOX.h : 1;
        const whole = node.dataset.whole === '1';
        const w = whole ? rect.width / zoom / scale : Number(node.dataset.w);
        const h = whole ? rect.height / zoom / scale : Number(node.dataset.h);
        const tx = (rect.left - box.left + rect.width / 2) / zoom;
        const ty = (rect.top - box.top + rect.height / 2) / zoom;
        const angle = Math.random() * Math.PI * 2;
        const sx = cx + Math.cos(angle) * reach - tx;
        const sy = cy + Math.sin(angle) * reach * 0.7 - ty;
        const spin = (Math.random() - 0.5) * 50;

        const card = document.createElement('div');
        card.className = 'mwFlyer';
        card.style.left = `${tx}px`;
        card.style.top = `${ty}px`;
        card.style.width = `${w * scale}px`;
        card.style.height = `${h * scale}px`;
        card.style.backgroundImage = `url("${src}")`;
        layer.appendChild(card);
        // A long, soft glide: fade up while far away, ease into place,
        // then sink gently into the letter as the real print appears.
        const anim = card.animate(
          [
            {
              transform: `translate3d(-50%, -50%, 0) translate3d(${sx}px, ${sy}px, 0) rotate(${spin}deg) scale(1.25)`,
              opacity: 0,
              easing: 'cubic-bezier(0.16, 0.84, 0.3, 1)'
            },
            { opacity: 1, offset: 0.2 },
            {
              transform: `translate3d(-50%, -50%, 0) rotate(${rotate}deg) scale(1)`,
              opacity: 1,
              offset: ARRIVE,
              easing: 'ease-out'
            },
            { transform: `translate3d(-50%, -50%, 0) rotate(${rotate}deg) scale(0.97)`, opacity: 0 }
          ],
          {
            duration: FLY_TIME,
            delay: FLY_START + turn * FLY_STEP,
            fill: 'both'
          }
        );
        anim.onfinish = () => card.remove();
      });
    };
    if (ready) launch();
    else timer = window.setTimeout(launch, 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, sources]);

  useEffect(() => {
    const node = wallRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.18 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [photos.length]);

  if (!photos.length) return null;

  const move = step => setOpen(current => (current + step + photos.length) % photos.length);

  return (
    <section className="memoryWall" id="memories">
      <div className="mwIntro">
        <div className="sectionLabel">
          <span>{number}</span>
          <i />
          MEMORY WALL
        </div>
        <h2>The moments that made me.</h2>
        <p>
          {single
            ? 'One picture, holding a whole chapter. Tap the wall to see it.'
            : `${photos.length} memories from the journey. Tap any photo to see it, and step into the story behind it.`}
        </p>
      </div>

      <div ref={wallRef} className={`mwWord ${shown ? 'isShown' : ''} ${drawn ? 'isDrawn' : ''} ${single ? 'isSingle' : ''}`} style={timing}>
        <div ref={flightRef} className="mwFlight" aria-hidden="true" />
        {WORD.map((letter, li) => {
          const offset = COLLAGE.slice(0, li).reduce((sum, l) => sum + l.length + 1, 0);
          const clipId = `mwClip${letter}${uid}`;
          return (
            <figure
              key={letter}
              className="mwLetterWrap"
              style={{ '--ratio': (fit ? fit[li].w : BOX.w) / BOX.h, '--motto-delay': mottoDelay(li) }}
            >
            <svg
              className="mwLetter"
              viewBox={fit ? `${fit[li].x} 0 ${fit[li].w} ${BOX.h}` : `0 0 ${BOX.w} ${BOX.h}`}
              role="group"
              aria-label={`${letter} — ${MOTTO[li]}`}
            >
              <defs>
                <linearGradient id={`${clipId}Sheen`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#ffffff" stopOpacity="0.18" />
                  <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
                  <stop offset="1" stopColor="#0d0c33" stopOpacity="0.22" />
                </linearGradient>
                <clipPath id={clipId}>
                  <text x={BOX.w / 2} y={BOX.h - 58} textAnchor="middle" className="mwGlyph">
                    {letter}
                  </text>
                </clipPath>
              </defs>

              {/* The frame: a thick gold rim the letter sits in */}
              <text x={BOX.w / 2} y={BOX.h - 58} textAnchor="middle" className="mwGlyph mwRim">
                {letter}
              </text>

              <g clipPath={`url(#${clipId})`}>
                <rect
                  className="mwLetterBase"
                  width={BOX.w}
                  height={BOX.h}
                  {...(single
                    ? { 'data-flight': li * 5, 'data-whole': '1', 'data-src': sources[photos[0].id] || '' }
                    : {})}
                />
                {single ? (
                  <g
                    className="mwBlock"
                    style={{ '--land': `${landAt(li * 5)}ms` }}
                    role="button"
                    tabIndex={0}
                    aria-label={photos[0].caption || 'Open photo'}
                    onClick={() => setOpen(0)}
                    onKeyDown={event => event.key === 'Enter' && setOpen(0)}
                  >
                    {sources[photos[0].id] && (
                      <image
                        href={sources[photos[0].id]}
                        x={-li * BOX.w}
                        y={0}
                        width={BOX.w * 3}
                        height={BOX.h}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    )}
                  </g>
                ) : (
                  <>
                    {/* Base: one photo under the whole letter, so there are no gaps */}
                    {sources[photos[layout[offset]].id] && (
                      <image
                        className="mwBase"
                        style={{ '--land': `${FLY_START + 500}ms` }}
                        href={sources[photos[layout[offset]].id]}
                        width={BOX.w}
                        height={BOX.h}
                        preserveAspectRatio="xMidYMid slice"
                        onClick={() => setOpen(layout[offset])}
                      />
                    )}
                    {COLLAGE[li].map((block, bi) => {
                      const index = layout[offset + bi + 1];
                      const photo = photos[index];
                      const src = sources[photo.id];
                      const cx = block.x + block.w / 2;
                      const cy = block.y + block.h / 2;
                      const turn = FLIGHT_ORDER[offset - li + bi];
                      return (
                        <g
                          key={bi}
                          className="mwBlock"
                          style={{ '--land': `${landAt(turn)}ms` }}
                          role="button"
                          tabIndex={0}
                          aria-label={photo.caption || 'Open photo'}
                          onClick={() => setOpen(index)}
                          onKeyDown={event => event.key === 'Enter' && setOpen(index)}
                        >
                          <g className="mwLift">
                          <g transform={`rotate(${block.rotate.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})`}>
                            <rect className="mwPrint" x={block.x - 5} y={block.y - 5} width={block.w + 10} height={block.h + 10} />
                            <rect
                              className="mwBlockBack"
                              x={block.x}
                              y={block.y}
                              width={block.w}
                              height={block.h}
                              data-flight={turn}
                              data-src={src || ''}
                              data-rotate={block.rotate.toFixed(1)}
                              data-w={block.w + 10}
                              data-h={block.h + 10}
                            />
                            {src && (
                              <image
                                href={src}
                                x={block.x}
                                y={block.y}
                                width={block.w}
                                height={block.h}
                                preserveAspectRatio="xMidYMid slice"
                              />
                            )}
                          </g>
                          </g>
                        </g>
                      );
                    })}
                  </>
                )}
                <rect className="mwSheen" width={BOX.w} height={BOX.h} fill={`url(#${clipId}Sheen)`} />
              </g>

              {/* A fine inner line over the photos */}
              <text
                ref={node => {
                  outlines.current[li] = node;
                }}
                x={BOX.w / 2}
                y={BOX.h - 58}
                textAnchor="middle"
                className="mwGlyph mwOutline"
              >
                {letter}
              </text>
            </svg>
              <figcaption className="mwMotto">
                <span className="mwMottoText">{MOTTO[li]}</span>
                <span className="mwTwinkle" aria-hidden="true" />
              </figcaption>
            </figure>
          );
        })}
      </div>

      <div className="mwActions">
        <button type="button" className="mwGalleryBtn" onClick={() => setGallery(true)}>
          <LayoutGrid /> View gallery
        </button>
        <p className="mwHint">or tap a photo to open the memory</p>
      </div>

      {gallery && (
        <GalleryPage
          photos={photos}
          sources={sources}
          stories={stories}
          name={name}
          onOpenPhoto={setOpen}
          onClose={() => setGallery(false)}
        />
      )}

      {open >= 0 && (
        <Viewer
          photos={photos}
          sources={sources}
          index={open}
          stories={stories}
          onClose={() => setOpen(-1)}
          onMove={move}
          keepLocked={gallery}
          onOpenStory={story => {
            setOpen(-1);
            setGallery(false);
            onOpenStory?.(story);
          }}
        />
      )}
    </section>
  );
}
