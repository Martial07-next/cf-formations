'use client';

import { useState } from 'react';
import { ChevronDown, Download, Type } from 'lucide-react';

const ZIP = '/polices/Polices-CF-Reseaux.zip';

/**
 * Polices obligatoires des supports de cours (Space Grotesk, Archivo,
 * Archivo Expanded) : téléchargement du pack et marche à suivre pour les
 * installer sur l'ordinateur (Windows / Mac).
 */
export function FontsKit({ compact = false }: { compact?: boolean }) {
  const [help, setHelp] = useState(false);
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
          <a className="btn small primary" href={ZIP} download="Polices-CF-Reseaux.zip">
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
