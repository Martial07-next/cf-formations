'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, FileStack } from 'lucide-react';

export type PaperSlide = { key: string; label: string; badge?: string | null; node: ReactNode };

const STORE = 'cf_papers_slide';

/**
 * « Papiers stagiaires » : autorisations (droit à l'image, livrets, règlement…),
 * vêtements prêtés, départs anticipés… dans un seul bloc, un volet à la fois,
 * avec des flèches. Les volets restent montés (un QR code affiché le reste).
 */
export function PapersCarousel({ slides }: { slides: PaperSlide[] }) {
  const [i, setI] = useState(0);
  // Dernier volet ouvert, retrouvé d'une session à l'autre.
  useEffect(() => {
    try {
      const k = localStorage.getItem(STORE);
      const at = slides.findIndex((s) => s.key === k);
      if (at > 0) setI(at);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Lien direct (#departs, #autorisations, #vetements) : ouvre le bon volet.
  useEffect(() => {
    const open = () => {
      const at = slides.findIndex((s) => `#${s.key}` === window.location.hash);
      if (at >= 0) setI(at);
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!slides.length) return null;
  const cur = Math.min(i, slides.length - 1);
  const go = (n: number) => {
    const next = (n + slides.length) % slides.length;
    setI(next);
    try {
      localStorage.setItem(STORE, slides[next].key);
    } catch {}
  };

  return (
    <section className="panel papers" aria-roledescription="carrousel" aria-label="Papiers stagiaires">
      <div className="papers-head">
        <h2><FileStack size={17} aria-hidden /> Papiers stagiaires</h2>
        {slides.length > 1 && (
          <div className="papers-nav">
            <button type="button" className="icon ghost small" onClick={() => go(cur - 1)} aria-label="Volet précédent"><ChevronLeft size={18} /></button>
            <div className="papers-tabs" role="tablist">
              {slides.map((s, k) => (
                <button key={s.key} type="button" role="tab" aria-selected={k === cur} className={k === cur ? 'on' : ''} onClick={() => go(k)}>
                  {s.label}
                  {s.badge && <span className="papers-badge">{s.badge}</span>}
                </button>
              ))}
            </div>
            <button type="button" className="icon ghost small" onClick={() => go(cur + 1)} aria-label="Volet suivant"><ChevronRight size={18} /></button>
          </div>
        )}
      </div>
      {slides.map((s, k) => (
        <div key={s.key} className="papers-slide" role="tabpanel" hidden={k !== cur} aria-label={s.label}>
          {s.node}
        </div>
      ))}
    </section>
  );
}
