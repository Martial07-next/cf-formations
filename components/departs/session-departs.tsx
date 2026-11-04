'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, LogOut, QrCode, Trash2 } from 'lucide-react';
import { ensureAutorToken } from '@/app/autorisations/actions';
import { deleteDeparture } from '@/app/depart/actions';
import { askConfirm } from '@/lib/confirm-dialog';
import { departWhen, reasonText, type EarlyDeparture } from '@/lib/departs';
import type { DepartPdfInput } from '@/lib/pdf-fin-formation';

export type DepartDoc = Omit<DepartPdfInput, 'items'>;

/**
 * Départs anticipés de la session : QR code à montrer au stagiaire qui part,
 * attestations reçues (date, heure, raison) et leur PDF.
 */
export function SessionDeparts({
  sessionId,
  departures,
  trainees,
  canCollect,
  canManage,
  doc,
}: {
  sessionId: string;
  departures: EarlyDeparture[];
  trainees: { id: string; name: string; company: string | null }[];
  canCollect: boolean;
  canManage: boolean;
  /** Données du PDF (bureau / admin) ; null = pas de PDF pour ce compte. */
  doc: DepartDoc | null;
}) {
  const [qr, setQr] = useState<{ url: string; image: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const person = (id: string) => trainees.find((t) => t.id === id);
  const list = [...departures].sort((a, b) => b.departed_at.localeCompare(a.departed_at));

  // QR affiché : la liste se met à jour dès que le stagiaire a envoyé.
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [qr, router]);

  const showQr = () =>
    startTransition(async () => {
      const res = await ensureAutorToken(sessionId);
      if (!res.ok) return setError(res.error);
      const url = `${window.location.origin}/depart/${res.token}`;
      const QRCode = (await import('qrcode')).default;
      setQr({ url, image: await QRCode.toDataURL(url, { width: 520, margin: 1, errorCorrectionLevel: 'M' }) });
      setError(null);
    });

  async function pdf(items: EarlyDeparture[], key: string) {
    if (!doc || !items.length) return;
    setBusy(key);
    setError(null);
    try {
      const { buildDepartPdf } = await import('@/lib/pdf-fin-formation');
      const { downloadPdf } = await import('@/lib/pdf-dossier');
      const bytes = await buildDepartPdf({
        ...doc,
        formationTitle: items[0].formation_title || doc.formationTitle,
        items: items.map((d) => ({
          name: person(d.trainee_id)?.name || 'Stagiaire',
          company: person(d.trainee_id)?.company || null,
          departedAt: d.departed_at,
          reason: reasonText(d),
          city: d.city,
          signature: d.signature,
        })),
      });
      downloadPdf(bytes, items.length === 1 ? `Départ anticipé - ${person(items[0].trainee_id)?.name || 'stagiaire'}.pdf` : `Départs anticipés - ${doc.sessionTitle}.pdf`);
    } catch (e: any) {
      setError(e?.message || 'PDF impossible.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel" id="departs">
      <div className="panel-head">
        <h2><LogOut size={17} aria-hidden /> Départs anticipés</h2>
        <span className="row-actions">
          {doc && list.length > 1 && (
            <button type="button" className="small" onClick={() => pdf(list, 'all')} disabled={!!busy}>
              {busy === 'all' ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} Toutes les attestations
            </button>
          )}
          {canCollect && trainees.length > 0 && (
            <button type="button" className="small primary" onClick={() => (qr ? setQr(null) : showQr())} disabled={isPending}>
              <QrCode size={14} aria-hidden /> {qr ? 'Masquer le QR code' : 'QR code départ anticipé'}
            </button>
          )}
        </span>
      </div>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <p className="hint" style={{ marginTop: 0 }}>
        Un stagiaire doit partir plus tôt ? Il scanne le QR code, choisit son nom et la raison, puis signe la décharge de responsabilité : la date, l’heure et la formation sont enregistrées automatiquement.
      </p>

      {qr && (
        <div className="autor-qr">
          <img src={qr.image} alt="QR code du départ anticipé" width={220} height={220} />
          <div>
            <strong>À scanner par le stagiaire qui part</strong>
            <p className="hint">La liste ci-dessous se met à jour toute seule.</p>
            <code className="autor-url">{qr.url}</code>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="empty" style={{ margin: 0 }}>Aucun départ anticipé sur cette session.</p>
      ) : (
        <ul className="depart-list">
          {list.map((d) => {
            const w = departWhen(d.departed_at);
            return (
              <li key={d.id}>
                <span className="depart-main">
                  <strong>{person(d.trainee_id)?.name || 'Stagiaire'}</strong>
                  <small>Le {w.date} à <strong>{w.time}</strong> · {reasonText(d)}</small>
                </span>
                <span className="row-actions">
                  {doc && (
                    <button type="button" className="small" onClick={() => pdf([d], d.id)} disabled={!!busy}>
                      {busy === d.id ? <Loader2 size={13} className="spin" aria-hidden /> : <Download size={13} aria-hidden />} Attestation
                    </button>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      className="small icon ghost danger"
                      aria-label={`Supprimer le départ de ${person(d.trainee_id)?.name || 'ce stagiaire'}`}
                      disabled={isPending}
                      onClick={async () => {
                        if (!(await askConfirm('Supprimer cette attestation de départ anticipé ?', { danger: true }))) return;
                        startTransition(async () => {
                          const r = await deleteDeparture(d.id);
                          if (!r.ok) setError(r.error);
                          else router.refresh();
                        });
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
