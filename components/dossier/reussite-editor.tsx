'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Download, Loader2, PenLine, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { saveReussite } from '@/app/dossier/actions';
import { AutoText } from '@/components/dossier/tour-de-table';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { reussiteDone, type ReussiteAvis, type ReussiteData, type ReussiteEntry, type ReussiteModel } from '@/lib/reussite';
import type { Legal } from '@/lib/pdf-brand';

export type ReussiteSession = {
  sessionId: string;
  title: string;
  model: ReussiteModel;
  startDate: string;
  endDate: string;
  duration: string;
  lieu: string | null;
  trainerName: string | null;
  legal?: Legal | null;
  trainees: { id: string; name: string; company: string | null }[];
};

const frDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/**
 * Attestations de réussite : une par stagiaire, pré-remplie (stagiaire,
 * société, formation, dates, durée, lieu, formateur). Le formateur donne
 * l'avis, la note et ses observations, puis signe une fois pour toutes.
 */
export function ReussiteEditor({
  session,
  initialData,
  canEdit,
  onClose,
  onSaved,
}: {
  session: ReussiteSession;
  initialData: ReussiteData | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved?: (data: ReussiteData, completed: boolean) => void;
}) {
  const [data, setData] = useState<ReussiteData>(initialData || {});
  const [current, setCurrent] = useState(session.trainees[0]?.id || '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [signing, setSigning] = useState(!initialData?.signature);
  const [padEmpty, setPadEmpty] = useState(true);
  const pad = useRef<SignaturePadHandle>(null);
  const firstRun = useRef(true);
  const ids = session.trainees.map((t) => t.id);
  const done = useMemo(() => session.trainees.filter((t) => data.trainees?.[t.id]?.avis).length, [data, session.trainees]);
  const allDone = reussiteDone(data, ids);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!canEdit) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      const res = await saveReussite(session.sessionId, data, allDone);
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
  const entry: ReussiteEntry = data.trainees?.[current] || {};
  const set = (patch: Partial<ReussiteEntry>) =>
    setData((d) => ({ ...d, trainees: { ...(d.trainees || {}), [current]: { ...(d.trainees?.[current] || {}), ...patch } } }));

  function sign() {
    const url = pad.current?.toDataURL();
    if (!url) return;
    setData((d) => ({ ...d, signature: url, signedBy: session.trainerName }));
    setSigning(false);
  }

  async function download(only?: string) {
    setBusy(only || 'all');
    setError(null);
    try {
      const { buildReussitePdf } = await import('@/lib/pdf-reussite');
      const { downloadPdf } = await import('@/lib/pdf-dossier');
      const list = only ? session.trainees.filter((t) => t.id === only) : session.trainees;
      const bytes = await buildReussitePdf({ ...session, trainees: list, entries: data.trainees || {}, signature: data.signature });
      const who = only ? ` - ${list[0]?.name}` : '';
      downloadPdf(bytes, `Attestation de réussite${who} - ${session.model.label}.pdf`);
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
          <strong>Attestations de réussite · {session.model.label}</strong>
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
            {allDone ? (
              <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Toutes les attestations sont remplies et signées</span>
            ) : (
              `${done}/${session.trainees.length} avis donnés${data.signature ? '' : ' · signature à faire'}`
            )}
          </span>
        </div>
        <div className="row-actions">
          <button type="button" className={`small${allDone ? ' primary' : ''}`} onClick={() => download()} disabled={!!busy || !session.trainees.length}>
            {busy === 'all' ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} Toutes les attestations (PDF)
          </button>
          <button type="button" className="icon ghost" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ margin: '8px 16px' }}>{error}</div>}

      {session.trainees.length === 0 ? (
        <p className="empty" style={{ padding: 24 }}>Aucun stagiaire validé : ajoute-les d’abord, une attestation sera prête pour chacun.</p>
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

          <section className="fai-sheet" aria-label={`Attestation de ${trainee?.name}`}>
            <div className="fai-info">
              <div><span>Stagiaire</span><strong>{trainee?.name}</strong></div>
              <div><span>Société</span><strong>{trainee?.company || '-'}</strong></div>
              <div><span>Formation</span><strong>{session.model.label}</strong></div>
              <div>
                <span>Dates</span>
                <strong>{session.startDate === session.endDate ? `le ${frDate(session.startDate)}` : `du ${frDate(session.startDate)} au ${frDate(session.endDate)}`}</strong>
              </div>
              <div><span>Durée</span><strong>{session.duration}</strong></div>
              <div><span>Formateur</span><strong>{session.trainerName || '-'}</strong></div>
            </div>

            <h3 className="fai-h">Avis après formation</h3>
            <div className="fai-avis" role="radiogroup" aria-label="Avis après formation">
              {(['favorable', 'defavorable'] as ReussiteAvis[]).map((a) => (
                <label key={a} className={`fai-choice ${a}${entry.avis === a ? ' checked' : ''}`}>
                  <input type="radio" name={`avis-${current}`} checked={entry.avis === a} disabled={!canEdit} onChange={() => set({ avis: a })} />
                  {a === 'favorable' ? <ThumbsUp size={20} aria-hidden /> : <ThumbsDown size={20} aria-hidden />}
                  <span>
                    <strong>{a === 'favorable' ? 'Favorable' : 'Défavorable'}</strong>
                    <small>{a === 'favorable' ? 'Objectifs de la formation atteints.' : 'Objectifs de la formation non atteints.'}</small>
                  </span>
                </label>
              ))}
            </div>

            <label className="fai-field">
              <span>Note obtenue <small>(ex. 17/20)</small></span>
              <input className="input" style={{ maxWidth: 160 }} value={entry.note || ''} readOnly={!canEdit} maxLength={20} placeholder="/20" onChange={(e) => set({ note: e.target.value })} />
            </label>
            <label className="fai-field">
              <span>Observations</span>
              <AutoText label="Observations" placeholder="RAS" minRows={3} readOnly={!canEdit} value={entry.observations || ''} onChange={(v) => set({ observations: v })} />
            </label>

            <div className="fai-nav">
              <button type="button" className="small" disabled={index <= 0} onClick={() => setCurrent(session.trainees[index - 1].id)}>
                <ArrowLeft size={14} aria-hidden /> Précédent
              </button>
              <button type="button" className="small" onClick={() => download(current)} disabled={!!busy}>
                {busy === current ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} PDF de cette attestation
              </button>
              <span style={{ flex: 1 }} />
              <button type="button" className="small primary" disabled={index >= session.trainees.length - 1} onClick={() => setCurrent(session.trainees[index + 1].id)}>
                Stagiaire suivant <ArrowRight size={14} aria-hidden />
              </button>
            </div>

            <h3 className="fai-h" style={{ marginTop: 22 }}>
              Signature du formateur <small>(apposée sur toutes les attestations)</small>
            </h3>
            {data.signature && !signing ? (
              <div className="reussite-sign">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.signature} alt="Signature du formateur" />
                {canEdit && (
                  <button type="button" className="small ghost" onClick={() => setSigning(true)}>
                    <PenLine size={14} aria-hidden /> Signer à nouveau
                  </button>
                )}
              </div>
            ) : canEdit ? (
              <div className="reussite-pad">
                <SignaturePad ref={pad} height={150} onChange={setPadEmpty} />
                <div className="fai-nav">
                  {data.signature && (
                    <button type="button" className="small ghost" onClick={() => setSigning(false)}>Annuler</button>
                  )}
                  <button type="button" className="small primary" disabled={padEmpty} onClick={sign}>
                    <PenLine size={14} aria-hidden /> Valider la signature
                  </button>
                </div>
              </div>
            ) : (
              <p className="hint">Pas encore signée.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
