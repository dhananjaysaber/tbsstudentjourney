import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { privateEvidenceBlobUrl, publicEvidenceUrl } from '../journeyApi';

import './HeroPortrait.css';

/* Resolves the profile photo URL with the same rules as SecureEvidenceImage,
 * so a single fetch feeds both the portrait and its ambient light. */
function usePortraitSrc(evidence, token, preview) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let active = true;
    let blobUrl = '';

    async function load() {
      if (!evidence) {
        setSrc('');
        return;
      }

      if (token && evidence.drive_file_id) {
        setSrc(publicEvidenceUrl(evidence.id, token));
        return;
      }

      if (preview && evidence.drive_file_id) {
        try {
          blobUrl = await privateEvidenceBlobUrl(evidence.id);
          if (active) setSrc(blobUrl);
        } catch (error) {
          console.error('Portrait media failed', error);
        }
        return;
      }

      setSrc(evidence.thumbnail_url || evidence.media_url || '');
    }

    load();

    return () => {
      active = false;
      if (blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
    };
  }, [evidence?.id, evidence?.drive_file_id, evidence?.media_url, evidence?.thumbnail_url, token, preview]);

  return src;
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');
}

/* Each letter is placed on the ring individually so the full
 * "THE BRITISH SCHOOL" reads identically in every browser. */
const SEAL_CHARS = [...'THE BRITISH SCHOOL • NEW DELHI • STUDENT JOURNEY • '];

export default function HeroPortrait({ name, yearGroup, evidence, token, preview }) {
  const src = usePortraitSrc(evidence, token, preview);
  const [loadedSrc, setLoadedSrc] = useState('');
  const figureRef = useRef(null);
  const frame = useRef(0);

  /* Pointer-driven tilt + glare (fine pointers only, respects reduced motion). */
  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return undefined;

    const canTilt =
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!canTilt) return undefined;

    function update(x, y) {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        figure.style.setProperty('--hp-rx', `${(-y * 7).toFixed(2)}deg`);
        figure.style.setProperty('--hp-ry', `${(x * 9).toFixed(2)}deg`);
        figure.style.setProperty('--hp-gx', `${((x + 1) * 50).toFixed(1)}%`);
        figure.style.setProperty('--hp-gy', `${((y + 1) * 50).toFixed(1)}%`);
      });
    }

    function onMove(event) {
      const rect = figure.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      figure.classList.add('isTilting');
      update(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
    }

    function onLeave() {
      figure.classList.remove('isTilting');
      update(0, 0);
    }

    figure.addEventListener('pointermove', onMove);
    figure.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(frame.current);
      figure.removeEventListener('pointermove', onMove);
      figure.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const hasPhoto = Boolean(src);
  const loaded = hasPhoto && loadedSrc === src;

  return (
    <div className="hpWrap">
      <figure
        ref={figureRef}
        className={`hp ${loaded ? 'isLoaded' : ''} ${hasPhoto ? '' : 'isFallback'}`}
      >
        {hasPhoto && (
          <div className="hpAmbient" aria-hidden="true">
            <img src={src} alt="" />
          </div>
        )}

        <div className="hpCard">
          <div className="hpMedia">
            {hasPhoto ? (
              <img
                className="hpImg"
                src={src}
                alt={name}
                onLoad={() => setLoadedSrc(src)}
                onError={() => setLoadedSrc(src)}
              />
            ) : (
              <div className="hpMonogram" role="img" aria-label={name}>
                <span>{initials(name) || 'S'}</span>
              </div>
            )}
            <div className="hpShade" aria-hidden="true" />
            <div className="hpGlare" aria-hidden="true" />
          </div>

          <span className="hpInset" aria-hidden="true" />

          <span className="hpBadge">
            <ShieldCheck />
            Verified journey
          </span>

          <figcaption className="hpPlate">
            <span>
              <small>The British School</small>
              <b>New Delhi</b>
            </span>
            {yearGroup ? <em>{yearGroup}</em> : <em>Portrait</em>}
          </figcaption>
        </div>

        <div className="hpSeal" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            {SEAL_CHARS.map((char, index) => (
              <text
                key={index}
                x="60"
                y="17"
                textAnchor="middle"
                transform={`rotate(${(index * 360) / SEAL_CHARS.length} 60 60)`}
              >
                {char}
              </text>
            ))}
          </svg>
          <span>{initials(name) || 'S'}</span>
        </div>

        <i className="hpMark hpMarkTop" aria-hidden="true" />
        <i className="hpMark hpMarkBottom" aria-hidden="true" />
      </figure>
    </div>
  );
}
