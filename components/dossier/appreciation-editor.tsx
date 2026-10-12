'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Download, Loader2, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { saveAppreciation } from '@/app/dossier/actions';
import { AutoText } from '@/components/dossier/tour-de-table';
import { appreciationDone, type AppreciationData, type AppreciationEntry, type Avis } from '@/lib/appreciation';
import type { Legal } from '@/lib/pdf-brand';

export type AppreciationSession = {
  sessionId: string;
  title: string;
  codification: string;
  startDate: string;
  endDate: string;
  lieu: string | null;
  trainerName: string | null;
  legal?: Legal | null;
  trainees: { id: string; name: string; company: string | null }[];
};

const frDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/**
 * Fiches d'appréciation individuelle : une par stagiaire. Tout est pré-rempli
 * (participant, entreprise, codification, dates, lieu, formateur) ; le
 * formateur donne l'avis et complète les zones de texte s'il y a lieu.
 */
export function AppreciationEditor({
  session,
  initialData,
  canEdit,
  onClose,
  onSaved,
}: {
  session: AppreciationSession;
  initialData: AppreciationData | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved?: (data: AppreciationData, completed: boolean) => void;
}) {
  const [data, setData] = useState<AppreciationData>(initialData || {});
  const [current, setCurrent] = useState(session.trainees[0]?.id || '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const firstRun = useRef(true);
  const ids = session.trainees.map((t) => t.id);
  const done = useMemo(() => session.trainees.filter((t) => data.trainees?.[t.id]?.avis).length, [data, session.trainees]);
  const allDone = appreciationDone(data, ids);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!canEdit) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      const res = await saveAppreciation(session.sessionId, data, allDone);
      if (res.ok) {
        setSaveState('saved');
        setSavedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
        onSaved?.(data, allDone);
      } else {
        setSaveState('error');
        setError(res.error);
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const index = session.trainees.findIndex((t) => t.id === current);
  const trainee = session.trainees[index];
  const entry: AppreciationEntry = data.trainees?.[current] || {};
  const set = (patch: Partial<AppreciationEntry>) =>
    setData((d) => ({ ...d, trainees: { ...(d.trainees || {}), [current]: { ...(d.trainees?.[current] || {}), ...patch } } }));

  async function download(only?: string) {
    setBusy(only || 'all');
    setError(null);
    try {
      const { buildAppreciationPdf } = await import('@/lib/pdf-appreciation');
      const { downloadPdf } = await import('@/lib/pdf-dossier');
      const list = only ? session.trainees.filter((t) => t.id === only) : session.trainees;
      const bytes = await buildAppreciationPdf({ ...session, trainees: list, entries: data.trainees || {} });
      const who = only ? ` - ${list[0]?.name}` : '';
      downloadPdf(bytes, `Fiche appréciation${who} - ${session.title}.pdf`);
    } catch (e: any) {
      setError(e?.message || 'PDF impossible.');
    } finally {
      setBusy(null);
    }
  }

  const status = (id: string) => data.trainees?.[id]?.avis;

  return (
    <div className="pf fai">
      <div className="pf-bar">
        <div className="pf-title">
          <strong>Fiches d’appréciation individuelle · {session.title}</strong>
          <span className="hint">
            {saveState === 'saving' ? (
              <><Loader2 size={12} className="spin" aria-hidden /> Enregistrement…</>
            ) : saveState === 'saved' ? (
              <>Enregistré automatiquement à {savedAt}</>
            ) : saveState === 'error' ? (
              'Non enregistré'
            ) : canEdit ? (
              'Chaque saisie est enregistrée automatiquement'
            ) : (
              'Lecture seule'
            )}
            {' · '}
            {allDone ? <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Toutes les fiches sont remplies</span> : `${done}/${session.trainees.length} avis donnés`}
          </span>
        </div>
        <div className="row-actions">
          <button type="button" className={`small${allDone ? ' primary' : ''}`} onClick={() => download()} disabled={!!busy || !session.trainees.length}>
            {busy === 'all' ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} Toutes les fiches (PDF)
          </button>
          <button type="button" className="icon ghost" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ margin: '8px 16px' }}>{error}</div>}

      {session.trainees.length === 0 ? (
        <p className="empty" style={{ padding: 24 }}>Aucun stagiaire validé : ajoute-les d’abord, une fiche sera prête pour chacun.</p>
      ) : (
        <div className="fai-body">
          <nav className="fai-list" aria-label="Stagiaires">
            <select className="input fai-select" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="Stagiaire">
              {session.trainees.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {session.trainees.map((t) => (
              <button key={t.id} type="button" className={`fai-item${t.id === current ? ' active' : ''}`} onClick={() => setCurrent(t.id)} aria-current={t.id === current}>
                <span>
                  <strong>{t.name}</strong>
                  {t.company && <small>{t.company}</small>}
                </span>
                {status(t.id) === 'favorable' ? (
                  <span className="fai-pill ok">Favorable</span>
                ) : status(t.id) === 'defavorable' ? (
                  <span className="fai-pill ko">Défavorable</span>
                ) : (
                  <span className="fai-pill todo">À remplir</span>
                )}
              </button>
            ))}
          </nav>

          <section className="fai-sheet" aria-label={`Fiche de ${trainee?.name}`}>
            <div className="fai-info">
              <div><span>Participant</span><strong>{trainee?.name}</strong></div>
              <div><span>Entreprise</span><strong>{trainee?.company || '-'}</strong></div>
              <div><span>Codification SERECT</span><strong>{session.codification}</strong></div>
              <div><span>Dates du stage</span><strong>du {frDate(session.startDate)} au {frDate(session.endDate)}</strong></div>
              <div><span>Lieu de dispense</span><strong>{session.lieu || 'CF RÉSEAUX'}</strong></div>
              <div><span>Formateur</span><strong>{session.trainerName || '-'}</strong></div>
            </div>

            <h3 className="fai-h">Avis du formateur <small>(à reporter sur les attestations)</small></h3>
            <div className="fai-avis" role="radiogroup" aria-label="Avis du formateur">
              {(['favorable', 'defavorable'] as Avis[]).map((a) => (
                <label key={a} className={`fai-choice ${a}${entry.avis === a ? ' checked' : ''}`}>
                  <input type="radio" name={`avis-${current}`} checked={entry.avis === a} disabled={!canEdit} onChange={() => set({ avis: a })} />
                  {a === 'favorable' ? <ThumbsUp size={20} aria-hidden /> : <ThumbsDown size={20} aria-hidden />}
                  <span>
                    <strong>{a === 'favorable' ? 'Avis favorable' : 'Avis défavorable'}</strong>
                    <small>
                      {a === 'favorable'
                        ? 'Exercices réalisés de façon satisfaisante, objectifs atteints. Pas de réserve quant à la délivrance (ou maintien) d’une habilitation.'
                        : 'Réserves, car les exercices n’ont pas été réalisés de façon satisfaisante.'}
                    </small>
                  </span>
                </label>
              ))}
            </div>

            <label className={`fai-field${entry.avis === 'defavorable' ? ' highlight' : ''}`}>
              <span>
                Écarts constatés
                <small> Attention : se limiter aux constats faits pendant la formation, ne pas proposer de restriction d’habilitation.</small>
              </span>
              <AutoText label="Écarts constatés" placeholder="RAS" minRows={2} readOnly={!canEdit} value={entry.ecarts || ''} onChange={(v) => set({ ecarts: v })} />
            </label>
            <label className="fai-field">
              <span>Autres informations <small>(à reporter sur les attestations)</small></span>
              <AutoText label="Autres informations à reporter" placeholder="RAS" minRows={3} readOnly={!canEdit} value={entry.autres_attestation || ''} onChange={(v) => set({ autres_attestation: v })} />
            </label>
            <label className="fai-field">
              <span>Autres informations <small>(internes, non destinées au client)</small></span>
              <AutoText label="Autres informations internes" placeholder="RAS" minRows={3} readOnly={!canEdit} value={entry.autres_internes || ''} onChange={(v) => set({ autres_internes: v })} />
            </label>

            <div className="fai-nav">
              <button type="button" className="small" disabled={index <= 0} onClick={() => setCurrent(session.trainees[index - 1].id)}>
                <ArrowLeft size={14} aria-hidden /> Précédent
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="small ghost"
                  title="Écrit « RAS » dans les zones vides de cette fiche"
                  onClick={() => set({ ecarts: entry.ecarts || 'RAS', autres_attestation: entry.autres_attestation || 'RAS', autres_internes: entry.autres_internes || 'RAS' })}
                >
                  RAS dans les cases vides
                </button>
              )}
              <button type="button" className="small" onClick={() => download(current)} disabled={!!busy}>
                {busy === current ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} PDF de cette fiche
              </button>
              <span style={{ flex: 1 }} />
              <button type="button" className="small primary" disabled={index >= session.trainees.length - 1} onClick={() => setCurrent(session.trainees[index + 1].id)}>
                Stagiaire suivant <ArrowRight size={14} aria-hidden />
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
