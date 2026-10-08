'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateSessionDetails,
  addTraineeToSession,
  removeTraineeFromSession,
  setTraineeStatus,
  setSessionDayTime,
  resetSessionDayTime,
} from '@/app/sessions/[id]/actions';
import { deleteSession } from '@/app/sessions/actions';
import { CsvImportTrainees } from '@/components/csv-import';
import { PasteImport } from '@/components/paste-import';
import { SessionModulesPanel, TraineeModuleToggles } from '@/components/session-modules';
import type { SessionModule } from '@/lib/modules';
import { DigiformaPanel } from '@/components/digiforma-panel';
import { weekdaysBetween, effectiveDayTime, fullDateLabel, formatHours, type DayOverride } from '@/lib/week';
import { SessionForm, type FormRoom, type FormTrainer } from '@/components/session-form';
import { Trash2, AlertTriangle } from 'lucide-react';

type Trainee = { id: string; full_name: string; email: string | null; company: string | null };
type EnrolledTrainee = Trainee & { status: 'validee' | 'en_attente' };

type SessionDetail = {
  id: string;
  title: string;
  status: string;
  start_at: string;
  end_at: string;
  room_id: string;
  trainer_id: string | null;
  max_trainees: number | null;
  notes: string | null;
  digiforma_ref: string | null;
};

export function SessionDetailView({
  isAdmin,
  session,
  template,
  digiformaEnabled,
  isOwnTrainer = false,
  canEditSession = false,
  canEditStartTimes = false,
  modules = [],
  traineeModules = {},
  rooms,
  trainers,
  enrolled,
  allTrainees,
  dayOverrides,
}: {
  isAdmin: boolean;
  session: SessionDetail;
  digiformaEnabled: boolean;
  /** Le formateur connecté anime cette session : il peut ajuster ses horaires. */
  isOwnTrainer?: boolean;
  /** Peut modifier la session (bureau, admin, référent cadre) ; isAdmin = gestion complète. */
  canEditSession?: boolean;
  /** Référent cadre : peut seulement changer l'heure de début, jour par jour. */
  canEditStartTimes?: boolean;
  modules?: SessionModule[];
  traineeModules?: Record<string, string[]>;
  template: { title: string; category: string | null; duration_hours: number } | null;
  rooms: FormRoom[];
  trainers: FormTrainer[];
  enrolled: EnrolledTrainee[];
  allTrainees: Trainee[];
  dayOverrides: DayOverride[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedTraineeId, setSelectedTraineeId] = useState('');

  const validated = enrolled.filter((t) => t.status === 'validee');
  const waiting = enrolled.filter((t) => t.status === 'en_attente');
  const capacity = session.max_trainees;
  const remaining = capacity != null ? capacity - validated.length : null;
  const overCapacity = capacity != null && validated.length > capacity;
  const availableTrainees = allTrainees.filter((t) => !enrolled.some((e) => e.id === t.id));

  function handleUpdate(formData: FormData) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await updateSessionDetails(session.id, formData);
      if (result.ok) {
        setNotice('Session mise à jour.');
        router.refresh();
      }
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
        <div className="panel-head">
          <h2>Informations</h2>
          {template && (
            <span className="hint">
              Catalogue : {template.category ? `${template.category} › ` : ''}{template.title} · {formatHours(Number(template.duration_hours))}
            </span>
          )}
        </div>
        <SessionForm
          formId="session-edit-form"
          showTemplate={false}
          disabled={!canEditSession}
          rooms={rooms}
          trainers={trainers}
          templates={[]}
          defaults={{
            title: session.title,
            room_id: session.room_id,
            trainer_id: session.trainer_id,
            status: session.status,
            max_trainees: session.max_trainees,
            notes: session.notes,
            start_date: session.start_at.slice(0, 10),
            end_date: session.end_at.slice(0, 10),
            start_time: session.start_at.slice(11, 16),
            end_time: session.end_at.slice(11, 16),
          }}
          onSubmit={handleUpdate}
        />
        {canEditSession && (
          <div className="form-actions">
            <button type="submit" form="session-edit-form" className="primary" disabled={isPending}>
              {isPending ? 'Enregistrement…' : 'Enregistrer les modifications'}
            </button>
            <span className="spacer" style={{ flex: 1 }} />
            {isAdmin && <button type="button" className="danger" onClick={handleDeleteSession} disabled={isPending}>
              <Trash2 size={15} aria-hidden /> Supprimer la session
            </button>}
          </div>
        )}
      </div>

      <DayTimesPanel
        isAdmin={canEditSession || canEditStartTimes || isOwnTrainer}
        ownTrainer={!canEditSession && (canEditStartTimes || isOwnTrainer)}
        sessionId={session.id}
        startAt={session.start_at}
        endAt={session.end_at}
        overrides={dayOverrides}
      />

      <SessionModulesPanel
        sessionId={session.id}
        startAt={session.start_at}
        endAt={session.end_at}
        modules={modules}
        traineeModules={traineeModules}
        validatedIds={validated.map((t) => t.id)}
        canEdit={isAdmin}
      />

      {isAdmin && <PasteImport sessionId={session.id} />}
      {isAdmin && digiformaEnabled && <DigiformaPanel sessionId={session.id} digiformaRef={session.digiforma_ref || ''} />}
      {isAdmin && <CsvImportTrainees sessionId={session.id} />}

      <div className="panel">
        <h2>Stagiaires</h2>
        {overCapacity && (
          <div role="alert" className="alert alert-warning">
            <AlertTriangle size={16} aria-hidden /> Capacité dépassée : {validated.length} stagiaires validés pour {capacity} places prévues.
          </div>
        )}
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
            <div className={`counter-chip${remaining < 0 ? ' over' : ''}`}>
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
                  <option key={t.id} value={t.id}>{t.full_name}{t.company ? ` (${t.company})` : ''}</option>
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
            <thead><tr><th>Nom</th>{modules.length > 0 && <th>Modules suivis</th>}<th>E-mail</th><th>Entreprise</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>
              {validated.map((t) => (
                <tr key={t.id}>
                  <td><a href={`/stagiaires/${t.id}`}>{t.full_name}</a></td>
                  {modules.length > 0 && (
                    <td>
                      <TraineeModuleToggles
                        sessionId={session.id}
                        traineeId={t.id}
                        modules={modules}
                        chosen={traineeModules[t.id] || []}
                        canEdit={isAdmin}
                      />
                    </td>
                  )}
                  <td>{t.email || '-'}</td>
                  <td>{t.company || '-'}</td>
                  {isAdmin && (
                    <td className="row-actions">
                      <button className="small" onClick={() => handleStatusChange(t.id, 'en_attente')} disabled={isPending}>Mettre en attente</button>
                      <button className="danger small" onClick={() => handleRemove(t.id)} disabled={isPending}>Retirer</button>
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
            <thead><tr><th>Nom</th>{modules.length > 0 && <th>Modules suivis</th>}<th>E-mail</th><th>Entreprise</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>
              {waiting.map((t) => (
                <tr key={t.id}>
                  <td><a href={`/stagiaires/${t.id}`}>{t.full_name}</a></td>
                  {modules.length > 0 && (
                    <td>
                      <TraineeModuleToggles
                        sessionId={session.id}
                        traineeId={t.id}
                        modules={modules}
                        chosen={traineeModules[t.id] || []}
                        canEdit={isAdmin}
                      />
                    </td>
                  )}
                  <td>{t.email || '-'}</td>
                  <td>{t.company || '-'}</td>
                  {isAdmin && (
                    <td className="row-actions">
                      <button className="primary small" onClick={() => handleStatusChange(t.id, 'validee')} disabled={isPending}>Valider</button>
                      <button className="danger small" onClick={() => handleRemove(t.id)} disabled={isPending}>Retirer</button>
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

function DayTimesPanel({
  isAdmin,
  ownTrainer,
  sessionId,
  startAt,
  endAt,
  overrides,
}: {
  isAdmin: boolean;
  ownTrainer: boolean;
  sessionId: string;
  startAt: string;
  endAt: string;
  overrides: DayOverride[];
}) {
  const weekdays = weekdaysBetween(startAt, endAt);
  const days = weekdays.length ? weekdays : [startAt.slice(0, 10)];
  // Session d'une journée : panneau utile seulement à qui peut modifier les horaires.
  if (days.length < 2 && !isAdmin) return null;

  return (
    <div className="panel">
      <h2>Horaires par jour</h2>
      <p className="panel-intro">
        {ownTrainer
          ? 'Tu peux changer l’heure de début de chaque jour. Les autres informations de la session sont gérées par le bureau administratif.'
          : 'Par défaut, chaque jour reprend l’horaire global de la session. Modifie une ligne pour donner un horaire différent à ce jour précis.'}
      </p>
      <table className="data">
        <thead>
          <tr><th>Jour</th><th>Début</th><th>Fin</th>{isAdmin && <th></th>}</tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <DayTimeRow
              key={day}
              sessionId={sessionId}
              day={day}
              startAt={startAt}
              endAt={endAt}
              overrides={overrides}
              isAdmin={isAdmin}
              startOnly={ownTrainer}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayTimeRow({
  sessionId,
  day,
  startAt,
  endAt,
  overrides,
  isAdmin,
  startOnly = false,
}: {
  sessionId: string;
  day: string;
  startAt: string;
  endAt: string;
  overrides: DayOverride[];
  isAdmin: boolean;
  startOnly?: boolean;
}) {
  const effective = effectiveDayTime(day, startAt, endAt, overrides);
  const label = fullDateLabel(new Date(day + 'T00:00:00Z'));
  const hasOverride = overrides.some((o) => o.day === day);
  const [start, setStart] = useState(effective.start);
  const [end, setEnd] = useState(effective.end);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setSessionDayTime(sessionId, day, start, end);
      if (!result.ok) setError(result.error);
    });
  }

  function reset() {
    startTransition(async () => {
      await resetSessionDayTime(sessionId, day);
    });
  }

  return (
    <tr>
      <td style={{ fontWeight: 700 }}>{label}</td>
      <td>
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={!isAdmin} className="input" aria-label={`Début, ${label}`} />
      </td>
      <td>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={!isAdmin || startOnly} className="input" aria-label={`Fin, ${label}`} />
      </td>
      {isAdmin && (
        <td className="row-actions">
          <button className="small" onClick={save} disabled={isPending}>{isPending ? '…' : 'Enregistrer'}</button>
          {hasOverride && <button className="small ghost" onClick={reset} disabled={isPending}>Réinitialiser</button>}
          {error && <span style={{ color: 'var(--cf-red-ink)', fontSize: 12 }}>{error}</span>}
        </td>
      )}
    </tr>
  );
}
