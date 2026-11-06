'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Loader2, MessageSquarePlus, Sparkles, X } from 'lucide-react';
import { saveIrve } from '@/app/dossier/actions';
import { LivePeers, useLiveForm } from '@/components/dossier/use-live-form';
import {
  APPRECIATIONS,
  LEVELS,
  familyNote,
  fmtNote,
  irveDone,
  irveEntryDone,
  totalNote,
  type AppreciationKey,
  type GridDef,
  type IrveData,
  type IrveEntry,
  type Level,
} from '@/lib/irve-grid';

export type IrveSession = {
  sessionId: string;
  title: string;
  dates: string;
  trainer: string;
  /** Date de l'évaluation par défaut (JJ/MM/AAAA, dernier jour de la session). */
  defaultDate: string;
  trainees: { id: string; name: string; company: string | null }[];
};

/** Appréciation suggérée d'après le total et les erreurs critiques. */
function suggest(def: GridDef, e: IrveEntry): AppreciationKey | null {
  const t = totalNote(def, e);
  if (t === null) return null;
  const critical = Object.values(e.critical || {}).some(Boolean);
  if (t >= 16 && !critical) return 'maitrise';
  if (t >= 12) return 'consolider';
  if (t >= 8) return 'partiel';
  return 'non';
}

/**
 * Grille d'évaluation pratique IRVE (P1 / P2 / P3) : remplie par le formateur,
 * un stagiaire à la fois, enregistrée en direct (à plusieurs), PDF au modèle
 * de CF Réseaux.
 */
export function IrveEditor({
  def,
  session,
  initialData,
  canEdit,
  me = null,
  onClose,
  onSaved,
}: {
  def: GridDef;
  session: IrveSession;
  initialData: IrveData | null;
  canEdit: boolean;
  me?: { id: string; name: string } | null;
  onClose: () => void;
  onSaved?: (data: IrveData, completed: boolean) => void;
}) {
  const [data, setData] = useState<IrveData>(initialData || {});
  const [current, setCurrent] = useState(session.trainees[0]?.id || '');
  const [openRemarks, setOpenRemarks] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setError] = useState<string | null>(null);
  const ids = session.trainees.map((t) => t.id);
  const live = useLiveForm<IrveData>({
    sessionId: session.sessionId,
    kind: def.kind,
    data,
    setData,
    canEdit,
    me,
    completedOf: (d) => irveDone(def, d, ids),
    legacySave: (d, comp) => saveIrve(session.sessionId, d, Boolean(comp), def.kind),
    onSynced: (d) => onSaved?.(d, irveDone(def, d, ids)),
  });
  const error = localError || live.error;
  const idx = session.trainees.findIndex((t) => t.id === current);
  const trainee = session.trainees[idx] || null;
  const e: IrveEntry = (trainee && data.trainees?.[trainee.id]) || {};
  const total = useMemo(() => totalNote(def, e), [def, e]);
  const suggestion = suggest(def, e);

  const set = (patch: Partial<IrveEntry>) => {
    if (!trainee || !canEdit) return;
    setData((d) => ({ ...d, trainees: { ...(d.trainees || {}), [trainee.id]: { ...(d.trainees?.[trainee.id] || {}), ...patch } } }));
  };
  const setScore = (id: string, v: Level) => set({ scores: { ...(e.scores || {}), [id]: v } });
  const allTo3 = (crit: { id: string }[]) => set({ scores: { ...(e.scores || {}), ...Object.fromEntries(crit.map((c) => [c.id, 3 as Level])) } });
  const toggleIn = <T extends string>(list: T[] | undefined, v: T) => (list || []).includes(v) ? (list || []).filter((x) => x !== v) : [...(list || []), v];

  async function download(only?: string) {
    setBusy(only || 'all');
    setError(null);
    try {
      const list = session.trainees.filter((t) => (only ? t.id === only : data.trainees?.[t.id]));
      if (!list.length) throw new Error('Aucune grille commencée.');
      const { buildIrvePdf } = await import('@/lib/pdf-irve');
      const { downloadPdf } = await import('@/lib/pdf-dossier');
      const bytes = await buildIrvePdf(def, { sessionTitle: session.title, dates: session.dates, trainer: session.trainer, defaultDate: session.defaultDate, trainees: list, entries: data.trainees || {} });
      downloadPdf(bytes, only ? `${def.short} - ${list[0].name}.pdf` : `${def.short} - ${session.title}.pdf`);
    } catch (err: any) {
      setError(err?.message || 'PDF impossible.');
    } finally {
      setBusy(null);
    }
  }

  const doneCount = session.trainees.filter((t) => irveEntryDone(def, data.trainees?.[t.id])).length;

  return (
    <div className="pf irve">
      <div className="pf-bar">
        <div className="pf-title">
          <strong>{def.name} · {session.title}</strong>
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
            {doneCount === session.trainees.length && doneCount > 0 ? (
              <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Toutes les grilles sont complètes</span>
            ) : (
              `${doneCount}/${session.trainees.length} grille${session.trainees.length > 1 ? 's' : ''} complète${doneCount > 1 ? 's' : ''}`
            )}
          </span>
        </div>
        <div className="row-actions">
          <LivePeers peers={live.peers} live={live.live} />
          {trainee && (
            <button type="button" className="small" onClick={() => download(trainee.id)} disabled={!!busy}>
              {busy === trainee.id ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} PDF du stagiaire
            </button>
          )}
          <button type="button" className={`small${doneCount ? ' primary' : ''}`} onClick={() => download()} disabled={!!busy}>
            {busy === 'all' ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} Toutes les grilles
          </button>
          <button type="button" className="icon ghost" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ margin: '8px 16px' }}>{error}</div>}

      {session.trainees.length === 0 ? (
        <p className="empty" style={{ padding: 16 }}>Aucun stagiaire validé sur cette session.</p>
      ) : (
        <div className="irve-body">
          {/* Stagiaires */}
          <nav className="irve-people" aria-label="Stagiaires">
            <select className="irve-people-select" value={current} onChange={(ev) => setCurrent(ev.target.value)} aria-label="Stagiaire">
              {session.trainees.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {session.trainees.map((t) => {
              const te = data.trainees?.[t.id];
              const done = irveEntryDone(def, te);
              const tt = totalNote(def, te);
              return (
                <button key={t.id} type="button" className={`irve-person${t.id === current ? ' on' : ''}${done ? ' done' : ''}`} onClick={() => setCurrent(t.id)}>
                  <span>
                    <strong>{t.name}</strong>
                    <small>{t.company || 'Sans entreprise'}</small>
                  </span>
                  <em>{done ? <CheckCircle2 size={14} aria-hidden /> : null}{tt === null ? 'À remplir' : `${fmtNote(tt)}/20`}</em>
                </button>
              );
            })}
          </nav>

          {trainee && (
            <div className="irve-main">
              <div className="irve-head">
                <div>
                  <h2>{trainee.name}</h2>
                  <small className="hint">{trainee.company || 'Sans entreprise'} · {session.dates} · évaluateur : {session.trainer}</small>
                </div>
                <div className="irve-total" aria-label="Total pratique">
                  <strong>{fmtNote(total)}</strong>
                  <span>/20</span>
                </div>
              </div>

              <section className="irve-card">
                <h3>Identification</h3>
                <div className="irve-line">
                  <span className="irve-label">{def.qualifLabel}</span>
                  <span className="irve-chips">
                    {def.qualifs.map((q) => (
                      <button key={q} type="button" className={`irve-chip${e.qualif?.includes(q) ? ' on' : ''}`} aria-pressed={Boolean(e.qualif?.includes(q))} disabled={!canEdit} onClick={() => set({ qualif: toggleIn(e.qualif, q) })}>{q}</button>
                    ))}
                  </span>
                </div>
                <div className="irve-line">
                  <span className="irve-label">Mise en situation</span>
                  <span className="irve-chips">
                    {def.situations.map((q) => (
                      <button key={q} type="button" className={`irve-chip${e.situations?.includes(q) ? ' on' : ''}`} aria-pressed={Boolean(e.situations?.includes(q))} disabled={!canEdit} onClick={() => set({ situations: toggleIn(e.situations, q) })}>{q}</button>
                    ))}
                  </span>
                </div>
              </section>

              <div className="irve-quick">
                <span className="hint">0 non réalisé · 1 aide importante · 2 quelques indications · 3 maîtrisé · N/O non observé</span>
                {canEdit && (
                  <button type="button" className="small" onClick={() => allTo3(def.families.flatMap((f) => f.criteria))}>
                    <Sparkles size={14} aria-hidden /> Tout à 3 pour ce stagiaire
                  </button>
                )}
              </div>

              {def.families.map((fam) => {
                const note = familyNote(fam, e);
                const filled = fam.criteria.filter((c) => e.scores?.[c.id] !== undefined).length;
                return (
                  <section key={fam.key} className="irve-card irve-family">
                    <div className="irve-fam-head">
                      <h3><span className="irve-letter">{fam.key}</span> {fam.title}</h3>
                      <span className="irve-fam-tools">
                        <span className={`irve-note${filled === fam.criteria.length ? ' full' : ''}`}>{fmtNote(note)} / {fam.bareme}</span>
                        {canEdit && <button type="button" className="small ghost" onClick={() => allTo3(fam.criteria)}>Tout à 3</button>}
                      </span>
                    </div>
                    {fam.criteria.map((c) => {
                      const v = e.scores?.[c.id];
                      const remOpen = openRemarks.has(c.id) || Boolean(e.remarks?.[c.id]);
                      return (
                        <div key={c.id} className={`irve-crit${v === undefined ? ' todo' : ''}`}>
                          <span className="irve-crit-label">{c.label}</span>
                          <span className="irve-levels" role="radiogroup" aria-label={c.label}>
                            {LEVELS.map((l) => (
                              <button
                                key={String(l.value)}
                                type="button"
                                role="radio"
                                aria-checked={v === l.value}
                                title={l.hint}
                                className={`irve-level l${l.value}${v === l.value ? ' on' : ''}`}
                                disabled={!canEdit}
                                onClick={() => setScore(c.id, l.value)}
                              >
                                {l.label}
                              </button>
                            ))}
                            {canEdit && !remOpen && (
                              <button type="button" className="irve-rem-btn" title="Ajouter une remarque" aria-label="Ajouter une remarque" onClick={() => setOpenRemarks((s) => new Set(s).add(c.id))}>
                                <MessageSquarePlus size={14} />
                              </button>
                            )}
                          </span>
                          {remOpen && (
                            <input
                              className="input irve-rem"
                              placeholder="Remarque / fait observé (facultatif)"
                              value={e.remarks?.[c.id] || ''}
                              readOnly={!canEdit}
                              onChange={(ev) => set({ remarks: { ...(e.remarks || {}), [c.id]: ev.target.value } })}
                            />
                          )}
                        </div>
                      );
                    })}
                    <input
                      className="input irve-obs"
                      placeholder="Observations sur la famille (facultatif)"
                      value={e.obs?.[fam.key] || ''}
                      readOnly={!canEdit}
                      onChange={(ev) => set({ obs: { ...(e.obs || {}), [fam.key]: ev.target.value } })}
                    />
                  </section>
                );
              })}

              <section className="irve-card">
                <h3>Erreurs critiques / sécurité</h3>
                <p className="hint" style={{ marginTop: 0 }}>Relevées à part : elles ne sont pas compensées par la note.</p>
                {def.critical.map((c) => (
                  <label key={c.key} className={`irve-critical${e.critical?.[c.key] ? ' on' : ''}`}>
                    <input type="checkbox" checked={Boolean(e.critical?.[c.key])} disabled={!canEdit} onChange={(ev) => set({ critical: { ...(e.critical || {}), [c.key]: ev.target.checked } })} />
                    {c.label}
                  </label>
                ))}
                {Object.values(e.critical || {}).some(Boolean) && (
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Description factuelle de l’écart, contexte et correction demandée"
                    value={e.criticalText || ''}
                    readOnly={!canEdit}
                    onChange={(ev) => set({ criticalText: ev.target.value })}
                  />
                )}
              </section>

              <section className="irve-card">
                <h3>Appréciation générale</h3>
                {suggestion && !e.appreciation && canEdit && (
                  <button type="button" className="small irve-suggest" onClick={() => set({ appreciation: suggestion })}>
                    <Sparkles size={13} aria-hidden /> Suggestion d’après la note : {APPRECIATIONS.find((a) => a.key === suggestion)?.label}
                  </button>
                )}
                <div className="irve-apprs" role="radiogroup" aria-label="Appréciation générale">
                  {APPRECIATIONS.map((a) => (
                    <button key={a.key} type="button" role="radio" aria-checked={e.appreciation === a.key} className={`irve-appr ${a.key}${e.appreciation === a.key ? ' on' : ''}`} disabled={!canEdit} onClick={() => set({ appreciation: a.key })}>
                      {a.label}
                    </button>
                  ))}
                </div>
                <div className="irve-two">
                  <label>Points forts observés<textarea className="input" rows={2} value={e.forts || ''} readOnly={!canEdit} onChange={(ev) => set({ forts: ev.target.value })} /></label>
                  <label>Axes de progression / exercices à reprendre<textarea className="input" rows={2} value={e.axes || ''} readOnly={!canEdit} onChange={(ev) => set({ axes: ev.target.value })} /></label>
                </div>
              </section>

              <details className="irve-card irve-more">
                <summary><h3>Traçabilité de la mise en situation et date</h3></summary>
                <div className="irve-two">
                  <label>Atelier / poste utilisé<input className="input" value={e.atelier || ''} readOnly={!canEdit} onChange={(ev) => set({ atelier: ev.target.value })} /></label>
                  <label>{def.materielLabel}<input className="input" value={e.materiel || ''} readOnly={!canEdit} onChange={(ev) => set({ materiel: ev.target.value })} /></label>
                  <label>{def.scenarioLabel}<input className="input" value={e.scenario || ''} readOnly={!canEdit} onChange={(ev) => set({ scenario: ev.target.value })} /></label>
                  <label>Date de l’évaluation<input className="input" value={e.date ?? session.defaultDate} placeholder="JJ/MM/AAAA" readOnly={!canEdit} onChange={(ev) => set({ date: ev.target.value })} /></label>
                </div>
                <div className="irve-line">
                  <span className="irve-label">Documents conservés</span>
                  <span className="irve-chips">
                    {def.conserves.map((q) => (
                      <button key={q} type="button" className={`irve-chip${e.conserves?.includes(q) ? ' on' : ''}`} aria-pressed={Boolean(e.conserves?.includes(q))} disabled={!canEdit} onClick={() => set({ conserves: toggleIn(e.conserves, q) })}>{q}</button>
                    ))}
                  </span>
                </div>
                {e.conserves?.includes('Autre') && (
                  <input className="input" placeholder="Autre document" value={e.autreDoc || ''} readOnly={!canEdit} onChange={(ev) => set({ autreDoc: ev.target.value })} />
                )}
              </details>

              <div className="irve-nav">
                <button type="button" className="small" disabled={idx <= 0} onClick={() => setCurrent(session.trainees[idx - 1].id)}>
                  <ChevronLeft size={14} aria-hidden /> Stagiaire précédent
                </button>
                <span className="hint">{irveEntryDone(def, e) ? 'Grille complète' : 'Note tous les critères et choisis une appréciation'}</span>
                <button type="button" className="small primary" disabled={idx >= session.trainees.length - 1} onClick={() => setCurrent(session.trainees[idx + 1].id)}>
                  Stagiaire suivant <ChevronRight size={14} aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
