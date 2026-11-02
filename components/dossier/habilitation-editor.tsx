'use client';

import { useState } from 'react';
import { CheckCircle2, Download, Loader2, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { saveHabilitation } from '@/app/dossier/actions';
import { LivePeers, useLiveForm } from '@/components/dossier/use-live-form';
import { certificateTitle, habDone, symbolsOf, type HabData, type HabEntry } from '@/lib/habilitation';
import type { HabCertInput } from '@/lib/pdf-habilitation';

export type HabSession = Omit<HabCertInput, 'trainees' | 'entries'> & {
  trainees: { id: string; name: string; company: string | null }[];
  /** Nom sur le certificat (« Prénom NOM »). */
  certNames?: Record<string, string>;
};

/**
 * Certificats d'habilitation électrique : pour chaque stagiaire, le formateur
 * donne son avis et coche les symboles qu'il lui attribue (tous par défaut).
 * Enregistré en direct, à plusieurs ; PDF au modèle de CF Réseaux.
 */
export function HabilitationEditor({
  session,
  initialData,
  canEdit,
  blocked = [],
  me = null,
  onClose,
  onSaved,
}: {
  session: HabSession;
  initialData: HabData | null;
  canEdit: boolean;
  /** Titre d'habilitation manquant : certificat non remis. */
  blocked?: string[];
  me?: { id: string; name: string } | null;
  onClose: () => void;
  onSaved?: (data: HabData, completed: boolean) => void;
}) {
  const [data, setData] = useState<HabData>(initialData || {});
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setError] = useState<string | null>(null);
  const ids = session.trainees.map((t) => t.id);
  const live = useLiveForm<HabData>({
    sessionId: session.sessionId,
    kind: 'habilitation',
    data,
    setData,
    canEdit,
    me,
    completedOf: (d) => habDone(d, ids),
    legacySave: (d, comp) => saveHabilitation(session.sessionId, d, Boolean(comp)),
    onSynced: (d) => onSaved?.(d, habDone(d, ids)),
  });
  const error = localError || live.error;
  const done = session.trainees.filter((t) => data.trainees?.[t.id]?.avis).length;
  const set = (id: string, patch: Partial<HabEntry>) =>
    setData((d) => ({ ...d, trainees: { ...(d.trainees || {}), [id]: { ...(d.trainees?.[id] || {}), ...patch } } }));
  const toggleSymbol = (id: string, s: string) => {
    const cur = symbolsOf(data.trainees?.[id], session.symbols);
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : session.symbols.filter((x) => x === s || cur.includes(x));
    set(id, { symbols: next });
  };

  async function download(only?: string) {
    setBusy(only || 'all');
    setError(null);
    try {
      const list = session.trainees.filter((t) => (only ? t.id === only : data.trainees?.[t.id]?.avis) && !blocked.includes(t.id));
      if (!list.length) throw new Error(only ? 'Titre d’habilitation manquant : certificat bloqué.' : 'Aucun certificat prêt (avis à donner).');
      const { buildHabilitationPdf } = await import('@/lib/pdf-habilitation');
      const { downloadPdf } = await import('@/lib/pdf-dossier');
      const bytes = await buildHabilitationPdf({ ...session, trainees: list.map((t) => ({ id: t.id, name: session.certNames?.[t.id] || t.name })), entries: data.trainees || {} });
      downloadPdf(bytes, only ? `Certificat habilitation - ${list[0].name}.pdf` : `Certificats habilitation - ${session.title}.pdf`);
    } catch (e: any) {
      setError(e?.message || 'PDF impossible.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pf fai">
      <div className="pf-bar">
        <div className="pf-title">
          <strong>Certificats d’habilitation · {session.title}</strong>
          <span className="hint">
            {live.status === 'saving' ? (
              <><Loader2 size={12} className="spin" aria-hidden /> Enregistrement…</>
            ) : live.status === 'saved' ? (
              <>Enregistré automatiquement à {live.savedAt}</>
            ) : canEdit ? (
              'Chaque saisie est enregistrée automatiquement'
            ) : (
              'Lecture seule'
            )}
            {' · '}
            {done === session.trainees.length && done > 0 ? (
              <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Tous les avis sont donnés</span>
            ) : (
              `${done}/${session.trainees.length} avis donnés`
            )}
          </span>
        </div>
        <div className="row-actions">
          <LivePeers peers={live.peers} live={live.live} />
          {canEdit && (
            <button
              type="button"
              className="small"
              onClick={() => setData((d) => ({ ...d, trainees: Object.fromEntries(session.trainees.map((t) => [t.id, { ...(d.trainees?.[t.id] || {}), avis: d.trainees?.[t.id]?.avis || 'favorable' }])) }))}
            >
              <ThumbsUp size={14} aria-hidden /> Tous favorables
            </button>
          )}
          <button type="button" className={`small${done ? ' primary' : ''}`} onClick={() => download()} disabled={!!busy || !done}>
            {busy === 'all' ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} Tous les certificats
          </button>
          <button type="button" className="icon ghost" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ margin: '8px 16px' }}>{error}</div>}

      <div className="tdt-body">
        <p className="hint" style={{ marginTop: 0 }}>
          Symboles possibles : <strong>{session.symbols.join(' ')}</strong>. Décoche ceux que le stagiaire n’obtient pas : la ligne de la formation du certificat ne garde que les symboles attribués.
        </p>
        {session.trainees.length === 0 && <p className="empty">Aucun stagiaire validé sur cette session.</p>}
        <div className="hab-list">
          {session.trainees.map((t) => {
            const e = data.trainees?.[t.id] || {};
            const syms = symbolsOf(e, session.symbols);
            const isBlocked = blocked.includes(t.id);
            return (
              <div key={t.id} className={`hab-row${e.avis ? ` ${e.avis}` : ''}`}>
                <div className="hab-who">
                  <strong>{t.name}</strong>
                  <small className="hint">{t.company || 'Sans entreprise'}</small>
                </div>
                <div className="hab-avis" role="radiogroup" aria-label={`Avis pour ${t.name}`}>
                  <button type="button" role="radio" aria-checked={e.avis === 'favorable'} className={e.avis === 'favorable' ? 'on ok' : ''} disabled={!canEdit} onClick={() => set(t.id, { avis: 'favorable' })}>
                    <ThumbsUp size={13} aria-hidden /> Favorable
                  </button>
                  <button type="button" role="radio" aria-checked={e.avis === 'defavorable'} className={e.avis === 'defavorable' ? 'on ko' : ''} disabled={!canEdit} onClick={() => set(t.id, { avis: 'defavorable' })}>
                    <ThumbsDown size={13} aria-hidden /> Défavorable
                  </button>
                </div>
                <div className="hab-chips" role="group" aria-label={`Symboles attribués à ${t.name}`}>
                  {session.symbols.map((s) => (
                    <button key={s} type="button" className={`hab-chip${syms.includes(s) ? ' on' : ''}`} aria-pressed={syms.includes(s)} disabled={!canEdit} onClick={() => toggleSymbol(t.id, s)}>
                      {s}
                    </button>
                  ))}
                </div>
                <small className="hab-line">{certificateTitle(session.title, syms)}</small>
                <button
                  type="button"
                  className="small"
                  disabled={!!busy || !e.avis || isBlocked}
                  title={isBlocked ? 'Titre d’habilitation manquant (tour de table)' : !e.avis ? 'Donne d’abord ton avis' : undefined}
                  onClick={() => download(t.id)}
                >
                  {busy === t.id ? <Loader2 size={13} className="spin" aria-hidden /> : <Download size={13} aria-hidden />} {isBlocked ? 'Titre manquant' : 'Certificat'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
