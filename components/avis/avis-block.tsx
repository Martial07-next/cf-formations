'use client';

import { useState } from 'react';
import { FileText, MonitorPlay, QrCode, Star } from 'lucide-react';
import type { AvisData } from '@/lib/avis';
import { AvisPresentation } from '@/components/avis/avis-presentation';

/**
 * Dossier de chaque session, au-dessus du tour de table : les QR codes d'avis
 * (Google à chaud, Plus que pro à froid) et la présentation à montrer aux
 * stagiaires au début de la session.
 */
export function AvisBlock({ avis }: { avis: AvisData }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="doc-list avis-block" style={{ marginBottom: 6 }}>
      <div className="doc-item">
        <Star size={16} aria-hidden />
        <span className="doc-item-main">
          <strong>Avis clients · « Votre avis compte ! »</strong>
          <small className="hint">
            À présenter au début de chaque session : <b>Plus que pro</b> en priorité (avis certifié sur la formation et son contenu, 2 semaines après), et <b>Google</b> (avis général, à chaud)
            {avis.pqp.note != null ? ` · ${String(avis.pqp.note).replace('.', ',')}/5 sur ${avis.pqp.count ?? '…'} avis Plus que pro` : ''}.
          </small>
        </span>
        <span className="avis-thumbs" aria-hidden>
          <img src="/avis/qr-plusquepro.jpg" alt="" />
          <img src="/avis/qr-google.jpg" alt="" />
        </span>
        <span className="row-actions">
          <button type="button" className="small primary" onClick={() => setOpen(true)}>
            <MonitorPlay size={14} aria-hidden /> Présenter aux stagiaires
          </button>
          <a className="btn small" href="/avis/qr-plusquepro.jpg" target="_blank" rel="noreferrer" title="Affiche QR code Plus que pro (à imprimer ou afficher)"><QrCode size={13} aria-hidden /> Plus que pro</a>
          <a className="btn small" href="/avis/qr-google.jpg" target="_blank" rel="noreferrer" title="Affiche QR code Google (à imprimer ou afficher)"><QrCode size={13} aria-hidden /> Google</a>
          <a className="btn small ghost" href="/avis/attestation-plusquepro.pdf" target="_blank" rel="noreferrer" title="Attestation Plus que pro (note et derniers avis)"><FileText size={13} aria-hidden /> Attestation</a>
        </span>
      </div>
      {open && <AvisPresentation avis={avis} onClose={() => setOpen(false)} />}
    </div>
  );
}
