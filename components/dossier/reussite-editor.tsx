'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Download, Loader2, PenLine, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { saveReussite } from '@/app/dossier/actions';
import { AutoText } from '@/components/dossier/tour-de-table';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { reussiteCount, reussiteDone, reussiteEntries, type ReussiteAvis, type ReussiteData, type ReussiteEntry, type ReussiteModel } from '@/lib/reussite';
import type { Legal } from '@/lib/pdf-brand';

type Trainee = { id: string; name: string; company: string | null };

/** Une série d'attestations : un modèle (IRVE P1…), ses dates et les stagiaires qui le suivent. */
export type ReussiteSeries = { model: ReussiteModel; startDate: string; endDate: string; duration: string; trainees: Trainee[] };

export type ReussiteSession = {
  sessionId: string;
  title: string;
  series: ReussiteSeries[];
  lieu: string | null;
  trainerName: string | null;
  legal?: Legal | null;
};

/** Saisies au nouveau format (par modèle), l'ancien format rattaché au premier modèle. */
function normalize(data: ReussiteData | null, series: ReussiteSeries[]): ReussiteData {
  const d = data || {};
  if (!d.trainees || !series.length) return d;
  const first = series[0].model.key;
  const { trainees, ...rest } = d;
  return { ...rest, models: { ...(d.models || {}), [first]: { ...trainees, ...(d.models?.[first] || {}) } } };
}

/** Données d'impression de toutes les séries (ou d'une seule attestation). */
export function reussiteInputs(session: ReussiteSession, data: ReussiteData | null, only?: { key: string; traineeId: string }) {
  return session.series
    .map((s, i) => ({
      ...s,
      trainees: only ? s.trainees.filter((t) => s.model.key === only.key && t.id === only.traineeId) : s.trainees,
      entries: reussiteEntries(data, s.model.key, i === 0),
      lieu: session.lieu,
      trainerName: session.trainerName,
      legal: session.legal,
      signature: data?.signature,
    }))
    .filter((s) => s.trainees.length);
}

const frDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/**
 * Attestations de réussite : une par stagiaire et par modèle (IRVE P1, P2,
 * P3… toujours séparées), pré-remplies (stagiaire, société, formation, dates,
 * durée, lieu, formateur). Le formateur donne l'avis, la note et ses
 * observations, puis signe une fois pour toutes.
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
  const [data, setData] = useState<ReussiteData>(() => normalize(initialData, session.series));
  // Attestation affichée : « clé du modèle|stagiaire ».
  const items = useMemo(
    () => session.series.flatMap((s) => s.trainees.map((t) => ({ id: `${s.model.key}|${t.id}`, series: s, trainee: t }))),
    [session.series]
  );
  const [current, setCurrent] = useState(items[0]?.id || '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [signing, setSigning] = useState(!initialData?.signature);
  const [padEmpty, setPadEmpty] = useState(true);
  const pad = useRef<SignaturePadHandle>(null);
  const firstRun = useRef(true);
  const groups = session.series.map((s) => ({ key: s.model.key, traineeIds: s.trainees.map((t) => t.id) }));
  const { done, total } = reussiteCount(data, groups);
  const allDone = reussiteDone(data, groups);

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

  const index = items.findIndex((x) => x.id === current);
  const item = items[index];
  const key = item?.series.model.key || '';
  const tid = item?.trainee.id || '';
  const entry: ReussiteEntry = data.models?.[key]?.[tid] || {};
  const set = (patch: Partial<ReussiteEntry>) =>
    setData((d) => ({
      ...d,
      models: { ...(d.models || {}), [key]: { ...(d.models?.[key] || {}), [tid]: { ...(d.models?.[key]?.[tid] || {}), ...patch } } },
    }));

  function sign() {
    const url = pad.current?.toDataURL();
    if (!url) return;
    setData((d) => ({ ...d, signature: url, signedBy: session.trainerName }));
    setSigning(false);
  }

  async function download(only?: { key: string; traineeId: string }) {
    setBusy(only ? `${only.key}|${only.traineeId}` : 'all');
    setError(null);
    try {
      const { buildReussitePdf } = await import('@/lib/pdf-reussite');
      const { downloadPdf } = await import('@/lib/pdf-dossier');
      const inputs = reussiteInputs(session, data, only);
      const bytes = await buildReussitePdf(inputs);
      const name = only
        ? `Attestation de réussite ${inputs[0]?.model.label} - ${inputs[0]?.trainees[0]?.name}`
        : `Attestations de réussite - ${session.series.map((s) => s.model.label).join(', ')}`;
      downloadPdf(bytes, `${name}.pdf`);
    } catch (e: any) {
      setError(e?.message || 'PDF impossible.');
    } finally {
      setBusy(null);
    }
  }

  const status = (k: string, id: string) => data.models?.[k]?.[id]?.avis;
  const many = session.series.length > 1;
  const s = item?.series;

  return (
    <div className="pf fai">
      <div className="pf-bar">
        <div className="pf-title">
          <strong>Attestations de réussite · {session.series.map((x) => x.model.label).join(' · ')}</strong>
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
              `${done}/${total} avis donnés${data.signature ? '' : ' · signature à faire'}`
            )}
          </span>
        </div>
        <div className="row-actions">
          <button type="button" className={`small${allDone ? ' primary' : ''}`} onClick={() => download()} disabled={!!busy || !items.length}>
            {busy === 'all' ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} Toutes les attestations (PDF)
          </button>
          <button type="button" className="icon ghost" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ margin: '8px 16px' }}>{error}</div>}

      {!items.length || !item || !s ? (
        <p className="empty" style={{ padding: 24 }}>Aucun stagiaire validé : ajoute-les d’abord, une attestation sera prête pour chacun.</p>
      ) : (
        <div className="fai-body">
          <nav className="fai-list" aria-label="Attestations">
            <select className="input fai-select" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="Attestation">
              {session.series.map((x) => (
                <optgroup key={x.model.key} label={x.model.label}>
                  {x.trainees.map((t) => <option key={t.id} value={`${x.model.key}|${t.id}`}>{many ? `${x.model.label} · ` : ''}{t.name}</option>)}
                </optgroup>
              ))}
            </select>
            {session.series.map((x) => (
              <div key={x.model.key} className="ar-group">
                {many && <p className="ar-group-h">{x.model.label} <small>{x.trainees.length} stagiaire{x.trainees.length > 1 ? 's' : ''}</small></p>}
                {x.trainees.length === 0 && <p className="hint ar-empty">Aucun stagiaire sur ce module.</p>}
                {x.trainees.map((t) => {
                  const id = `${x.model.key}|${t.id}`;
                  const st = status(x.model.key, t.id);
                  return (
                    <button key={id} type="button" className={`fai-item${id === current ? ' active' : ''}`} onClick={() => setCurrent(id)} aria-current={id === current}>
                      <span>
                        <strong>{t.name}</strong>
                        {t.company && <small>{t.company}</small>}
                      </span>
                      {st === 'favorable' ? (
                        <span className="fai-pill ok">Favorable</span>
                      ) : st === 'defavorable' ? (
                        <span className="fai-pill ko">Défavorable</span>
                      ) : (
                        <span className="fai-pill todo">À remplir</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <section className="fai-sheet" aria-label={`Attestation ${s.model.label} de ${item.trainee.name}`}>
            <div className="fai-info">
              <div><span>Stagiaire</span><strong>{item.trainee.name}</strong></div>
              <div><span>Société</span><strong>{item.trainee.company || '-'}</strong></div>
              <div><span>Formation</span><strong>{s.model.label}</strong></div>
              <div>
                <span>Dates</span>
                <strong>{s.startDate === s.endDate ? `le ${frDate(s.startDate)}` : `du ${frDate(s.startDate)} au ${frDate(s.endDate)}`}</strong>
              </div>
              <div><span>Durée</span><strong>{s.duration}</strong></div>
              <div><span>Formateur</span><strong>{session.trainerName || '-'}</strong></div>
            </div>

            <h3 className="fai-h">Avis après formation <small>({s.model.label})</small></h3>
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
              <button type="button" className="small" disabled={index <= 0} onClick={() => setCurrent(items[index - 1].id)}>
                <ArrowLeft size={14} aria-hidden /> Précédent
              </button>
              <button type="button" className="small" onClick={() => download({ key, traineeId: tid })} disabled={!!busy}>
                {busy === current ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} PDF de cette attestation
              </button>
              <span style={{ flex: 1 }} />
              <button type="button" className="small primary" disabled={index >= items.length - 1} onClick={() => setCurrent(items[index + 1].id)}>
                Suivant <ArrowRight size={14} aria-hidden />
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
