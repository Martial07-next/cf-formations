'use client';

import { submitWith } from '@/lib/form-submit';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Plus, Pencil, Trash2, Scissors } from 'lucide-react';
import {
  addSessionModule,
  updateSessionModule,
  deleteSessionModule,
  splitSessionByDay,
  setTraineeModules,
} from '@/app/sessions/[id]/actions';
import { frDay, type SessionModule } from '@/lib/modules';
import { dayHours, formatHours, weekdaysBetween, type DayOverride } from '@/lib/week';
import { ModuleDays } from '@/components/module-days';
import { askConfirm } from '@/lib/confirm-dialog';

function ModuleFields({ m, days, dayMinutes, taken }: { m?: SessionModule; days: string[]; dayMinutes: Record<string, number>; taken: string[] }) {
  return (
    <div className="form-row">
      <label>
        Nom du module
        <input name="name" required defaultValue={m?.name || ''} placeholder="Ex. MA1" />
      </label>
      <ModuleDays
        days={days}
        dayMinutes={dayMinutes}
        taken={taken}
        defaultStart={m?.start_day}
        defaultEnd={m?.end_day}
        defaultMinutes={m?.duration_hours != null ? Number(m.duration_hours) * 60 : null}
      />
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
  overrides = [],
}: {
  sessionId: string;
  startAt: string;
  endAt: string;
  /** Horaires propres à certains jours : durée des modules calculée avec. */
  overrides?: DayOverride[];
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
  const dayMinutes = Object.fromEntries(dayHours(startAt, endAt, overrides).map((d) => [d.day, d.minutes]));
  // Jours déjà pris par les autres modules (non proposés à nouveau).
  const takenBy = (exceptId?: string) => modules.filter((x) => x.id !== exceptId).flatMap((x) => days.filter((d) => d >= x.start_day && d <= x.end_day));

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
            <form key={m.id} className="workshop-card editing" onSubmit={submitWith((fd) => run(() => updateSessionModule(sessionId, m.id, fd), () => setEditing(null)))}>
              <ModuleFields m={m} days={days} dayMinutes={dayMinutes} taken={takenBy(m.id)} />
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
                    onClick={async () => (await askConfirm(`Supprimer le module « ${m.name} » ?`)) && run(() => deleteSessionModule(sessionId, m.id))}
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
        <form className="workshop-card editing" onSubmit={submitWith((fd) => run(() => addSessionModule(sessionId, fd), () => setAdding(false)))}>
          <ModuleFields days={days} dayMinutes={dayMinutes} taken={takenBy()} />
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
  const router = useRouter();
  // Choix affiché tout de suite, confirmé ensuite par le serveur.
  const [local, setLocal] = useState<string[] | null>(null);
  const key = chosen.join(',');
  useEffect(() => setLocal(null), [key]);
  const current = local ?? chosen;
  const effective = current.length ? current : modules.map((m) => m.id);
  const full = effective.length === modules.length;

  // Clics rapides : seul le dernier choix est enregistré.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Clic : ce module seul (MA1 → MA2 directement) ; re-clic sur le module seul
   * choisi = session complète. Ctrl / Cmd + clic : plusieurs modules.
   */
  function toggle(id: string, multi: boolean) {
    const all = modules.map((m) => m.id);
    let next: string[];
    if (multi) {
      next = full ? [id] : effective.includes(id) ? effective.filter((x) => x !== id) : [...effective, id];
      if (!next.length) return;
    } else {
      next = !full && effective.length === 1 && effective[0] === id ? all : [id];
    }
    setError(null);
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const res = await setTraineeModules(sessionId, traineeId, next);
        if (!res.ok) {
          setError(res.error);
          setLocal(null);
        } else router.refresh();
      });
    }, 400);
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
            onClick={(e) => toggle(m.id, e.ctrlKey || e.metaKey)}
            title={`${m.name} : ${frDay(m.start_day)} · clic : ce module seul · Ctrl + clic : plusieurs`}
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
