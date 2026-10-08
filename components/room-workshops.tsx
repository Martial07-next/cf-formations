'use client';

import { useState, useTransition } from 'react';
import { Wrench, Plus, Pencil, Trash2 } from 'lucide-react';
import { createWorkshop, updateWorkshop, deleteWorkshop } from '@/app/salles/actions';

export type Workshop = { id: string; room_id: string; name: string; equipment: string | null; modules: string | null };
type Room = { id: string; name: string; location: string | null };

function WorkshopFields({ w }: { w?: Workshop }) {
  return (
    <div className="form-row">
      <label>
        Nom de l’atelier
        <input name="name" required defaultValue={w?.name || ''} placeholder="Ex. Atelier électricité" />
      </label>
      <label>
        Équipements
        <textarea name="equipment" rows={2} defaultValue={w?.equipment || ''} placeholder="Ex. 6 armoires électriques, banc de test…" />
      </label>
      <label>
        Modules réalisables
        <textarea name="modules" rows={2} defaultValue={w?.modules || ''} placeholder="Ex. Habilitation B0, BR, BC…" />
      </label>
    </div>
  );
}

/** Gestion des ateliers de chaque salle (page Salles). */
export function RoomWorkshops({ rooms, workshops, canEdit }: { rooms: Room[]; workshops: Workshop[]; canEdit: boolean }) {
  const [adding, setAdding] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error || 'Une erreur est survenue.');
      else after?.();
    });
  }

  return (
    <div className="panel">
      <h2><Wrench size={18} aria-hidden /> Ateliers et équipements par salle</h2>
      <p className="panel-intro">
        Chaque salle peut contenir plusieurs ateliers, avec leurs équipements et les modules qu’on peut y faire. Ils
        sont consultables sur le planning via le bouton <Wrench size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> à côté du nom de la salle.
      </p>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      <div className="workshop-rooms">
        {rooms.map((r) => {
          const list = workshops.filter((w) => w.room_id === r.id);
          return (
            <section key={r.id} className="workshop-room">
              <div className="panel-head" style={{ marginBottom: 8 }}>
                <h3>
                  {r.name} {r.location && <span className="hint">· {r.location}</span>}{' '}
                  <span className="badge brouillon">{list.length} atelier{list.length > 1 ? 's' : ''}</span>
                </h3>
                {canEdit && (
                  <button className="small" onClick={() => { setAdding(adding === r.id ? null : r.id); setEditing(null); }}>
                    <Plus size={14} aria-hidden /> Atelier
                  </button>
                )}
              </div>

              {list.length === 0 && adding !== r.id && <p className="hint">Aucun atelier enregistré.</p>}
              {list.map((w) =>
                editing === w.id ? (
                  <form key={w.id} className="workshop-card editing" action={(fd) => run(() => updateWorkshop(w.id, fd), () => setEditing(null))}>
                    <WorkshopFields w={w} />
                    <div className="row-actions">
                      <button type="submit" className="primary small" disabled={isPending}>Enregistrer</button>
                      <button type="button" className="small" onClick={() => setEditing(null)}>Annuler</button>
                    </div>
                  </form>
                ) : (
                  <div key={w.id} className="workshop-card">
                    <div>
                      <strong>{w.name}</strong>
                      {w.equipment && <p><span className="hint">Équipements :</span> {w.equipment}</p>}
                      {w.modules && <p><span className="hint">Modules :</span> {w.modules}</p>}
                    </div>
                    {canEdit && (
                      <div className="row-actions">
                        <button className="small icon ghost" aria-label={`Modifier ${w.name}`} onClick={() => { setEditing(w.id); setAdding(null); }}>
                          <Pencil size={14} />
                        </button>
                        <button
                          className="small icon danger"
                          aria-label={`Supprimer ${w.name}`}
                          disabled={isPending}
                          onClick={() => confirm(`Supprimer l’atelier « ${w.name} » ?`) && run(() => deleteWorkshop(w.id))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}

              {canEdit && adding === r.id && (
                <form className="workshop-card editing" action={(fd) => run(() => createWorkshop(r.id, fd), () => setAdding(null))}>
                  <WorkshopFields />
                  <div className="row-actions">
                    <button type="submit" className="primary small" disabled={isPending}>Ajouter l’atelier</button>
                    <button type="button" className="small" onClick={() => setAdding(null)}>Annuler</button>
                  </div>
                </form>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
