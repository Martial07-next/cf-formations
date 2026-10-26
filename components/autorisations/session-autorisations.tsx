'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CircleDashed, QrCode, Download, Settings2, Ban, ExternalLink, Maximize2, X } from 'lucide-react';
import { ensureAutorToken, setSessionAuthKinds } from '@/app/autorisations/actions';
import type { AuthPdfItem } from '@/lib/pdf-autorisations';
import { missingDocs, type DocSignature, type SignableDoc } from '@/lib/documents';
import { AUTH_KINDS, AUTH_KIND, currentAuth, frDateTime, type AuthKind, type Authorization } from '@/lib/autorisations';
import { askConfirm } from '@/lib/confirm-dialog';

export type AutorRow = { id: string; name: string; auths: Authorization[]; docSigs?: DocSignature[] };

/** Téléchargement PDF d'autorisations signées (modèles CF Réseaux remplis). */
export function AuthPdfButton({
  items,
  fileName,
  cachet,
  label = 'PDF',
  className = 'small',
}: {
  items: AuthPdfItem[];
  fileName: string;
  cachet: string | null;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy || !items.length}
      onClick={async () => {
        setBusy(true);
        try {
          const [{ buildAuthorizationsPdf }, { downloadPdf }] = await Promise.all([import('@/lib/pdf-autorisations'), import('@/lib/pdf-dossier')]);
          downloadPdf(await buildAuthorizationsPdf(items, cachet), fileName);
        } catch (e) {
          alert(e instanceof Error ? e.message : 'PDF impossible à générer.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download size={14} aria-hidden /> {busy ? '…' : label}
    </button>
  );
}

/**
 * Autorisations de la session : un QR code unique ; sous le QR, la liste des
 * stagiaires avec ce qu'il leur reste à remplir (ceux qui ont déjà tout
 * signé sur une formation précédente n'ont rien à faire).
 */
export function SessionAutorisations({
  sessionId,
  kinds,
  overridden,
  canManage,
  canCollect,
  rows,
  cachet,
  customDocs = [],
  title = '',
}: {
  /** Intitulé de la session (affiché sur le QR code en grand). */
  title?: string;
  /** Documents ajoutés par l'administrateur (ex. règlement intérieur). */
  customDocs?: SignableDoc[];
  sessionId: string;
  kinds: AuthKind[];
  /** La session a ses propres autorisations (sinon celles de la formation). */
  overridden: boolean;
  canManage: boolean;
  canCollect: boolean;
  rows: AutorRow[];
  cachet: string | null;
}) {
  const [qr, setQr] = useState<{ url: string; image: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editKinds, setEditKinds] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // QR code en grand (vidéoprojecteur / écran de la salle).
  const [big, setBig] = useState<string | null>(null);
  const bigRef = useRef<HTMLDivElement>(null);
  const openBig = async () => {
    if (!qr) return;
    const QRCode = (await import('qrcode')).default;
    setBig(await QRCode.toDataURL(qr.url, { width: 1400, margin: 2, errorCorrectionLevel: 'M' }));
  };
  const closeBig = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setBig(null);
  };
  useEffect(() => {
    if (!big) return;
    bigRef.current?.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setBig(null);
    const onFs = () => !document.fullscreenElement && setBig(null);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [big]);
  // QR affiché : la liste se met à jour toute seule pendant que les stagiaires signent.
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [qr, router]);

  const status = rows.map((r) => ({
    ...r,
    missing: [
      ...kinds.filter((k) => !currentAuth(r.auths, k)).map((k) => AUTH_KIND[k].short),
      ...missingDocs(customDocs, r.docSigs || [], sessionId).map((d) => d.title),
    ],
    imageRefused: r.auths.some((a) => a.kind === 'image' && !a.accepted && currentAuth(r.auths, 'image')?.id === a.id),
  }));
  const todo = status.filter((s) => s.missing.length);
  const ok = status.filter((s) => !s.missing.length);
  const signedHere = rows.flatMap((r) => kinds.map((k) => currentAuth(r.auths, k)).filter(Boolean).map((a) => ({ auth: a!, traineeName: r.name })));

  const showQr = (renew = false) =>
    startTransition(async () => {
      const res = await ensureAutorToken(sessionId, renew);
      if (!res.ok) return setError(res.error);
      const url = `${window.location.origin}/autorisations/${res.token}`;
      const QRCode = (await import('qrcode')).default;
      setQr({ url, image: await QRCode.toDataURL(url, { width: 520, margin: 1, errorCorrectionLevel: 'M' }) });
      setError(null);
    });

  return (
    <section className="panel" id="autorisations">
      <div className="panel-head">
        <h2>Autorisations</h2>
        <span className="row-actions">
          {canManage && (
            <button type="button" className="small ghost" onClick={() => setEditKinds((v) => !v)} aria-expanded={editKinds}>
              <Settings2 size={14} aria-hidden /> Documents demandés
            </button>
          )}
          {canCollect && kinds.length + customDocs.length > 0 && rows.length > 0 && (
            <button type="button" className="small primary" onClick={() => (qr ? setQr(null) : showQr())} disabled={isPending}>
              <QrCode size={14} aria-hidden /> {qr ? 'Masquer le QR code' : 'QR code stagiaires'}
            </button>
          )}
        </span>
      </div>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      {editKinds && (
        <div className="autor-kinds">
          {AUTH_KINDS.map((k) => (
            <label key={k.kind} className="check-line">
              <input
                type="checkbox"
                checked={kinds.includes(k.kind)}
                disabled={isPending}
                onChange={(e) =>
                  startTransition(async () => {
                    const next = e.target.checked ? [...kinds, k.kind] : kinds.filter((x) => x !== k.kind);
                    const res = await setSessionAuthKinds(sessionId, next);
                    if (!res.ok) setError(res.error);
                  })
                }
              />
              {k.short}
            </label>
          ))}
          <span className="hint">{overridden ? 'Réglage propre à cette session.' : 'Par défaut : ceux cochés sur la formation.'}</span>
        </div>
      )}

      {!kinds.length && !customDocs.length ? (
        <p className="hint">Aucune autorisation demandée pour cette session.</p>
      ) : !rows.length ? (
        <p className="hint">Les autorisations apparaîtront dès qu’un stagiaire sera validé. Demandées : {kinds.map((k) => AUTH_KIND[k].short).join(' · ')}.</p>
      ) : (
        <div className={qr ? 'autor-grid with-qr' : 'autor-grid'}>
          {qr && (
            <div className="autor-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <button type="button" className="autor-qr-zoom" onClick={openBig} title="Afficher en grand">
                <img src={qr.image} alt="QR code des autorisations" />
              </button>
              <p className="hint">Les stagiaires scannent, choisissent leur nom et signent seulement ce qui manque.</p>
              <span className="row-actions">
                <button type="button" className="small primary" onClick={openBig}><Maximize2 size={14} aria-hidden /> Afficher en grand</button>
                <a className="btn small" href={qr.url} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden /> Remplir sur cette tablette</a>
                {canManage && (
                  <button type="button" className="small ghost" onClick={async () => (await askConfirm('Nouveau QR code ? L’ancien ne fonctionnera plus.')) && showQr(true)}>Nouveau QR</button>
                )}
              </span>
            </div>
          )}
          <div className="autor-list">
            <p className="autor-summary">
              <strong>{ok.length}/{rows.length}</strong> stagiaire{rows.length > 1 ? 's' : ''} à jour · {[...kinds.map((k) => AUTH_KIND[k].short), ...customDocs.map((d) => d.title)].join(' · ')}
            </p>
            <ul>
              {todo.map((s) => (
                <li key={s.id} className="todo">
                  <CircleDashed size={15} aria-hidden />
                  <span className="autor-name">{s.name}</span>
                  <span className="hint">à remplir : {s.missing.join(', ')}</span>
                  {s.imageRefused && <span className="autor-refus"><Ban size={12} aria-hidden /> pas de photo</span>}
                </li>
              ))}
              {ok.map((s) => (
                <li key={s.id}>
                  <CheckCircle2 size={15} aria-hidden />
                  <span className="autor-name">{s.name}</span>
                  <span className="hint">
                    pas besoin de remplir
                    {(() => {
                      const first = kinds.map((k) => currentAuth(s.auths, k)!).sort((a, b) => b.signed_at.localeCompare(a.signed_at))[0];
                      return first ? ` (signé le ${frDateTime(first.signed_at)})` : '';
                    })()}
                  </span>
                  {s.imageRefused && <span className="autor-refus"><Ban size={12} aria-hidden /> pas de photo</span>}
                </li>
              ))}
            </ul>
            {canManage && signedHere.length > 0 && (
              <AuthPdfButton items={signedHere} cachet={cachet} fileName="Autorisations de la session.pdf" label="Toutes les autorisations (PDF)" className="small" />
            )}
          </div>
        </div>
      )}
      {big && (
        <div ref={bigRef} className="qr-big" role="dialog" aria-modal="true" aria-label="QR code des autorisations en grand">
          <button type="button" className="qr-big-close" onClick={closeBig} aria-label="Fermer"><X size={22} /> Fermer</button>
          <div className="qr-big-main">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-cf-reseaux.svg" alt="CF Réseaux" className="qr-big-logo" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={big} alt="QR code des autorisations" className="qr-big-code" />
          </div>
          <aside className="qr-big-side">
            <p className="qr-big-kicker">Autorisations</p>
            {title && <h2>{title}</h2>}
            <ol className="qr-big-steps">
              <li>Scannez le QR code avec votre téléphone</li>
              <li>Choisissez votre nom</li>
              <li>Signez une seule fois</li>
            </ol>
            <p className="qr-big-count"><strong>{ok.length}/{rows.length}</strong> à jour</p>
            {todo.length > 0 && (
              <>
                <p className="qr-big-kicker">Reste à signer</p>
                <ul className="qr-big-todo">{todo.map((t) => <li key={t.id}>{t.name}</li>)}</ul>
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
