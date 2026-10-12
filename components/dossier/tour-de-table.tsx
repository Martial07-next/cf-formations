'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';
import { CheckCircle2, Download, Loader2, RotateCcw, X } from 'lucide-react';
import { saveTourDeTable } from '@/app/dossier/actions';
import { TDT_COLUMNS, type TdtData, type TdtKey } from '@/lib/tdt';

/** Zone de texte qui grandit avec son contenu. */
export function AutoText({
  value,
  onChange,
  readOnly,
  label,
  placeholder,
  minRows = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  label: string;
  placeholder?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="tdt-input"
      aria-label={label}
      rows={minRows}
      value={value}
      readOnly={readOnly}
      placeholder={readOnly ? '' : placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export type TdtSession = {
  sessionId: string;
  title: string;
  period: string;
  room: string | null;
  trainerName: string | null;
  trainees: { id: string; name: string; company: string | null }[];
  place?: string | null;
  legal?: import('@/lib/pdf-brand').Legal | null;
  lastDay?: string | null;
};

/**
 * Tour de table rempli directement à l'ordinateur : une ligne par stagiaire
 * validé (nom et société déjà remplis), enregistrement automatique, PDF à la
 * charte CF Réseaux.
 */
export function TourDeTable({
  session,
  initialData,
  initialCompleted,
  completedAt,
  canEdit,
  onClose,
  onSaved,
}: {
  session: TdtSession;
  initialData: TdtData | null;
  initialCompleted: boolean;
  completedAt: string | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved?: (data: TdtData, completed: boolean) => void;
}) {
  const [data, setData] = useState<TdtData>(initialData || {});
  const [completed, setCompleted] = useState(initialCompleted);
  const [doneAt, setDoneAt] = useState<string | null>(completedAt);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const firstRun = useRef(true);
  const editable = canEdit && !completed;

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!canEdit) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      const res = await saveTourDeTable(session.sessionId, data);
      if (res.ok) {
        setSaveState('saved');
        setSavedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
        onSaved?.(data, completed);
      } else {
        setSaveState('error');
        setError(res.error);
      }
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const setCell = (traineeId: string, key: TdtKey, value: string) =>
    setData((d) => ({ ...d, rows: { ...(d.rows || {}), [traineeId]: { ...(d.rows?.[traineeId] || {}), [key]: value } } }));

  const filled = useMemo(
    () => session.trainees.filter((t) => TDT_COLUMNS.some((c) => c.key !== 'company' && (data.rows?.[t.id]?.[c.key] || '').trim())).length,
    [data, session.trainees]
  );

  function setDone(value: boolean) {
    startTransition(async () => {
      const res = await saveTourDeTable(session.sessionId, data, value);
      if (!res.ok) return setError(res.error);
      setCompleted(value);
      setDoneAt(value ? new Date().toLocaleDateString('fr-FR') : null);
      onSaved?.(data, value);
    });
  }

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const { buildTourDeTablePdf } = await import('@/lib/tour-de-table');
      const { downloadPdf } = await import('@/lib/pdf-dossier');
      const bytes = await buildTourDeTablePdf({ ...session, data, completedAt: completed ? doneAt : null });
      downloadPdf(bytes, `Tour de table - ${session.title}.pdf`);
    } catch (e: any) {
      setError(e?.message || 'PDF impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pf tdt">
      <div className="pf-bar">
        <div className="pf-title">
          <strong>Tour de table · {session.title}</strong>
          <span className="hint">
            {completed ? (
              <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Terminé{doneAt ? ` le ${doneAt}` : ''}</span>
            ) : saveState === 'saving' ? (
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
          </span>
        </div>
        <div className="row-actions">
          <button type="button" className={`small${completed ? ' primary' : ''}`} onClick={download} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} {completed ? 'Télécharger' : 'Aperçu PDF'}
          </button>
          {canEdit &&
            (completed ? (
              <button type="button" className="small" onClick={() => setDone(false)} disabled={isPending}><RotateCcw size={14} aria-hidden /> Rouvrir</button>
            ) : (
              <button type="button" className="small primary" onClick={() => setDone(true)} disabled={isPending}><CheckCircle2 size={14} aria-hidden /> Terminé</button>
            ))}
          <button type="button" className="icon ghost" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
      </div>
      {error && <div role="alert" className="alert alert-error" style={{ margin: '8px 16px' }}>{error}</div>}

      <div className="tdt-body">
        <div className="tdt-head">
          <div>
            <p className="tdt-kicker">À compléter à chaque début de formation</p>
            <p className="hint" style={{ margin: 0 }}>
              {[session.period, session.room, session.trainerName && `Formateur : ${session.trainerName}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className="hint">{filled}/{session.trainees.length} stagiaire{session.trainees.length > 1 ? 's' : ''} renseigné{filled > 1 ? 's' : ''}</span>
        </div>

        {session.trainees.length === 0 ? (
          <p className="empty">Aucun stagiaire validé sur cette session : ajoute-les d’abord, ils apparaîtront ici automatiquement.</p>
        ) : (
          <div className="tdt-scroll">
            <table className="tdt-table">
              <thead>
                <tr>
                  <th className="tdt-num">N°</th>
                  <th className="tdt-name">Nom Prénom</th>
                  {TDT_COLUMNS.map((c) => <th key={c.key} style={{ minWidth: c.width * 1.6 }}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {session.trainees.map((t, i) => {
                  const row = data.rows?.[t.id] || {};
                  return (
                    <tr key={t.id}>
                      <td className="tdt-num">{i + 1}</td>
                      <td className="tdt-name">{t.name}</td>
                      {TDT_COLUMNS.map((c) => (
                        <td key={c.key}>
                          <AutoText
                            label={`${c.label} : ${t.name}`}
                            placeholder={'placeholder' in c ? c.placeholder : undefined}
                            readOnly={!editable}
                            value={c.key === 'company' ? row.company ?? t.company ?? '' : row[c.key] ?? ''}
                            onChange={(v) => setCell(t.id, c.key, v)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <label className="tdt-general">
          Incidents et remarques générales
          <AutoText
            label="Incidents et remarques générales"
            placeholder="Matériel, retards, accidents, remarques sur le groupe…"
            readOnly={!editable}
            minRows={3}
            value={data.general || ''}
            onChange={(v) => setData((d) => ({ ...d, general: v }))}
          />
        </label>
      </div>
    </div>
  );
}
