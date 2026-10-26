'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Download, Type } from 'lucide-react';

const ZIP = '/polices/Polices-CF-Reseaux.zip';
/** Mémorisé sur cet ordinateur (navigateur) : les polices s'installent une fois par poste. */
const KEY = 'cf_polices_telechargees';
const EVENT = 'cf-polices';

/**
 * Polices obligatoires des supports de cours (Space Grotesk, Archivo,
 * Archivo Expanded) : téléchargement du pack et marche à suivre pour les
 * installer sur l'ordinateur (Windows / Mac).
 */
export function FontsKit({ compact = false, hideWhenDone = false }: { compact?: boolean; /** Rien du tout une fois téléchargées (fiche session). */ hideWhenDone?: boolean }) {
  const [help, setHelp] = useState(false);
  // null tant que le navigateur n'est pas lu (évite un clignotement).
  const [done, setDone] = useState<boolean | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        setDone(localStorage.getItem(KEY) === '1');
      } catch {
        setDone(false);
      }
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  const mark = (v: boolean) => {
    try {
      if (v) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch {}
    setDone(v);
    window.dispatchEvent(new Event(EVENT));
  };

  if (done === null) return null;
  if (done) {
    if (hideWhenDone) return null;
    return (
      <p className="fonts-kit-done">
        <CheckCircle2 size={14} aria-hidden /> Polices des supports téléchargées sur cet ordinateur ·{' '}
        <a href={ZIP} download="Polices-CF-Reseaux.zip">Télécharger à nouveau</a> ·{' '}
        <button type="button" className="linklike" onClick={() => mark(false)}>Afficher l’aide</button>
      </p>
    );
  }
  return (
    <div className={`fonts-kit${compact ? ' compact' : ''}`}>
      <div className="fonts-kit-main">
        <span className="fonts-kit-icon" aria-hidden><Type size={18} /></span>
        <span className="fonts-kit-text">
          <strong>Polices des supports de cours</strong>
          <small>
            À installer sur l’ordinateur : <span className="ff-sg">Space Grotesk</span>, <span className="ff-ar">Archivo</span> et{' '}
            <span className="ff-ax">Archivo Expanded</span>. Sans elles, les supports ne s’affichent pas correctement.
          </small>
        </span>
        <span className="fonts-kit-actions">
          <a
            className="btn small primary"
            href={ZIP}
            download="Polices-CF-Reseaux.zip"
            // Le bloc se replie juste après le téléchargement (le temps que celui-ci démarre).
            onClick={() => window.setTimeout(() => mark(true), 1500)}
          >
            <Download size={14} aria-hidden /> Télécharger les polices
          </a>
          <button type="button" className="small ghost" aria-expanded={help} onClick={() => setHelp((v) => !v)}>
            Comment installer <ChevronDown size={14} aria-hidden style={{ transform: help ? 'rotate(180deg)' : undefined }} />
          </button>
        </span>
      </div>
      {help && (
        <div className="fonts-kit-help">
          <div>
            <strong>Windows</strong>
            <ol>
              <li>Clic droit sur le fichier téléchargé › « Extraire tout… ».</li>
              <li>Dans chaque dossier, sélectionne tous les fichiers (Ctrl+A).</li>
              <li>Clic droit › « Installer pour tous les utilisateurs ».</li>
              <li>Ferme puis rouvre PowerPoint / Word / Canva.</li>
            </ol>
          </div>
          <div>
            <strong>Mac</strong>
            <ol>
              <li>Double-clique sur le fichier téléchargé pour l’extraire.</li>
              <li>Sélectionne tous les fichiers .ttf, double-clic › « Installer ».</li>
              <li>Ferme puis rouvre les applications.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
