'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateSessionDetails,
  addTraineeToSession,
  removeTraineeFromSession,
  setTraineeStatus,
} from '@/app/sessions/[id]/actions';
import { deleteSession } from '@/app/sessions/actions';

type Room = { id: string; name: string; capacity: number };
type Trainer = { id: string; full_name: string };
type Trainee = { id: string; full_name: string; email: string | null; company: string | null };
type EnrolledTrainee = Trainee & { status: 'validee' | 'en_attente' };

type SessionDetail = {
  id: string;
  title: string;
  reference: string | null;
  status: string;
  start_at: string;
  end_at: string;
  room_id: string;
  trainer_id: string | null;
  max_trainees: number | null;
  notes: string | null;
};

function toLocalInput(iso: string) {
  // "2026-09-29T08:30:00+00:00" -> "2026-09-29T08:30" pour <input type=datetime-local>
  return iso.slice(0, 16);
}

export function SessionDetailView({
  isAdmin,
  session,
  rooms,
  trainers,
  enrolled,
  allTrainees,
}: {
  isAdmin: boolean;
  session: SessionDetail;
  rooms: Room[];
  trainers: Trainer[];
  enrolled: EnrolledTrainee[];
  allTrainees: Trainee[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedTraineeId, setSelectedTraineeId] = useState('');

  const validated = enrolled.filter((t) => t.status === 'validee');
  const waiting = enrolled.filter((t) => t.status === 'en_attente');
  const capacity = session.max_trainees;
  const remaining = capacity != null ? Math.max(capacity - validated.length, 0) : null;
  const availableTrainees = allTrainees.filter((t) => !enrolled.some((e) => e.id === t.id));

  function handleUpdate(formData: FormData) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await updateSessionDetails(session.id, formData);
      if (result.ok) setNotice('Session mise à jour.');
      else setError(result.error);
    });
  }

  function handleAddTrainee(status: 'validee' | 'en_attente') {
    if (!selectedTraineeId) {
      setError('Choisis un stagiaire dans la liste.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addTraineeToSession(session.id, selectedTraineeId, status);
      if (!result.ok) setError(result.error);
      else setSelectedTraineeId('');
    });
  }

  function handleRemove(traineeId: string) {
    startTransition(async () => {
      const result = await removeTraineeFromSession(session.id, traineeId);
      if (!result.ok) setError(result.error);
    });
  }

  function handleStatusChange(traineeId: string, status: 'validee' | 'en_attente') {
    startTransition(async () => {
      const result = await setTraineeStatus(session.id, traineeId, status);
      if (!result.ok) setError(result.error);
    });
  }

  function handleDeleteSession() {
    if (!confirm('Supprimer définitivement cette session ?')) return;
    startTransition(async () => {
      const result = await deleteSession(session.id);
      if (result.ok) router.push('/sessions');
      else setError(result.error);
    });
  }

  return (
    <>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {notice && <div role="status" className="alert alert-success">{notice}</div>}

      <div className="panel">
        <h2>Informations</h2>
        <fieldset disabled={!isAdmin} style={{ border: 'none', padding: 0, margin: 0 }}>
          <form action={handleUpdate}>
            <div className="form-row">
              <label>
                Nom de la formation
                <input name="title" defaultValue={session.title} required />
              </label>
              <label>
                Référence
                <input name="reference" defaultValue={session.reference || ''} />
              </label>
              <label>
                Statut
                <select name="status" defaultValue={session.status}>
                  <option value="brouillon">Brouillon</option>
                  <option value="planifiee">Planifiée</option>
                  <option value="confirmee">Confirmée</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Salle
                <select name="room_id" defaultValue={session.room_id} required>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.capacity} places)</option>
                  ))}
                </select>
              </label>
              <label>
                Formateur
                <select name="trainer_id" defaultValue={session.trainer_id || ''}>
                  <option value="">—</option>
                  {trainers.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </label>
              <label>
                Max. stagiaires
                <input name="max_trainees" type="number" min={0} defaultValue={session.max_trainees ?? ''} />
              </label>
            </div>
            <div className="form-row">
              <label>
                Début
                <input name="start_at" type="datetime-local" defaultValue={toLocalInput(session.start_at)} required />
              </label>
              <label>
                Fin
                <input name="end_at" type="datetime-local" defaultValue={toLocalInput(session.end_at)} required />
              </label>
            </div>
            <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
              <label>
                Notes / informations complémentaires
                <textarea name="notes" rows={3} defaultValue={session.notes || ''} />
              </label>
            </div>
            {isAdmin && (
              <div className="row-actions">
                <button type="submit" className="primary" disabled={isPending}>
                  {isPending ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button type="button" className="danger" onClick={handleDeleteSession} disabled={isPending}>
                  Supprimer la session
                </button>
              </div>
            )}
          </form>
        </fieldset>
      </div>

      <div className="panel">
        <h2>Stagiaires</h2>
        <div className="counters">
          <div className="counter-chip">
            <strong>{validated.length}{capacity != null ? ` / ${capacity}` : ''}</strong>
            <span>validés</span>
          </div>
          <div className="counter-chip">
            <strong>{waiting.length}</strong>
            <span>en attente</span>
          </div>
          {remaining != null && (
            <div className="counter-chip">
              <strong>{remaining}</strong>
              <span>places restantes</span>
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="form-row" style={{ marginTop: 16, alignItems: 'end' }}>
            <label style={{ gridColumn: 'span 2' }}>
              Ajouter un stagiaire
              <select value={selectedTraineeId} onChange={(e) => setSelectedTraineeId(e.target.value)}>
                <option value="">Sélectionner…</option>
                {availableTrainees.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name}{t.company ? ` — ${t.company}` : ''}</option>
                ))}
              </select>
            </label>
            <div className="row-actions">
              <button type="button" onClick={() => handleAddTrainee('validee')} disabled={isPending}>+ Valider</button>
              <button type="button" onClick={() => handleAddTrainee('en_attente')} disabled={isPending}>+ En attente</button>
            </div>
          </div>
        )}

        <h3 className="sub-heading">Stagiaires validés</h3>
        {validated.length === 0 ? (
          <p className="empty">Aucun stagiaire validé pour l'instant.</p>
        ) : (
          <table className="data">
            <thead><tr><th>Nom</th><th>E-mail</th><th>Entreprise</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>
              {validated.map((t) => (
                <tr key={t.id}>
                  <td>{t.full_name}</td>
                  <td>{t.email || '—'}</td>
                  <td>{t.company || '—'}</td>
                  {isAdmin && (
                    <td className="row-actions">
                      <button onClick={() => handleStatusChange(t.id, 'en_attente')} disabled={isPending}>Mettre en attente</button>
                      <button className="danger" onClick={() => handleRemove(t.id)} disabled={isPending}>Retirer</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 className="sub-heading">Stagiaires en attente</h3>
        {waiting.length === 0 ? (
          <p className="empty">Aucun stagiaire en attente.</p>
        ) : (
          <table className="data">
            <thead><tr><th>Nom</th><th>E-mail</th><th>Entreprise</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>
              {waiting.map((t) => (
                <tr key={t.id}>
                  <td>{t.full_name}</td>
                  <td>{t.email || '—'}</td>
                  <td>{t.company || '—'}</td>
                  {isAdmin && (
                    <td className="row-actions">
                      <button className="primary" onClick={() => handleStatusChange(t.id, 'validee')} disabled={isPending}>Valider</button>
                      <button className="danger" onClick={() => handleRemove(t.id)} disabled={isPending}>Retirer</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
