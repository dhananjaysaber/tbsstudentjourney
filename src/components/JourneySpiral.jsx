import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Sparkles
} from 'lucide-react';

import { privateEvidenceBlobUrl, publicEvidenceUrl, cachedEvidenceBlobUrl, isCachedBlobUrl } from '../journeyApi';

import './JourneySpiral.css';

/* =========================================================================
   JOURNEY SPIRAL GALLERY
   -------------------------------------------------------------------------
   A continuous WebGL helix of journey moments, inspired by the Framer
   "Spiral Gallery" component:

   · Cards are wrapped onto a cylinder (baked curvature) with SDF-rounded
     corners, so they read as printed panels around a column of light.
   · The helix is a screw: as it spins, every card also travels down the
     column and re-enters at the top. The ends dissolve, so it never stops.
   · A "wind" term bends the cards according to spin velocity.
   · Soft twinkling starfield, pointer parallax, hover glow, custom cursor.
   · Render loop pauses when the section is off-screen or the tab is hidden.
   ========================================================================= */

const DOMAIN_LABELS = {
  academic: 'Academic',
  sport: 'Sport',
  creative_arts: 'Creative Arts',
  leadership: 'Leadership',
  service: 'Service',
  co_curricular: 'Co-curricular',
  personal: 'Personal Growth',
  other: 'Other'
};

export function domainLabel(value) {
  return DOMAIN_LABELS[value] || value || 'Journey';
}

/* ---------------------------------------------------------------- data -- */

const MIN_CARDS = 27;
const MAX_CARDS = 36;

function storyCard(story) {
  return {
    key: `story-${story.id}`,
    story,
    evidence: story.evidence || null,
    title: story.title,
    domain: story.domain,
    year: story.year,
    number: story.number,
    primary: true
  };
}

export function buildVisualCards(items, evidence, { featuredOnly = false } = {}) {
  const stories = items || [];
  if (!stories.length) return [];

  const byEntry = new Map(stories.map(item => [item.id, item]));
  const buckets = new Map(stories.map(item => [item.id, [storyCard(item)]]));
  const usedEvidence = new Set(stories.map(item => item.evidence?.id).filter(Boolean));

  /* featuredOnly: just each moment's featured photo (repeated to fill). */
  (featuredOnly ? [] : evidence || [])
    .filter(
      item =>
        item.entry_id &&
        byEntry.has(item.entry_id) &&
        !['profile_photo', 'hero_banner'].includes(item.media_role) &&
        !usedEvidence.has(item.id)
    )
    .sort((a, b) => {
      if (a.media_role === 'journey_cover' && b.media_role !== 'journey_cover') return -1;
      if (b.media_role === 'journey_cover' && a.media_role !== 'journey_cover') return 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    })
    .forEach(item => {
      const story = byEntry.get(item.entry_id);
      buckets.get(item.entry_id)?.push({
        key: `media-${item.id}`,
        story,
        evidence: item,
        title: item.caption || story.title,
        domain: story.domain,
        year: story.year,
        number: story.number,
        primary: false
      });
    });

  const pool = stories.flatMap(story => buckets.get(story.id));
  const target = Math.min(MAX_CARDS, Math.max(MIN_CARDS, pool.length));

  return arrangeCards(pool, target, stories);
}

/* A fresh arrangement per page visit, stable across re-renders. */
const SESSION_SALT = Math.floor(Math.random() * 1e9);

function seededRandom(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i += 1) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/* Helix positions that sit (almost) directly above/below a card: one turn
 * away on desktop (9 per turn) and on mobile (7 per turn). */
const VERTICAL_NEIGHBOURS = [6, 7, 8, 9, 10];

/* Randomly fill the helix from the available photos, repeating them when
 * there are only a few, while keeping the gallery varied:
 *   · the same moment never appears next to itself (or two steps away),
 *   · the same photo never stacks directly above itself,
 *   · every photo is used about equally often. */
function arrangeCards(pool, target, stories) {
  const random = seededRandom(`${SESSION_SALT}:${pool.map(card => card.key).join('|')}`);
  const storyCount = stories.length;
  const useByKey = new Map();
  const useByStory = new Map();
  const cards = [];

  for (let index = 0; index < target; index += 1) {
    let best = null;
    let bestScore = Infinity;

    pool.forEach(candidate => {
      const storyId = candidate.story.id;
      let score = 0;

      /* Never next to itself; avoid two steps away too (softer rule). */
      if (storyCount > 1 && cards[index - 1]?.story.id === storyId) score += 1000;
      if (storyCount > 2 && cards[index - 2]?.story.id === storyId) score += 90;

      VERTICAL_NEIGHBOURS.forEach(offset => {
        const above = cards[index - offset];
        if (!above) return;
        if (above.key === candidate.key) score += offset === 7 || offset === 9 ? 130 : 45;
        else if (above.story.id === storyId) score += 8;
      });

      score += (useByKey.get(candidate.key) || 0) * 24;
      score += (useByStory.get(storyId) || 0) * 6;
      score += random() * 14;

      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    });

    useByKey.set(best.key, (useByKey.get(best.key) || 0) + 1);
    useByStory.set(best.story.id, (useByStory.get(best.story.id) || 0) + 1);

    cards.push({
      ...best,
      instanceKey: `${best.key}-${index}`,
      looped: (useByKey.get(best.key) || 0) > 1
    });
  }

  return cards;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export async function resolveMediaCandidates({ evidence, token, preview }) {
  if (!evidence) return [];

  if (evidence.media_provider === 'youtube' && evidence.youtube_video_id) {
    return unique([
      evidence.thumbnail_url,
      `https://i.ytimg.com/vi/${evidence.youtube_video_id}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${evidence.youtube_video_id}/hqdefault.jpg`
    ]);
  }

  const candidates = [];

  if (preview && evidence.drive_file_id) {
    try {
      candidates.push(await cachedEvidenceBlobUrl(evidence.id));
    } catch {
      /* fall through to thumbnail / media URL */
    }
  } else if (token && evidence.drive_file_id) {
    candidates.push(publicEvidenceUrl(evidence.id, token));
  }

  candidates.push(evidence.thumbnail_url, evidence.media_url);
  return unique(candidates);
}

/* ------------------------------------------------------------- visuals -- */

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';

  words.forEach(word => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);

  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) shown[maxLines - 1] += '…';

  /* Bottom-aligned: the last line sits on y. */
  const startY = y - (shown.length - 1) * lineHeight;
  shown.forEach((value, index) => ctx.fillText(value, x, startY + index * lineHeight));
  return startY;
}

export function createFallbackTexture(card) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 820;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 1200, 820);
  bg.addColorStop(0, '#1e1d5c');
  bg.addColorStop(0.6, '#151449');
  bg.addColorStop(1, '#0d0c33');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 820);

  const glow = ctx.createRadialGradient(930, 170, 10, 930, 170, 520);
  glow.addColorStop(0, 'rgba(238, 192, 88, .34)');
  glow.addColorStop(1, 'rgba(238, 192, 88, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1200, 820);

  /* Fine editorial grid */
  ctx.strokeStyle = 'rgba(255,255,255,.045)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 1200; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, 820);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.font = 'italic 500 300px "Playfair Display", Georgia, serif';
  ctx.lineWidth = 2;
  ctx.strokeText(card.number || '01', 690, 330);

  ctx.fillStyle = '#eec058';
  ctx.font = '500 26px "DM Mono", monospace';
  ctx.fillText(domainLabel(card.domain).toUpperCase().split('').join(' '), 80, 100);

  ctx.fillStyle = '#ffffff';
  ctx.font = '500 76px "Playfair Display", Georgia, serif';
  wrapCanvasText(ctx, card.story?.title || card.title || 'Journey moment', 80, 700, 980, 86);

  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = '500 22px "DM Mono", monospace';
  if (card.year) ctx.fillText(String(card.year), 80, 760);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* Cylinder-wrapped plane: the curvature is baked into the geometry so that
 * raycasting (hover / click) matches exactly what the viewer sees. */
function createCurvedCardGeometry(width, height, radius) {
  const geometry = new THREE.PlaneGeometry(width, height, 36, 12);
  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const phi = x / radius;
    position.setX(i, Math.sin(phi) * radius);
    position.setZ(i, Math.cos(phi) * radius - radius);
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const CARD_VERTEX = /* glsl */ `
  uniform float uWind;
  uniform float uTime;
  uniform float uHover;

  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vec3 p = position;

    float edge = uv.x - 0.5;
    float flare = edge * edge * 4.0;

    // Wind: trailing edges lag behind the spin and the panel flexes.
    p.z += -uWind * edge * 0.42;
    p.z += abs(uWind) * flare * 0.22;
    p.y += uWind * edge * 0.10;
    p.z += sin(uv.x * 7.0 + uTime * 2.4) * abs(uWind) * 0.035;

    // Hover lifts the panel off the helix.
    p.z += uHover * 0.18;

    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const CARD_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uFallback;
  uniform float uReveal;
  uniform vec2 uRepeat;
  uniform vec2 uOffset;
  uniform vec2 uSize;
  uniform float uCorner;
  uniform float uOpacity;
  uniform float uFade;
  uniform float uHover;
  uniform float uFocus;
  uniform float uRadius;

  varying vec2 vUv;
  varying vec3 vWorld;

  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 local = (vUv - 0.5) * uSize;
    float d = roundedBox(local, uSize * 0.5, uCorner);
    float aa = max(fwidth(d), 0.0008);
    float mask = 1.0 - smoothstep(-aa, aa, d);
    if (mask < 0.002) discard;

    // Cover-fit sample, with a gentle zoom on hover.
    vec2 uv = vUv;
    uv = (uv - 0.5) * (1.0 - uHover * 0.06) + 0.5;
    uv = uv * uRepeat + uOffset;
    vec3 photo = texture2D(uMap, uv).rgb;
    vec3 placeholder = texture2D(uFallback, (vUv - 0.5) * (1.0 - uHover * 0.06) + 0.5).rgb;
    vec3 color = mix(placeholder, photo, uReveal);

    // Depth: panels on the far side of the column recede into the dark.
    float depth = smoothstep(-uRadius * 1.05, uRadius * 1.0, vWorld.z);

    if (!gl_FrontFacing) {
      float grey = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(grey), color, 0.25) * vec3(0.42, 0.42, 0.62);
      depth *= 0.55;
    }

    float grey = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(grey), color, mix(0.35, 1.0, depth));
    color *= mix(0.12, 1.0, pow(depth, 1.35));

    // Photographic vignette + highlight on the front-most panel.
    float vig = smoothstep(0.95, 0.25, length((vUv - 0.5) * vec2(1.0, 1.2)));
    color *= mix(0.72, 1.0, vig);
    color *= 1.0 + uHover * 0.14 + uFocus * 0.04;

    // Hairline inner border — brighter when hovered.
    float line = 1.0 - smoothstep(0.0, aa * 1.6, abs(d + 0.012));
    color = mix(color, vec3(1.0, 0.93, 0.9), line * (0.035 + uHover * 0.5) * depth);

    // Sheen that sweeps across the panel as it turns to face the viewer.
    float sheen = smoothstep(0.35, 0.0, abs(vUv.x - 0.5 - (vWorld.x / (uRadius * 3.0))));
    color += sheen * 0.035 * depth;

    // Opaque, depth-tested panels (no transparency sorting = no flicker).
    // Fading happens in colour; alpha only drives MSAA coverage for smooth
    // rounded corners and for the last, near-black part of a fade.
    float visible = uOpacity * uFade;
    if (visible < 0.004) discard;
    color *= visible;
    gl_FragColor = vec4(color, mask * smoothstep(0.0, 0.22, visible));
    #include <colorspace_fragment>
  }
`;

const STAR_VERTEX = /* glsl */ `
  attribute float aScale;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vWarm;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aScale * uPixelRatio * (28.0 / -mv.z);
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase * 1.8) + aPhase * 40.0);
    vAlpha = twinkle * smoothstep(40.0, 6.0, -mv.z);
    vWarm = step(0.86, fract(aPhase * 13.7));
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying float vWarm;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    float glow = pow(core, 3.0);
    vec3 color = mix(vec3(1.0, 1.0, 1.0), vec3(0.93, 0.75, 0.35), vWarm);
    gl_FragColor = vec4(color, (glow * 0.9 + core * 0.15) * vAlpha);
    #include <colorspace_fragment>
  }
`;

function layoutFor(width) {
  const mobile = width < 760;

  /* Desktop cards enlarged ~20% (was 1.78 × 1.2). */
  const cardW = mobile ? 1.42 : 2.2;
  const cardH = mobile ? 0.98 : 1.48;
  const perTurn = mobile ? 7 : 9;
  const gap = mobile ? 0.2 : 0.26;
  const radius = ((cardW + gap) * perTurn) / (Math.PI * 2);
  const turnHeight = cardH + (mobile ? 0.5 : 0.45);

  return {
    mobile,
    cardW,
    cardH,
    perTurn,
    radius,
    angleStep: (Math.PI * 2) / perTurn,
    pitch: turnHeight / perTurn,
    corner: mobile ? 0.07 : 0.085
  };
}

/* ------------------------------------------------------------ component -- */

export default function JourneySpiral({
  items = [],
  evidence = [],
  token,
  preview = false,
  onOpen
}) {
  const shellRef = useRef(null);
  const mountRef = useRef(null);
  const cursorRef = useRef(null);
  const apiRef = useRef(null);
  const onOpenRef = useRef(onOpen);

  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [touched, setTouched] = useState(false);

  onOpenRef.current = onOpen;

  const builtCards = useMemo(() => buildVisualCards(items, evidence, { featuredOnly: true }), [items, evidence]);

  /* Only rebuild the WebGL scene when the arrangement itself changes, never
   * because a parent re-rendered with equal data. */
  const cardsSignature = builtCards.map(card => card.instanceKey).join('|');
  const cardsRef = useRef({ signature: '', cards: [] });
  if (cardsRef.current.signature !== cardsSignature) {
    cardsRef.current = { signature: cardsSignature, cards: builtCards };
  }
  const cards = cardsRef.current.cards;

  useEffect(() => {
    const mount = mountRef.current;
    const shell = shellRef.current;
    if (!mount || !shell || !cards.length) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let layout = layoutFor(mount.clientWidth);

    setReady(false);

    /* ---------- renderer / scene ---------- */
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    /* Large canvases on retina screens are fill-rate bound; cap the ratio.
     * `quality` drops to 'low' once if the machine can't keep up. */
    let quality = 'high';
    const pixelRatioFor = () =>
      quality === 'low'
        ? 1
        : Math.min(
            window.devicePixelRatio || 1,
            mount.clientWidth * mount.clientHeight > 700000 ? 1.5 : 2
          );
    renderer.setPixelRatio(pixelRatioFor());
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, mount.clientWidth / mount.clientHeight, 0.1, 120);

    const helix = new THREE.Group();
    helix.rotation.z = layout.mobile ? -0.05 : -0.085;
    scene.add(helix);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    /* Frame the column so it always fits, whatever the aspect ratio. */
    const cameraBase = new THREE.Vector3();

    function frameCamera() {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      const aspect = width / height;
      const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

      const neededHeight = layout.mobile ? 6.6 : 9.2;
      const neededWidth = layout.radius * 2 + (layout.mobile ? 0.9 : 2.2);

      const distance = Math.max(
        neededHeight / 2 / halfTan,
        neededWidth / 2 / (halfTan * aspect)
      );

      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      cameraBase.set(0, distance * 0.17, distance);
    }

    frameCamera();
    camera.position.copy(cameraBase);

    /* ---------- starfield ---------- */
    const starCount = layout.mobile ? 520 : 1300;
    const starPositions = new Float32Array(starCount * 3);
    const starScales = new Float32Array(starCount);
    const starPhases = new Float32Array(starCount);

    for (let i = 0; i < starCount; i += 1) {
      const r = 7 + Math.random() * 26;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 30;
      starPositions[i * 3] = Math.cos(theta) * r;
      starPositions[i * 3 + 1] = y;
      starPositions[i * 3 + 2] = Math.sin(theta) * r - 6;
      starScales[i] = Math.pow(Math.random(), 4) * 4.5 + 1.1;
      starPhases[i] = Math.random();
    }

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('aScale', new THREE.BufferAttribute(starScales, 1));
    starGeometry.setAttribute('aPhase', new THREE.BufferAttribute(starPhases, 1));

    const starMaterial = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    /* ---------- cards ---------- */
    const loader = new THREE.ImageLoader();
    loader.setCrossOrigin('anonymous');

    /* GPU uploads are spread out (one per frame) so photos arriving never
     * cause a visible hitch in the motion. */
    const uploadQueue = [];

    const meshes = [];
    const geometries = new Set();
    const ownedTextures = new Set();
    const objectUrls = new Set();
    const candidateCache = new Map();
    const textureCache = new Map();
    let disposed = false;

    let cardGeometry = createCurvedCardGeometry(layout.cardW, layout.cardH, layout.radius);
    geometries.add(cardGeometry);

    function applyCover(material, texture) {
      const image = texture.image;
      const iw = image?.naturalWidth || image?.videoWidth || image?.width || 1;
      const ih = image?.naturalHeight || image?.videoHeight || image?.height || 1;
      const imageAspect = iw / ih;
      const planeAspect = layout.cardW / layout.cardH;
      const repeat = material.uniforms.uRepeat.value;
      const offset = material.uniforms.uOffset.value;

      if (imageAspect > planeAspect) {
        repeat.set(planeAspect / imageAspect, 1);
      } else {
        repeat.set(1, imageAspect / planeAspect);
      }

      offset.set((1 - repeat.x) / 2, (1 - repeat.y) / 2);
    }

    function candidatesFor(card) {
      const key = card.evidence?.id || `fallback-${card.story?.id}`;

      if (!candidateCache.has(key)) {
        candidateCache.set(
          key,
          resolveMediaCandidates({ evidence: card.evidence, token, preview }).then(urls => {
            urls.forEach(url => url?.startsWith('blob:') && objectUrls.add(url));
            return urls;
          })
        );
      }

      return candidateCache.get(key);
    }

    /* Phone/Drive photos can be 4000px+. Cards never need more than this,
     * and smaller textures upload quickly and sample cleanly. */
    function toTexture(image) {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const maxSide = layout.mobile ? 960 : 1400;
      const scale = Math.min(1, maxSide / Math.max(width, height, 1));
      let texture;

      if (scale < 1) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        texture = new THREE.CanvasTexture(canvas);
      } else {
        texture = new THREE.Texture(image);
      }

      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maxAnisotropy;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      ownedTextures.add(texture);
      return texture;
    }

    function loadTexture(url) {
      if (!textureCache.has(url)) {
        textureCache.set(
          url,
          new Promise(resolve => {
            loader.load(
              url,
              async image => {
                try {
                  await image.decode?.();
                } catch {
                  /* already decoded or not decodable — carry on */
                }
                if (disposed) return resolve(null);

                let texture;
                try {
                  texture = toTexture(image);
                } catch {
                  return resolve(null);
                }

                uploadQueue.push(() => {
                  renderer.initTexture(texture);
                  resolve(texture);
                });
              },
              undefined,
              () => resolve(null)
            );
          })
        );
      }

      return textureCache.get(url);
    }

    async function firstTexture(card) {
      const urls = await candidatesFor(card);
      for (const url of urls) {
        // eslint-disable-next-line no-await-in-loop
        const texture = await loadTexture(url);
        if (texture) return texture;
      }
      return null;
    }

    cards.forEach((card, index) => {
      const fallback = createFallbackTexture(card);
      ownedTextures.add(fallback);

      const material = new THREE.ShaderMaterial({
        vertexShader: CARD_VERTEX,
        fragmentShader: CARD_FRAGMENT,
        uniforms: {
          uMap: { value: fallback },
          uFallback: { value: fallback },
          uReveal: { value: 0 },
          uRepeat: { value: new THREE.Vector2(1, 1) },
          uOffset: { value: new THREE.Vector2(0, 0) },
          uSize: { value: new THREE.Vector2(layout.cardW, layout.cardH) },
          uCorner: { value: layout.corner },
          uOpacity: { value: 0 },
          uFade: { value: 1 },
          uHover: { value: 0 },
          uFocus: { value: 0 },
          uWind: { value: 0 },
          uTime: { value: 0 },
          uRadius: { value: layout.radius }
        },
        side: THREE.DoubleSide,
        transparent: false,
        alphaToCoverage: true,
        depthWrite: true
      });

      applyCover(material, fallback);

      const mesh = new THREE.Mesh(cardGeometry, material);
      mesh.userData = { card, index, hover: 0 };
      helix.add(mesh);
      meshes.push(mesh);

      gsap.to(material.uniforms.uOpacity, {
        value: 1,
        duration: 1.1,
        delay: 0.15 + index * 0.035,
        ease: 'power2.out'
      });

      firstTexture(card).then(texture => {
        if (!texture || disposed) return;
        material.uniforms.uMap.value = texture;
        applyCover(material, texture);
        /* Cross-dissolve from the placeholder to the photograph. */
        gsap.to(material.uniforms.uReveal, { value: 1, duration: 1.2, ease: 'power2.inOut' });
      });
    });

    /* ---------- motion state ---------- */
    const N = meshes.length;
    /* All input only moves `target`; a critically damped spring glides
     * `progress` towards it. One source of truth = no fighting, no jitter. */
    const AUTO_SPEED = 0.38; // cards per second while cruising
    const state = {
      progress: -N * 0.2,
      target: 0,
      springVelocity: 0,
      velocity: 0,
      auto: 0,
      wind: 0,
      lastMoveT: 0,
      introUntil: performance.now() + 2800,
      dragging: false,
      lastX: 0,
      lastT: 0,
      moved: 0,
      pointer: new THREE.Vector2(0, 0),
      parallax: new THREE.Vector2(0, 0),
      hoverMesh: null,
      playing: !reducedMotion,
      idleUntil: 0
    };

    setPlaying(state.playing);

    if (reducedMotion) state.progress = 0;

    /* The front-centre slot: the helix position that faces the camera at
     * mid-height. Angles are measured from it, so integer progress values
     * always land a card exactly in front. */
    const frontSlot = Math.round((N - 1) / 2);
    const fadeLength = Math.min(2.6, N * 0.14);

    function wrap(value, size) {
      return ((value % size) + size) % size;
    }

    function place() {
      const middle = (N - 1) / 2;

      meshes.forEach(mesh => {
        const t = wrap(mesh.userData.index + state.progress, N);
        const angle = (t - frontSlot) * layout.angleStep;
        const y = (middle - t) * layout.pitch;

        mesh.position.set(Math.sin(angle) * layout.radius, y, Math.cos(angle) * layout.radius);
        mesh.rotation.set(0, angle, 0);

        const fadeIn = THREE.MathUtils.smoothstep(t, 0, fadeLength);
        const fadeOut = 1 - THREE.MathUtils.smoothstep(t, N - 1 - fadeLength, N - 1);
        mesh.material.uniforms.uFade.value = fadeIn * fadeOut;
        mesh.userData.t = t;
      });
    }

    const worldPos = new THREE.Vector3();

    function focusIndex() {
      let best = -Infinity;
      let bestIndex = 0;

      meshes.forEach((mesh, index) => {
        mesh.getWorldPosition(worldPos);
        const score = worldPos.z - Math.abs(worldPos.y) * 0.9;
        if (score > best) {
          best = score;
          bestIndex = index;
        }
      });

      return bestIndex;
    }

    /* ---------- interaction ---------- */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function toNdc(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      return ndc;
    }

    function pick(event) {
      raycaster.setFromCamera(toNdc(event), camera);
      const hits = raycaster.intersectObjects(meshes, false);
      const hit = hits.find(h => h.object.material.uniforms.uFade.value > 0.4 && h.face);
      if (!hit) return null;

      /* Only the outward-facing side of a panel is clickable. */
      hit.object.getWorldPosition(worldPos);
      return worldPos.z > -layout.radius * 0.2 ? hit.object : null;
    }

    const dragScale = () => (layout.mobile ? 0.0105 : 0.0068);

    function onPointerDown(event) {
      state.dragging = true;
      state.lastX = event.clientX;
      state.lastT = performance.now();
      state.moved = 0;
      state.velocity = 0;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      shell.classList.add('isDragging');
      setTouched(true);
    }

    function onPointerMove(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      state.pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      if (cursorRef.current && finePointer) {
        shell.classList.add('isPointerIn');
        cursorRef.current.style.transform = `translate3d(${event.clientX - rect.left}px, ${
          event.clientY - rect.top
        }px, 0)`;
      }

      if (state.dragging) {
        const now = performance.now();
        const dx = event.clientX - state.lastX;
        const dt = Math.max(8, now - state.lastT);
        state.lastX = event.clientX;
        state.lastT = now;
        state.lastMoveT = now;
        state.moved += Math.abs(dx);
        state.target += dx * dragScale();
        /* Smoothed release velocity (cards per second). */
        const instant = ((dx * dragScale()) / dt) * 1000;
        state.velocity = state.velocity * 0.6 + instant * 0.4;
        return;
      }

      if (finePointer) {
        const mesh = pick(event);
        if (mesh !== state.hoverMesh) {
          state.hoverMesh = mesh;
          setHovering(Boolean(mesh));
        }
      }
    }

    function onPointerUp(event) {
      if (!state.dragging) return;
      state.dragging = false;
      shell.classList.remove('isDragging');
      state.idleUntil = performance.now() + 2600;

      /* Held still before letting go = no flick. */
      if (performance.now() - state.lastMoveT > 90) state.velocity = 0;
      state.velocity = THREE.MathUtils.clamp(state.velocity, -12, 12);

      if (state.moved < 6) {
        const mesh = pick(event);
        const story = mesh?.userData.card.story;
        if (story) onOpenRef.current?.(story);
      }
    }

    /* The page can scroll under a still mouse; hide the custom cursor until
     * the pointer actually moves again so it never sits in a stale spot. */
    function hideCursor() {
      shell.classList.remove('isPointerIn');
    }

    function onPointerLeave() {
      hideCursor();
      state.pointer.set(0, 0);
      if (state.hoverMesh) {
        state.hoverMesh = null;
        setHovering(false);
      }
    }

    function onWheel(event) {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      state.target += THREE.MathUtils.clamp(delta, -120, 120) * 0.004;
      state.idleUntil = performance.now() + 1800;
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    mount.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('scroll', hideCursor, { passive: true });

    /* ---------- loop ---------- */
    let frame = 0;
    let running = false;
    let visible = true;
    let last = performance.now();
    let lastFocusCheck = 0;
    const clock = { time: 0 };

    /* Adaptive quality: watch the real frame time for a few seconds after
     * the intro; if it stays slow, render at 1x so motion stays fluid. */
    let frameAverage = 16.7;
    let sampledFrames = 0;

    function watchFrameRate(rawDt) {
      if (quality === 'low' || rawDt > 250) return;
      frameAverage = frameAverage * 0.95 + rawDt * 0.05;
      sampledFrames += 1;
      if (sampledFrames > 150 && frameAverage > 21) {
        quality = 'low';
        renderer.setPixelRatio(pixelRatioFor());
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        starMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      }
    }

    function tick(now) {
      watchFrameRate(now - last);
      const dtMs = Math.min(64, now - last);
      const dt = dtMs / 1000;
      last = now;
      clock.time += dt;

      const approach = rate => 1 - Math.exp(-dt * rate);

      /* Cruise: eases in and out instead of starting/stopping abruptly. */
      const cruising = state.playing && !state.dragging && now > state.idleUntil;
      state.auto += ((cruising ? AUTO_SPEED : 0) - state.auto) * approach(1.1);
      state.target += state.auto * dt;

      /* Flick inertia. */
      if (!state.dragging && state.velocity) {
        state.target += state.velocity * dt;
        state.velocity *= Math.exp(-dt * 2.4);
        if (Math.abs(state.velocity) < 0.01) state.velocity = 0;
      }

      /* Critically damped spring (exact solution, stable at any frame rate). */
      const omega = state.dragging ? 16 : now < state.introUntil ? 2.3 : 3.8;
      const offset = state.progress - state.target;
      const decay = Math.exp(-omega * dt);
      const temp = (state.springVelocity + omega * offset) * dt;
      state.springVelocity = (state.springVelocity - omega * temp) * decay;
      state.progress = state.target + (offset + temp) * decay;

      const windTarget = reducedMotion
        ? 0
        : THREE.MathUtils.clamp(state.springVelocity * 0.22, -1, 1);
      state.wind += (windTarget - state.wind) * approach(4);

      /* Kept for the hover / parallax easing below. */
      const ease = k => 1 - Math.pow(1 - k, dtMs / 16.667);

      /* One texture upload per frame at most. */
      if (uploadQueue.length) uploadQueue.shift()();

      place();

      /* Parallax camera */
      state.parallax.lerp(state.pointer, ease(0.045));
      camera.position.set(
        cameraBase.x + state.parallax.x * 0.55,
        cameraBase.y + state.parallax.y * 0.35,
        cameraBase.z
      );
      camera.lookAt(0, 0, 0);

      stars.rotation.y = state.progress * -0.012 + clock.time * 0.004;
      starMaterial.uniforms.uTime.value = clock.time;

      meshes.forEach(mesh => {
        const target = mesh === state.hoverMesh ? 1 : 0;
        mesh.userData.hover += (target - mesh.userData.hover) * ease(0.12);
        const u = mesh.material.uniforms;
        u.uHover.value = mesh.userData.hover;
        u.uWind.value = state.wind;
        u.uTime.value = clock.time;
      });

      if (now - lastFocusCheck > 120) {
        lastFocusCheck = now;
        const index = focusIndex();
        meshes.forEach((mesh, i) => {
          mesh.material.uniforms.uFocus.value = i === index ? 1 : 0;
        });
        setActive(current => (current === index ? current : index));
      }

      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    }

    function start() {
      if (running || disposed) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(frame);
    }

    function syncRunning() {
      if (visible && !document.hidden) start();
      else stop();
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        syncRunning();
      },
      { rootMargin: '120px' }
    );
    observer.observe(shell);
    document.addEventListener('visibilitychange', syncRunning);

    /* ---------- resize ---------- */
    function rebuildGeometry() {
      const next = createCurvedCardGeometry(layout.cardW, layout.cardH, layout.radius);
      geometries.add(next);
      meshes.forEach(mesh => {
        mesh.geometry = next;
        const u = mesh.material.uniforms;
        u.uSize.value.set(layout.cardW, layout.cardH);
        u.uCorner.value = layout.corner;
        u.uRadius.value = layout.radius;
        applyCover(mesh.material, u.uMap.value);
      });
      cardGeometry = next;
    }

    const resizeObserver = new ResizeObserver(() => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;

      const nextLayout = layoutFor(width);
      const changed = nextLayout.mobile !== layout.mobile;
      layout = nextLayout;
      if (changed) rebuildGeometry();

      renderer.setPixelRatio(pixelRatioFor());
      renderer.setSize(width, height);
      starMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      frameCamera();
      if (!running) renderer.render(scene, camera);
    });
    resizeObserver.observe(mount);

    /* ---------- imperative API for the DOM controls ---------- */
    apiRef.current = {
      step(direction) {
        state.idleUntil = performance.now() + 3200;
        state.velocity = 0;
        state.target = Math.round(state.target) + direction;
      },
      goToStory(storyId) {
        /* Bring the nearest instance of this story to the front slot. */
        let bestDelta = Infinity;

        meshes.forEach(mesh => {
          if (mesh.userData.card.story?.id !== storyId) return;
          const t = wrap(mesh.userData.index + state.target, N);
          let delta = frontSlot - t;
          if (delta > N / 2) delta -= N;
          if (delta < -N / 2) delta += N;
          if (Math.abs(delta) < Math.abs(bestDelta)) bestDelta = delta;
        });

        if (!Number.isFinite(bestDelta)) return;
        state.idleUntil = performance.now() + 4200;
        state.velocity = 0;
        state.target = Math.round(state.target + bestDelta);
      },
      setPlaying(value) {
        state.playing = value;
      }
    };

    place();
    setReady(true);

    return () => {
      disposed = true;
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', syncRunning);
      uploadQueue.length = 0;

      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      mount.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', hideCursor);

      meshes.forEach(mesh => {
        gsap.killTweensOf(mesh.material.uniforms.uOpacity);
        gsap.killTweensOf(mesh.material.uniforms.uReveal);
        mesh.material.dispose();
      });
      geometries.forEach(geometry => geometry.dispose());
      ownedTextures.forEach(texture => texture.dispose());
      starGeometry.dispose();
      starMaterial.dispose();
      renderer.dispose();
      objectUrls.forEach(url => !isCachedBlobUrl(url) && URL.revokeObjectURL(url));

      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      apiRef.current = null;
    };
  }, [cards, token, preview]);

  const step = useCallback(direction => apiRef.current?.step(direction), []);

  const togglePlaying = useCallback(() => {
    setPlaying(current => {
      apiRef.current?.setPlaying(!current);
      return !current;
    });
  }, []);

  function onKeyDown(event) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'Enter' && activeCard?.story) {
      onOpen?.(activeCard.story);
    }
  }

  if (!cards.length) {
    return (
      <div className="sgEmpty">
        <Sparkles />
        <span>THE JOURNEY STARTS HERE</span>
        <h3>{preview ? 'Add the first Journey Moment.' : 'Journey moments will appear here soon.'}</h3>
      </div>
    );
  }

  const activeCard = cards[Math.min(active, cards.length - 1)] || cards[0];
  const activeStoryIndex = Math.max(0, items.findIndex(item => item.id === activeCard?.story?.id));
  const total = items.length;

  return (
    <div
      className={`sgShell ${ready ? 'isReady' : ''} ${hovering ? 'isHovering' : ''} ${
        touched ? 'isTouched' : ''
      }`}
      ref={shellRef}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="Journey moments. Use the left and right arrow keys to rotate, Enter to open."
      onKeyDown={onKeyDown}
    >
      <div className="sgAtmosphere" aria-hidden="true">
        <i className="sgGlow sgGlowCore" />
        <i className="sgGlow sgGlowRed" />
        <i className="sgColumn" />
      </div>

      <div className="sgCanvas" ref={mountRef} />
      <div className="sgVignette" aria-hidden="true" />

      <header className="sgTop">
        <span className="sgLive">
          <i />
          Interactive journey
        </span>
        <span className="sgCount" aria-live="polite">
          <b>{String(activeStoryIndex + 1).padStart(2, '0')}</b>
          <em>/</em>
          {String(total).padStart(2, '0')}
        </span>
      </header>

      <div className="sgCaption" key={activeCard?.story?.id}>
        <span className="sgCaptionIndex" aria-hidden="true">
          {String(activeStoryIndex + 1).padStart(2, '0')}
        </span>
        <small>
          <i />
          {domainLabel(activeCard?.domain)}
          {activeCard?.year ? <em>{activeCard.year}</em> : null}
        </small>
        <h3>{activeCard?.story?.title || activeCard?.title}</h3>
        <button
          type="button"
          className="sgOpen"
          onClick={() => activeCard?.story && onOpen?.(activeCard.story)}
        >
          <span>Open story</span>
          <ArrowUpRight />
        </button>
      </div>

      <nav className="sgRail" aria-label="Jump to a journey moment">
        {items.map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={index === activeStoryIndex ? 'isActive' : ''}
            aria-label={`Show ${item.title}`}
            aria-current={index === activeStoryIndex ? 'true' : undefined}
            onClick={() => apiRef.current?.goToStory(item.id)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <i />
          </button>
        ))}
      </nav>

      <div className="sgControls">
        <button type="button" aria-label="Previous moment" onClick={() => step(1)}>
          <ChevronLeft />
        </button>
        <button
          type="button"
          className="sgPlay"
          aria-label={playing ? 'Pause rotation' : 'Resume rotation'}
          aria-pressed={!playing}
          onClick={togglePlaying}
        >
          {playing ? <Pause /> : <Play />}
        </button>
        <button type="button" aria-label="Next moment" onClick={() => step(-1)}>
          <ChevronRight />
        </button>
      </div>

      <div className="sgHint" aria-hidden="true">
        <span className="sgHintTrack">
          <i />
        </span>
        Drag · Scroll · Tap a moment
      </div>

      <div className="sgCursor" ref={cursorRef} aria-hidden="true">
        <span className="sgCursorRing" />
        <span className="sgCursorLabel sgCursorDrag">Drag</span>
        <span className="sgCursorLabel sgCursorOpen">Open</span>
      </div>
    </div>
  );
}
