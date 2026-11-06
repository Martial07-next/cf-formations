'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ClipboardCheck, PenLine } from 'lucide-react';
import { setSessionIrve } from '@/app/dossier/actions';
import { IrveEditor } from '@/components/dossier/irve-editor';
import { gridAuto, irveCount, irveDone, type GridDef, type IrveData } from '@/lib/irve-grid';

export type EvalGridProp = {
  sessionFlag: boolean | null;
  templateFlag: boolean | null;
  on: boolean;
  data: IrveData | null;
};

/**
 * Ligne du dossier pour une grille d'évaluation pratique (IRVE, Maintenance) :
 * demandée ou non pour la session (bureau), avancement, saisie du formateur.
 */
export function EvalGridRow({
  def,
  grid,
  data,
  onData,
  sessionId,
  title,
  dates,
  trainer,
  lastDay,
  trainees,
  canFill,
  canManage,
  me,
  onError,
}: {
  def: GridDef;
  grid: EvalGridProp;
  data: IrveData | null;
  onData: (d: IrveData) => void;
  sessionId: string;
  title: string;
  dates: string;
  trainer: string;
  lastDay: string | null;
  trainees: { id: string; name: string; company: string | null }[];
  canFill: boolean;
  canManage: boolean;
  me: { id: string; name: string } | null;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  if (!grid.on && !canManage) return null;
  const ids = trainees.map((t) => t.id);
  const filled = irveCount(def, data, ids).done;
  const done = grid.on && irveDone(def, data, ids);
  const auto = grid.templateFlag ?? gridAuto(def, title);

  return (
    <div className="doc-list" style={{ marginBottom: 6 }}>
      <div className={`doc-item${grid.on ? '' : ' doc-off'}`}>
        <ClipboardCheck size={16} aria-hidden />
        <span className="doc-item-main">
          <strong>{def.name}</strong>
          <small className="hint">
            {grid.on
              ? `${def.qualifs.join(' / ')} · une grille par stagiaire, remplie par le formateur pendant la mise en situation · ${filled}/${trainees.length} complète${filled > 1 ? 's' : ''}`
              : 'Non demandée pour cette session'}
          </small>
        </span>
        {canManage && (
          <select
            className="input"
            aria-label={`${def.name} pour cette session`}
            value={grid.sessionFlag === null ? 'auto' : grid.sessionFlag ? 'oui' : 'non'}
            onChange={(e) => {
              const v = e.target.value;
              startTransition(async () => {
                const res = await setSessionIrve(sessionId, v === 'auto' ? null : v === 'oui', def.kind);
                if (!res.ok) onError(res.error);
              });
            }}
          >
            <option value="auto">Selon la formation ({auto ? 'oui' : 'non'})</option>
            <option value="oui">Oui pour cette session</option>
            <option value="non">Pas besoin pour cette session</option>
          </select>
        )}
        {grid.on &&
          (done ? (
            <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Terminé</span>
          ) : filled || Object.keys(data?.trainees || {}).length ? (
            <span className="badge en_attente">En cours</span>
          ) : (
            <span className="badge brouillon">À remplir</span>
          ))}
        {grid.on && (
          <button
            type="button"
            className={`small${canFill && !done ? ' primary' : ''}`}
            onClick={() => {
              setOpen(true);
              ref.current?.showModal();
            }}
          >
            {canFill && !done ? <><PenLine size={14} aria-hidden /> Remplir</> : 'Ouvrir'}
          </button>
        )}
      </div>
      <dialog ref={ref} className="modal modal-full" aria-label={def.name} onClose={() => { setOpen(false); router.refresh(); }}>
        {open && grid.on && (
          <IrveEditor
            def={def}
            session={{ sessionId, title, dates, trainer, defaultDate: lastDay || '', trainees }}
            initialData={data}
            canEdit={canFill}
            me={me}
            onClose={() => ref.current?.close()}
            onSaved={(d) => onData(d)}
          />
        )}
      </dialog>
    </div>
  );
}
