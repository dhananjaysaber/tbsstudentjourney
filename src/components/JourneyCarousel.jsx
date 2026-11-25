import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight, MoveHorizontal, Pause, Play } from 'lucide-react';
import { buildVisualCards, domainLabel, resolveMediaCandidates } from './JourneySpiral';
import { isCachedBlobUrl } from '../journeyApi';
import { drawCardFace, cardFontsReady, ringOrder } from '../lib/cardFace';
import './JourneyCarousel.css';

/* ------------------------------------------------------------------------
 * Carousel view — a real 3D ring of photos (WebGL).
 *
 * The cards stand on the inside of a big cylinder. The camera stands
 * behind the middle of that cylinder, looking at its far wall:
 *   · the cards on the far wall (the middle of the screen) are distant,
 *     small and face you square-on;
 *   · as the ring turns, cards travel round the wall towards you, growing
 *     and turning, and leave past the left and right edges of the screen.
 * The whole ring turns as one solid object, with eased speed and inertia,
 * so the movement is continuous and smooth.
 * ---------------------------------------------------------------------- */

const RADIUS = 10; /* cylinder radius (world units) */
const GAP = 0.14;

function fitRing(base) {
  const count = Math.round((Math.PI * 2 * RADIUS) / (base.cardW + GAP));
  const cardW = (Math.PI * 2 * RADIUS) / count - GAP;
  return { ...base, count, cardW, cardH: cardW * base.ratio };
}

function layoutFor(width) {
  const mobile = width < 700;
  if (mobile) {
    return fitRing({
      mobile,
      cardW: 4.6,
      ratio: 1.45,
      axis: 5.5, /* distance from the camera to the cylinder's axis */
      tanH: 0.64, /* half the horizontal field of view (as a tangent) */
      aspect: 1.6,
      corner: 0.24
    });
  }
  return fitRing({
    mobile,
    cardW: 3.4,
    ratio: 1.78,
    axis: 8,
    tanH: 1.0,
    aspect: 3.05,
    corner: 0.2
  });
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uRepeat;
  uniform vec2 uOffset;
  uniform vec2 uSize;
  uniform float uCorner;
  uniform float uHover;
  uniform float uReveal;
  uniform float uShade;
  varying vec2 vUv;

  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 local = (vUv - 0.5) * uSize;
    float d = roundedBox(local, uSize * 0.5, uCorner);
    float aa = max(fwidth(d), 0.0006);
    float mask = 1.0 - smoothstep(-aa, aa, d);
    if (mask < 0.003) discard;

    /* No zoom: the card's header and footer must stay whole. */
    vec3 color = texture2D(uMap, vUv * uRepeat + uOffset).rgb;
    color *= mix(0.9, 1.0, uReveal);
    color *= uShade;
    color *= 1.0 + uHover * 0.08;
    gl_FragColor = vec4(color, mask);
    #include <colorspace_fragment>
  }
`;

function coverFit(material, texture, cardW, cardH) {
  const image = texture.image;
  const iw = image?.naturalWidth || image?.width || 1;
  const ih = image?.naturalHeight || image?.height || 1;
  const cardAspect = cardW / cardH;
  const imageAspect = iw / ih;
  const repeat = material.uniforms.uRepeat.value;
  const offset = material.uniforms.uOffset.value;
  if (imageAspect > cardAspect) {
    repeat.set(cardAspect / imageAspect, 1);
    offset.set((1 - repeat.x) / 2, 0);
  } else {
    repeat.set(1, imageAspect / cardAspect);
    offset.set(0, (1 - repeat.y) / 2);
  }
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

export default function JourneyCarousel({ items = [], evidence = [], token, preview = false, onOpen }) {
  const shellRef = useRef(null);
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const onOpenRef = useRef(onOpen);
  const [playing, setPlaying] = useState(true);
  const [active, setActive] = useState(null);
  const [hovering, setHovering] = useState(false);
  const [supported] = useState(() => (typeof window === 'undefined' ? true : webglAvailable()));
  const [mobileMode, setMobileMode] = useState(() => (typeof window === 'undefined' ? false : window.innerWidth < 700));

  useEffect(() => {
    const onResize = () => setMobileMode((shellRef.current?.clientWidth || window.innerWidth) < 700);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  onOpenRef.current = onOpen;

  const builtCards = useMemo(() => buildVisualCards(items, evidence), [items, evidence]);
  const signature = builtCards.map(card => card.instanceKey).join('|');

  useEffect(() => {
    const mount = mountRef.current;
    const shell = shellRef.current;
    if (!mount || !shell || !builtCards.length || !supported) return undefined;

    let disposed = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 3, 0.1, 100);
    const ring = new THREE.Group();
    scene.add(ring);

    let layout = layoutFor(shell.clientWidth || window.innerWidth);
    const { count } = layout;
    const step = (Math.PI * 2) / count; /* whole cards close the ring exactly */

    const loader = new THREE.ImageLoader();
    loader.setCrossOrigin('anonymous');
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const owned = new Set();
    const objectUrls = new Set();
    const textureCache = new Map();

    const imageCache = new Map();
    function loadImage(url) {
      if (!imageCache.has(url)) {
        imageCache.set(
          url,
          new Promise(resolve => {
            loader.load(url, image => resolve(disposed ? null : image), undefined, () => resolve(null));
          })
        );
      }
      return imageCache.get(url);
    }

    /* The approved card (header, framed photo, footer), one texture per
     * photo per layout, shared by every repeat of that card. */
    const faceCache = new Map();
    function faceTexture(card, image) {
      const key = `${card.key}|${image ? 'photo' : 'none'}|${layout.mobile ? 'm' : 'd'}`;
      if (!faceCache.has(key)) {
        const canvas = drawCardFace({ card, image, ratio: layout.cardH / layout.cardW, width: layout.mobile ? 820 : 1024 });
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = maxAniso;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        owned.add(texture);
        faceCache.set(key, texture);
      }
      return faceCache.get(key);
    }

    const candidateCache = new Map();
    function candidatesFor(card) {
      const key = card.evidence?.id || `none-${card.story?.id}`;
      if (!candidateCache.has(key)) {
        candidateCache.set(
          key,
          resolveMediaCandidates({ evidence: card.evidence, token, preview })
            .then(urls => {
              urls.forEach(url => url?.startsWith('blob:') && objectUrls.add(url));
              return urls;
            })
            .catch(() => [])
        );
      }
      return candidateCache.get(key);
    }

    /* Build the ring */
    let geometry = new THREE.PlaneGeometry(layout.cardW, layout.cardH, 1, 1);
    const meshes = [];
    const ordered = ringOrder(builtCards, count);
    for (let i = 0; i < count; i += 1) {
      const card = ordered[i];
      const fallback = faceTexture(card, null);
      const material = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uMap: { value: fallback },
          uRepeat: { value: new THREE.Vector2(1, 1) },
          uOffset: { value: new THREE.Vector2(0, 0) },
          uSize: { value: new THREE.Vector2(layout.cardW, layout.cardH) },
          uCorner: { value: layout.corner },
          uHover: { value: 0 },
          uReveal: { value: 0 },
          uShade: { value: 1 }
        },
        transparent: true,
        side: THREE.DoubleSide
      });
      coverFit(material, fallback, layout.cardW, layout.cardH);
      const mesh = new THREE.Mesh(geometry, material);
      const angle = i * step;
      mesh.position.set(Math.sin(angle) * RADIUS, 0, -Math.cos(angle) * RADIUS);
      mesh.rotation.y = -angle;
      mesh.userData = { card, index: i, angle, hover: 0 };
      ring.add(mesh);
      meshes.push(mesh);

      candidatesFor(card).then(async urls => {
        await cardFontsReady();
        if (disposed) return;
        for (const url of urls) {
          // eslint-disable-next-line no-await-in-loop
          const image = await loadImage(url);
          if (disposed) return;
          if (image) {
            mesh.userData.image = image;
            const texture = faceTexture(card, image);
            material.uniforms.uMap.value = texture;
            material.uniforms.uReveal.value = 1;
            coverFit(material, texture, layout.cardW, layout.cardH);
            return;
          }
        }
        /* No photo: redraw the plain card now the fonts are in. */
        if (!mesh.userData.image) {
          const texture = faceTexture(card, null);
          material.uniforms.uMap.value = texture;
          coverFit(material, texture, layout.cardW, layout.cardH);
        }
      });
    }

    /* Camera + sizing */
    function resize() {
      const width = shell.clientWidth || window.innerWidth;
      const next = layoutFor(width);
      if (next.mobile !== layout.mobile) {
        layout = next;
        geometry.dispose();
        geometry = new THREE.PlaneGeometry(layout.cardW, layout.cardH, 1, 1);
        meshes.forEach(mesh => {
          mesh.geometry = geometry;
          mesh.material.uniforms.uSize.value.set(layout.cardW, layout.cardH);
          mesh.material.uniforms.uCorner.value = layout.corner;
          /* The card's shape changed: redraw its face to the new shape. */
          const face = faceTexture(mesh.userData.card, mesh.userData.image || null);
          mesh.material.uniforms.uMap.value = face;
          coverFit(mesh.material, face, layout.cardW, layout.cardH);
        });
      } else {
        layout = next;
      }
      const height = Math.round(width / layout.aspect);
      mount.style.height = `${height}px`;
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = `${width}px`;
      renderer.domElement.style.height = `${height}px`;
      camera.aspect = width / height;
      const tanV = layout.tanH / camera.aspect;
      camera.fov = (2 * Math.atan(tanV) * 180) / Math.PI;
      camera.position.set(0, 0, 0);
      camera.updateProjectionMatrix();
      ring.position.set(0, 0, -layout.axis);
    }
    resize();

    /* Motion: one angle for the whole ring, eased. */
    const AUTO = layout.mobile ? 0.07 : 0.055; /* radians per second */
    const motion = {
      angle: 0,
      velocity: reducedMotion ? 0 : AUTO,
      playing: !reducedMotion,
      dragging: false,
      target: null,
      hover: false,
      parallaxX: 0,
      parallaxY: 0,
      pointerX: 0,
      pointerY: 0
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(-10, -10);
    let hovered = null;
    let lastActive = -1;
    let visible = true;

    function pick(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      return hit?.object || null;
    }

    let last = performance.now();
    let frame = 0;
    function tick(now) {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || disposed) return;

      if (motion.target != null) {
        /* critically damped glide to a card */
        const diff = motion.target - motion.angle;
        motion.velocity = diff * 6;
        if (Math.abs(diff) < 0.0004) {
          motion.angle = motion.target;
          motion.target = null;
          motion.velocity = 0;
        }
      } else if (!motion.dragging) {
        const cruise = motion.playing && !motion.hover ? AUTO : 0;
        /* ease towards cruising speed: inertia after a drag, soft start/stop */
        motion.velocity += (cruise - motion.velocity) * (1 - Math.exp(-dt * 1.6));
      }
      if (!motion.dragging) motion.angle += motion.velocity * dt;

      ring.rotation.y = motion.angle;

      /* gentle camera parallax with the pointer */
      motion.parallaxX += (motion.pointerX - motion.parallaxX) * (1 - Math.exp(-dt * 3));
      motion.parallaxY += (motion.pointerY - motion.parallaxY) * (1 - Math.exp(-dt * 3));
      camera.rotation.y = -motion.parallaxX * 0.035;
      camera.rotation.x = motion.parallaxY * 0.03;

      let nearest = null;
      let nearestAbs = Infinity;
      meshes.forEach(mesh => {
        let a = (mesh.userData.angle - motion.angle) % (Math.PI * 2);
        if (a > Math.PI) a -= Math.PI * 2;
        if (a < -Math.PI) a += Math.PI * 2;
        const abs = Math.abs(a);
        if (abs < nearestAbs) {
          nearestAbs = abs;
          nearest = mesh;
        }
        const targetHover = mesh === hovered ? 1 : 0;
        mesh.userData.hover += (targetHover - mesh.userData.hover) * (1 - Math.exp(-dt * 10));
        const u = mesh.material.uniforms;
        u.uHover.value = mesh.userData.hover;
        /* cards on the far wall are a touch softer, near ones full strength */
        u.uShade.value = 0.9 + 0.1 * Math.min(1, abs / 1.2);
        const s = 1 + mesh.userData.hover * 0.035;
        mesh.scale.set(s, s, 1);
      });

      if (nearest && nearest.userData.index !== lastActive) {
        lastActive = nearest.userData.index;
        setActive(nearest.userData.card);
      }

      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(tick);

    /* Pointer: drag with inertia, hover, tap to open */
    const el = renderer.domElement;
    el.style.touchAction = 'pan-y';
    let dragStartX = 0;
    let lastX = 0;
    let lastT = 0;
    let moved = 0;
    let activePointer = null;
    const dragScale = () => (layout.mobile ? 2.4 : 1.6) / (shell.clientWidth || 1000);

    function onDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      activePointer = event.pointerId;
      dragStartX = lastX = event.clientX;
      lastT = performance.now();
      moved = 0;
      motion.dragging = true;
      motion.target = null;
      motion.velocity = 0;
    }
    function onMove(event) {
      const rect = el.getBoundingClientRect();
      if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
        motion.pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        motion.pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      }
      if (motion.dragging && event.pointerId === activePointer) {
        const now = performance.now();
        const dx = event.clientX - lastX;
        const dAngle = dx * dragScale();
        motion.angle -= dAngle;
        const instant = -dAngle / Math.max(0.008, (now - lastT) / 1000);
        motion.velocity = motion.velocity * 0.6 + instant * 0.4;
        lastX = event.clientX;
        lastT = now;
        moved = Math.max(moved, Math.abs(event.clientX - dragStartX));
        if (moved > 6 && !el.hasPointerCapture?.(activePointer)) el.setPointerCapture?.(activePointer);
        return;
      }
      if (event.target !== el) return;
      const mesh = pick(event.clientX, event.clientY);
      if (mesh !== hovered) {
        hovered = mesh;
        el.style.cursor = mesh ? 'pointer' : 'grab';
      }
    }
    function onUp(event) {
      if (event.pointerId !== activePointer) return;
      motion.dragging = false;
      activePointer = null;
      if (performance.now() - lastT > 100) motion.velocity = 0;
      motion.velocity = Math.max(-3, Math.min(3, motion.velocity));
      if (moved <= 6) {
        const mesh = pick(event.clientX, event.clientY);
        if (mesh?.userData.card?.story) onOpenRef.current?.(mesh.userData.card.story);
      }
    }
    function onEnter() {
      motion.hover = true;
      setHovering(true);
    }
    function onLeave() {
      motion.hover = false;
      motion.pointerX = 0;
      motion.pointerY = 0;
      hovered = null;
      setHovering(false);
    }

    el.style.cursor = 'grab';
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(shell);

    const io = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? true;
      last = performance.now();
    });
    io.observe(shell);

    apiRef.current = {
      step(direction) {
        const base = motion.target ?? motion.angle;
        /* snap to the nearest card, then move one card */
        const snapped = Math.round(base / step) * step;
        motion.target = snapped + direction * step;
      },
      setPlaying(value) {
        motion.playing = value;
      }
    };

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      io.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      meshes.forEach(mesh => mesh.material.dispose());
      geometry.dispose();
      owned.forEach(texture => texture.dispose());
      objectUrls.forEach(url => !isCachedBlobUrl(url) && URL.revokeObjectURL(url));
      renderer.dispose();
      renderer.domElement.remove();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, token, preview, supported, mobileMode]);

  function togglePlay() {
    const next = !playing;
    setPlaying(next);
    apiRef.current?.setPlaying(next);
  }

  if (!builtCards.length) {
    return (
      <div className="sectionShell">
        <p className="journeyBlogEmpty">No moments in this category yet.</p>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="sectionShell">
        <p className="journeyBlogEmpty">This view needs a browser with 3D graphics. Try the Blog view.</p>
      </div>
    );
  }

  return (
    <div className={`journeyCarousel ${hovering ? 'isHovering' : ''}`} ref={shellRef}>
      <div
        className="jcStage"
        ref={mountRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Journey photos. Drag to turn, or use the buttons below."
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            apiRef.current?.step(-1);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            apiRef.current?.step(1);
          }
          if ((event.key === 'Enter' || event.key === ' ') && active?.story) {
            event.preventDefault();
            onOpen?.(active.story);
          }
        }}
      />

      <div className="sectionShell jcBar">
        <span className="jcHint"><MoveHorizontal /> Drag to explore</span>
        <div className="jcNow" aria-live="polite">
          {active && (
            <>
              <small>{domainLabel(active.domain)}{active.year ? ` · ${active.year}` : ''}</small>
              <button type="button" onClick={() => active.story && onOpen?.(active.story)}>
                {active.story?.title || active.title}
              </button>
            </>
          )}
        </div>
        <div className="jcControls">
          <button type="button" aria-label="Previous" onClick={() => apiRef.current?.step(-1)}><ChevronLeft /></button>
          <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>{playing ? <Pause /> : <Play />}</button>
          <button type="button" aria-label="Next" onClick={() => apiRef.current?.step(1)}><ChevronRight /></button>
        </div>
      </div>
    </div>
  );
}
