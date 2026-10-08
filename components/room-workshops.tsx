'use client';

import { useState, useTransition } from 'react';
import { Wrench, Plus, Pencil, Trash2, GraduationCap } from 'lucide-react';
import { createWorkshop, updateWorkshop, deleteWorkshop, setRoomTemplates } from '@/app/salles/actions';

export type Workshop = { id: string; room_id: string; name: string };
type Room = { id: string; name: string; location: string | null };
type Template = { id: string; title: string; category: string | null };

/** Formations réalisables dans une salle : cases à cocher par dossier. */
function RoomTemplatesEditor({
  room,
  templates,
  selected,
  canEdit,
}: {
  room: Room;
  templates: Template[];
  selected: string[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState('');
  const sorted = [...templates].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  const names = sorted.filter((t) => selected.includes(t.id)).map((t) => t.title);
  // Filtre sans re-créer les cases (les cases masquées restent cochées dans le formulaire).
  const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const matches = (t: Template) => !filter || norm(t.title).includes(norm(filter));

  return (
    <div className="room-templates">
      <div className="panel-head" style={{ marginBottom: 6 }}>
        <span className="trainer-tag">
          <GraduationCap size={15} aria-hidden /> Formations réalisables
        </span>
        {canEdit && (
          <button className="small" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Fermer' : 'Choisir'}
          </button>
        )}
      </div>
      {!open && (
        <p className="hint" style={{ margin: 0 }}>
          {names.length ? names.join(' · ') : 'Aucune formation indiquée.'}
        </p>
      )}
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {canEdit && open && (
        <form
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const res = await setRoomTemplates(room.id, fd.getAll('template_ids').map(String));
              if (!res.ok) setError(res.error || 'Une erreur est survenue.');
              else setOpen(false);
            });
          }}
        >
          <p className="hint" style={{ margin: '4px 0 8px' }}>
            Coche les formations qu’on peut faire dans {room.name} : à la création d’une session, cette salle sera proposée
            en premier pour ces formations.
          </p>
          <input
            className="input"
            placeholder="Filtrer les formations…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filtrer les formations"
            style={{ marginBottom: 8, maxWidth: 280 }}
          />
          <div className="check-grid">
            {sorted.map((t) => (
              <label key={t.id} className="check-chip" hidden={!matches(t)}>
                <input type="checkbox" name="template_ids" value={t.id} defaultChecked={selected.includes(t.id)} />
                {t.title}
              </label>
            ))}
          </div>
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button type="submit" className="primary small" disabled={isPending}>
              {isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" className="small" onClick={() => setOpen(false)}>Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Ateliers et formations réalisables de chaque salle (page Salles). */
export function RoomWorkshops({
  rooms,
  workshops,
  roomTemplates,
  templates,
  canEdit,
}: {
  rooms: Room[];
  workshops: Workshop[];
  roomTemplates: { room_id: string; template_id: string }[];
  templates: Template[];
  canEdit: boolean;
}) {
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
      <h2><Wrench size={18} aria-hidden /> Ateliers et formations réalisables</h2>
      <p className="panel-intro">
        Pour chaque salle : ses ateliers et les formations qu’on peut y faire. Ils sont consultables sur le planning
        via le bouton <Wrench size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> à côté du nom de la salle.
      </p>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      <div className="workshop-rooms">
        {rooms.map((r) => {
          const list = workshops.filter((w) => w.room_id === r.id);
          return (
            <section key={r.id} className="workshop-room">
              <div className="panel-head" style={{ marginBottom: 8 }}>
                <h3>
                  {r.name} {r.location && <span className="hint">· {r.location}</span>}
                </h3>
              </div>

              <div className="workshop-line">
                <span className="trainer-tag"><Wrench size={15} aria-hidden /> Ateliers</span>
                {list.length === 0 && adding !== r.id && <span className="hint">Aucun atelier.</span>}
                {list.map((w) =>
                  editing === w.id ? (
                    <form key={w.id} className="inline-form" action={(fd) => run(() => updateWorkshop(w.id, fd), () => setEditing(null))}>
                      <input name="name" required defaultValue={w.name} aria-label="Nom de l’atelier" className="input" />
                      <button type="submit" className="primary small" disabled={isPending}>OK</button>
                      <button type="button" className="small" onClick={() => setEditing(null)}>Annuler</button>
                    </form>
                  ) : (
                    <span key={w.id} className="workshop-chip">
                      {w.name}
                      {canEdit && (
                        <>
                          <button className="icon ghost tiny" aria-label={`Renommer ${w.name}`} onClick={() => { setEditing(w.id); setAdding(null); }}>
                            <Pencil size={12} />
                          </button>
                          <button
                            className="icon ghost tiny"
                            aria-label={`Supprimer ${w.name}`}
                            disabled={isPending}
                            onClick={() => confirm(`Supprimer l’atelier « ${w.name} » ?`) && run(() => deleteWorkshop(w.id))}
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </span>
                  )
                )}
                {canEdit &&
                  (adding === r.id ? (
                    <form className="inline-form" action={(fd) => run(() => createWorkshop(r.id, fd), () => setAdding(null))}>
                      <input name="name" required autoFocus placeholder="Ex. Atelier électricité" aria-label="Nom de l’atelier" className="input" />
                      <button type="submit" className="primary small" disabled={isPending}>Ajouter</button>
                      <button type="button" className="small" onClick={() => setAdding(null)}>Annuler</button>
                    </form>
                  ) : (
                    <button className="small" onClick={() => { setAdding(r.id); setEditing(null); }}>
                      <Plus size={14} aria-hidden /> Atelier
                    </button>
                  ))}
              </div>

              <RoomTemplatesEditor
                room={r}
                templates={templates}
                selected={roomTemplates.filter((x) => x.room_id === r.id).map((x) => x.template_id)}
                canEdit={canEdit}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}
