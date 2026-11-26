'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BadgeCheck, ChevronLeft, Crown, Mail, ChevronRight, Clock3, Expand, HeartHandshake, MessageSquareQuote, Search, ShieldCheck, Sparkles, Star, TrendingUp, X, Zap } from 'lucide-react';
import type { AvisData, Review } from '@/lib/avis';

/** Étoiles (pleines / vides), animées une à une. */
function Stars({ n = 5, size = 22, pop = false }: { n?: number; size?: number; pop?: boolean }) {
  return (
    <span className={`ap-stars${pop ? ' pop' : ''}`} aria-label={`${n} sur 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} size={size} aria-hidden style={{ animationDelay: `${0.15 + i * 0.12}s` }} className={i < Math.round(n) ? 'on' : ''} />
      ))}
    </span>
  );
}

/** Nombre qui défile jusqu'à sa valeur (4,9 · 377 · 98 %). */
function Count({ to, decimals = 0, suffix = '' }: { to: number; decimals?: number; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1200);
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{v.toFixed(decimals).replace('.', ',')}{suffix}</>;
}

function ReviewCard({ r, i, source }: { r: Review; i: number; source: 'pqp' | 'google' }) {
  return (
    <figure className={`ap-review ${source}`} style={{ animationDelay: `${0.1 + i * 0.12}s` }}>
      <Stars n={r.rating} size={16} />
      <blockquote>« {r.text} »</blockquote>
      <figcaption>
        <strong>{r.author || r.title}</strong>
        {r.author && r.title && r.title !== r.author ? <span> · {r.title}</span> : null}
        {r.date ? <span> · {r.date}</span> : null}
      </figcaption>
    </figure>
  );
}

/**
 * Présentation « Votre avis compte ! » à montrer aux stagiaires au début de
 * chaque session : pourquoi c'est important, comment faire (Google à chaud,
 * Plus que pro à froid), derniers avis, puis les QR codes. Plein écran,
 * flèches du clavier ou boutons, animations à chaque diapositive.
 */
export function AvisPresentation({ avis, onClose }: { avis: AvisData; onClose: () => void }) {
  const hasGoogle = avis.google.reviews.length > 0 || avis.google.note != null;
  const slides = ['intro', 'pourquoi', 'comment', 'pqp', ...(hasGoogle ? ['google'] : []), 'qr'] as const;
  const [i, setI] = useState(0);
  // Affichée seulement dans le navigateur (portail sur la page).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const root = useRef<HTMLDivElement>(null);
  const go = useCallback((d: number) => setI((x) => Math.max(0, Math.min(slides.length - 1, x + d))), [slides.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [go, onClose]);
  // Balayage sur tablette / téléphone.
  const touch = useRef<number | null>(null);
  const slide = slides[i];
  const fullscreen = () => {
    const el = root.current as any;
    if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => null);
    else document.exitFullscreen?.().catch(() => null);
  };

  const content = (
    <div
      ref={root}
      className={`ap ap-${slide}`}
      role="dialog"
      aria-modal
      aria-label="Votre avis compte"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
    >
      <div className="ap-bg" aria-hidden><span /><span /><span /></div>
      <header className="ap-top">
        <img src="/logo-cf-reseaux.svg" alt="CF Réseaux" className="ap-logo" />
        <span className="ap-tools">
          <button type="button" className="ap-btn" onClick={fullscreen} aria-label="Plein écran" title="Plein écran"><Expand size={18} /></button>
          <button type="button" className="ap-btn" onClick={onClose} aria-label="Fermer la présentation" title="Fermer (Échap)"><X size={20} /></button>
        </span>
      </header>

      <main className="ap-stage" key={slide}>
        {slide === 'intro' && (
          <section className="ap-slide ap-center">
            <p className="ap-kicker"><Sparkles size={16} aria-hidden /> Avant de commencer</p>
            <h1 className="ap-title">Votre avis <span className="ap-hl ap-nowrap">COMPTE&nbsp;!</span></h1>
            <Stars size={54} pop />
            <p className="ap-sub">2 minutes de votre temps, un vrai coup de pouce pour toute l’équipe de CF Réseaux.</p>
          </section>
        )}

        {slide === 'pourquoi' && (
          <section className="ap-slide">
            <h2 className="ap-h2">Pourquoi c’est <span className="ap-hl">important</span> pour nous&nbsp;?</h2>
            <div className="ap-cards">
              {[
                { icon: <Search size={26} />, t: 'Aider les futurs stagiaires', d: 'Avant de choisir une formation, tout le monde lit les avis. Le vôtre guide ceux qui viendront après vous.' },
                { icon: <TrendingUp size={26} />, t: 'Améliorer nos formations', d: 'Chaque remarque est lue par l’équipe et sert à faire évoluer les contenus, le matériel et l’organisation.' },
                { icon: <ShieldCheck size={26} />, t: 'Prouver notre qualité', d: 'Vos avis comptent pour notre certification qualité et auprès des financeurs et des entreprises.' },
                { icon: <HeartHandshake size={26} />, t: 'Valoriser vos formateurs', d: 'Un mot sur votre formateur, c’est la plus belle reconnaissance de son travail.' },
              ].map((c, k) => (
                <div key={c.t} className="ap-card" style={{ animationDelay: `${0.1 + k * 0.14}s` }}>
                  <span className="ap-card-icon">{c.icon}</span>
                  <strong>{c.t}</strong>
                  <small>{c.d}</small>
                </div>
              ))}
            </div>
            {avis.pqp.note != null && (
              <div className="ap-stats">
                <span><b><Count to={avis.pqp.note} decimals={1} /><i>/5</i></b><small>note moyenne</small></span>
                {avis.pqp.count != null && <span><b><Count to={avis.pqp.count} /></b><small>avis certifiés Plus que pro</small></span>}
                {avis.pqp.recommandation != null && <span><b><Count to={avis.pqp.recommandation} suffix=" %" /></b><small>recommandent CF Réseaux</small></span>}
              </div>
            )}
          </section>
        )}

        {slide === 'comment' && (
          <section className="ap-slide">
            <h2 className="ap-h2">Comment ça <span className="ap-hl">marche</span>&nbsp;?</h2>
            <ol className="ap-steps">
              <li className="ap-main" style={{ animationDelay: '0.15s' }}>
                <span className="ap-step-badge pqp"><Crown size={16} aria-hidden /> Le plus important</span>
                <img src="/avis/qr-plusquepro.jpg" alt="" className="ap-step-qr" />
                <div>
                  <strong>Plus que pro · maintenant, puis dans 2 semaines</strong>
                  <p><b>1. Maintenant</b> : scannez le QR code et remplissez le petit formulaire, <b>tout de suite</b>.</p>
                  <p><b>2. Dans 2 semaines</b> : vous recevez <b>un e-mail de Plus que pro</b> pour donner votre avis <b>certifié</b> sur <b>la formation et son contenu</b> (contenu pédagogique, matériel, formateur, organisation, objectifs), avec le recul du terrain.</p>
                  <p className="ap-cert"><BadgeCheck size={16} aria-hidden /> Avis contrôlés : déposés par de vrais stagiaires, ni modifiables ni supprimables.</p>
                </div>
              </li>
              <li style={{ animationDelay: '0.45s' }}>
                <span className="ap-step-badge google"><Zap size={16} aria-hidden /> En plus · à chaud</span>
                <img src="/avis/qr-google.jpg" alt="" className="ap-step-qr" />
                <div>
                  <strong>Google · aujourd’hui</strong>
                  <p>Un avis plus <b>général sur CF Réseaux</b>, à la fin de la formation : l’accueil, l’ambiance, les locaux. Il aide les entreprises à nous trouver.</p>
                </div>
              </li>
            </ol>
            <p className="ap-tip" style={{ animationDelay: '0.8s' }}><Mail size={20} aria-hidden /> <span>Dans 2 semaines, <b>surveillez vos e-mails</b> (et vos courriers indésirables) : le message de Plus que pro arrive, 2 minutes suffisent pour répondre.</span></p>
          </section>
        )}

        {slide === 'pqp' && (
          <section className="ap-slide">
            <h2 className="ap-h2"><MessageSquareQuote size={30} aria-hidden /> Ils sont passés <span className="ap-hl">avant vous</span></h2>
            <p className="ap-source">
              Derniers avis certifiés Plus que pro, sur nos formations
              {avis.pqp.note != null && <b> · {String(avis.pqp.note).replace('.', ',')}/5{avis.pqp.count ? ` sur ${avis.pqp.count} avis` : ''}</b>}
            </p>
            <div className="ap-reviews">
              {avis.pqp.reviews.slice(0, 5).map((r, k) => <ReviewCard key={k} r={r} i={k} source="pqp" />)}
            </div>
          </section>
        )}

        {slide === 'google' && (
          <section className="ap-slide">
            <h2 className="ap-h2"><MessageSquareQuote size={30} aria-hidden /> Sur <span className="ap-hl">Google</span></h2>
            <p className="ap-source">
              Derniers avis Google
              {avis.google.note != null && <b> · {String(avis.google.note).replace('.', ',')}/5{avis.google.count ? ` sur ${avis.google.count} avis` : ''}</b>}
            </p>
            {avis.google.reviews.length ? (
              <div className="ap-reviews">
                {avis.google.reviews.slice(0, 5).map((r, k) => <ReviewCard key={k} r={r} i={k} source="google" />)}
              </div>
            ) : (
              <p className="ap-sub">Soyez parmi les prochains à laisser votre avis !</p>
            )}
          </section>
        )}

        {slide === 'qr' && (
          <section className="ap-slide ap-center">
            <h2 className="ap-h2">À vous de <span className="ap-hl">jouer</span>&nbsp;!</h2>
            <div className="ap-qrs">
              <figure className="ap-main" style={{ animationDelay: '0.1s' }}>
                <span className="ap-step-badge pqp"><Crown size={16} aria-hidden /> Le plus important · à remplir maintenant</span>
                <img src="/avis/qr-plusquepro.jpg" alt="QR code avis Plus que pro" />
              </figure>
              <figure style={{ animationDelay: '0.3s' }}>
                <span className="ap-step-badge google"><Zap size={16} aria-hidden /> En plus · à la fin de la formation</span>
                <img src="/avis/qr-google.jpg" alt="QR code avis Google" />
              </figure>
            </div>
            <p className="ap-thanks">Merci, et bonne formation ! <Stars size={22} /></p>
          </section>
        )}
      </main>

      <footer className="ap-nav">
        <button type="button" className="ap-btn" onClick={() => go(-1)} disabled={i === 0} aria-label="Précédent"><ChevronLeft size={22} /></button>
        <span className="ap-dots">
          {slides.map((s, k) => (
            <button key={s} type="button" className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Diapositive ${k + 1}`} />
          ))}
        </span>
        {i < slides.length - 1 ? (
          <button type="button" className="ap-btn ap-next" onClick={() => go(1)} aria-label="Suivant">Suivant <ChevronRight size={20} /></button>
        ) : (
          <button type="button" className="ap-btn ap-next" onClick={onClose}>Terminer <X size={18} /></button>
        )}
      </footer>
    </div>
  );
  return mounted ? createPortal(content, document.body) : null;
}
