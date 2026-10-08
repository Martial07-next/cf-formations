'use client';

import { useState, useTransition } from 'react';
import { Layers, Plus, Pencil, Trash2, Scissors } from 'lucide-react';
import {
  addSessionModule,
  updateSessionModule,
  deleteSessionModule,
  splitSessionByDay,
  setTraineeModules,
} from '@/app/sessions/[id]/actions';
import { frDay, type SessionModule } from '@/lib/modules';
import { formatHours, weekdaysBetween } from '@/lib/week';
import { splitHours } from '@/lib/schedule';

function ModuleFields({ m, days }: { m?: SessionModule; days: string[] }) {
  const d = m?.duration_hours != null ? splitHours(Number(m.duration_hours)) : null;
  return (
    <div className="form-row">
      <label>
        Nom du module
        <input name="name" required defaultValue={m?.name || ''} placeholder="Ex. MA1" />
      </label>
      <label>
        Du
        <select name="start_day" defaultValue={m?.start_day || days[0]}>
          {days.map((day) => <option key={day} value={day}>{frDay(day)}</option>)}
        </select>
      </label>
      <label>
        Au
        <select name="end_day" defaultValue={m?.end_day || days[0]}>
          {days.map((day) => <option key={day} value={day}>{frDay(day)}</option>)}
        </select>
      </label>
      <div className="field">
        Durée (facultatif)
        <span className="duration-input">
          <input name="duration_h" type="number" min={0} aria-label="Heures" defaultValue={d?.h ?? ''} />
          <span>h</span>
          <select name="duration_min" aria-label="Minutes" defaultValue={String(d?.m ?? 0)}>
            {['0', '15', '30', '45'].map((x) => <option key={x} value={x}>{x.padStart(2, '0')}</option>)}
          </select>
        </span>
      </div>
    </div>
  );
}

/** Liste et gestion des modules d'une session (MA1, MA2, MA3…). */
export function SessionModulesPanel({
  sessionId,
  startAt,
  endAt,
  modules,
  traineeModules,
  validatedIds,
  canEdit,
}: {
  sessionId: string;
  startAt: string;
  endAt: string;
  modules: SessionModule[];
  traineeModules: Record<string, string[]>;
  validatedIds: string[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const weekdays = weekdaysBetween(startAt, endAt);
  const days = weekdays.length ? weekdays : [startAt.slice(0, 10)];

  if (!canEdit && modules.length === 0) return null;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error || 'Une erreur est survenue.');
      else after?.();
    });
  }

  // Stagiaires validés présents sur chaque module (aucun choix = session complète).
  const countFor = (moduleId: string) =>
    validatedIds.filter((id) => !traineeModules[id]?.length || traineeModules[id].includes(moduleId)).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2><Layers size={18} aria-hidden /> Modules de la session</h2>
        {canEdit && (
          <span className="row-actions">
            {modules.length === 0 && days.length > 1 && (
              <button className="small" disabled={isPending} onClick={() => run(() => splitSessionByDay(sessionId))}>
                <Scissors size={14} aria-hidden /> Un module par jour
              </button>
            )}
            <button className="small primary" onClick={() => { setAdding((v) => !v); setEditing(null); }}>
              <Plus size={14} aria-hidden /> Module
            </button>
          </span>
        )}
      </div>
      <p className="panel-intro">
        Un stagiaire peut ne suivre qu’une partie de la session (ex. seulement MA1, ou MA1 + MA2) : coche ses modules
        dans la liste des stagiaires ci-dessous. Sans choix, il suit la session complète.
      </p>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      {modules.length === 0 && !adding && <p className="hint">Aucun module : tous les stagiaires suivent la session complète.</p>}

      <div className="module-cards">
        {modules.map((m) =>
          editing === m.id ? (
            <form key={m.id} className="workshop-card editing" action={(fd) => run(() => updateSessionModule(sessionId, m.id, fd), () => setEditing(null))}>
              <ModuleFields m={m} days={days} />
              <div className="row-actions">
                <button type="submit" className="primary small" disabled={isPending}>Enregistrer</button>
                <button type="button" className="small" onClick={() => setEditing(null)}>Annuler</button>
              </div>
            </form>
          ) : (
            <div key={m.id} className="module-card">
              <strong>{m.name}</strong>
              <span className="hint">
                {m.start_day === m.end_day ? frDay(m.start_day) : `${frDay(m.start_day)} → ${frDay(m.end_day)}`}
                {m.duration_hours != null && ` · ${formatHours(Number(m.duration_hours))}`}
              </span>
              <span className="badge validee">{countFor(m.id)} stagiaire{countFor(m.id) > 1 ? 's' : ''}</span>
              {canEdit && (
                <span className="row-actions">
                  <button className="small icon ghost" aria-label={`Modifier ${m.name}`} onClick={() => { setEditing(m.id); setAdding(false); }}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="small icon danger"
                    aria-label={`Supprimer ${m.name}`}
                    disabled={isPending}
                    onClick={() => confirm(`Supprimer le module « ${m.name} » ?`) && run(() => deleteSessionModule(sessionId, m.id))}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              )}
            </div>
          )
        )}
      </div>

      {canEdit && adding && (
        <form className="workshop-card editing" action={(fd) => run(() => addSessionModule(sessionId, fd), () => setAdding(false))}>
          <ModuleFields days={days} />
          <div className="row-actions">
            <button type="submit" className="primary small" disabled={isPending}>Ajouter le module</button>
            <button type="button" className="small" onClick={() => setAdding(false)}>Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Pastilles cliquables des modules suivis par un stagiaire. */
export function TraineeModuleToggles({
  sessionId,
  traineeId,
  modules,
  chosen,
  canEdit,
}: {
  sessionId: string;
  traineeId: string;
  modules: SessionModule[];
  chosen: string[];
  canEdit: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const effective = chosen.length ? chosen : modules.map((m) => m.id);
  const full = effective.length === modules.length;

  function toggle(id: string) {
    const next = effective.includes(id) ? effective.filter((x) => x !== id) : [...effective, id];
    setError(null);
    startTransition(async () => {
      const res = await setTraineeModules(sessionId, traineeId, next);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <span className="module-toggles" aria-busy={isPending}>
      {modules.map((m) =>
        canEdit ? (
          <button
            key={m.id}
            type="button"
            className={`module-toggle${effective.includes(m.id) ? ' on' : ''}`}
            aria-pressed={effective.includes(m.id)}
            disabled={isPending}
            onClick={() => toggle(m.id)}
            title={`${m.name} : ${frDay(m.start_day)}`}
          >
            {m.name}
          </button>
        ) : (
          effective.includes(m.id) && <span key={m.id} className="module-toggle on">{m.name}</span>
        )
      )}
      {full && <span className="hint">complète</span>}
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}
