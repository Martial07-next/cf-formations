'use client';

import { searchTrainees } from '@/lib/trainee-search';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateSessionDetails,
  addTraineeToSession,
  setDayTrainers,
  removeTraineeFromSession,
  setTraineeStatus,
  setSessionDayTime,
  resetSessionDayTime,
  setTraineeCursus,
} from '@/app/sessions/[id]/actions';
import { deleteSession } from '@/app/sessions/actions';
import { PasteImport } from '@/components/paste-import';
import { SessionModulesPanel, TraineeModuleToggles } from '@/components/session-modules';
import type { SessionModule } from '@/lib/modules';
import { DigiformaPanel } from '@/components/digiforma-panel';
import { weekdaysBetween, effectiveDayTime, fullDateLabel, formatHours, type DayOverride } from '@/lib/week';
import { SessionForm, type FormRoom, type FormTrainer } from '@/components/session-form';
import { Trash2, AlertTriangle, Search, Link2, UserPlus, CheckCircle2, Lock, LockOpen, Settings2 } from 'lucide-react';
import { LinkRow } from '@/components/useful-links';
import { FontsKit } from '@/components/fonts-kit';
import type { LinkItem } from '@/lib/links';
import { ReservationsBox } from '@/components/reservations-box';
import { reservationStatus, type Reservation } from '@/lib/reservations';
import { AddedBy, FollowupCell, type TraineeTracking } from '@/components/tracking/session-tracking';
import type { Staff } from '@/lib/tracking';

type Trainee = { id: string; full_name: string; email: string | null; company: string | null };
type Cursus = 'initial' | 'recyclage';

/** Initial / recyclage d'un stagiaire : deux pastilles (un clic sur la pastille active l'efface). */
function CursusToggle({ value, canEdit, disabled, onChange }: { value: Cursus | null | undefined; canEdit: boolean; disabled: boolean; onChange: (v: Cursus | null) => void }) {
  if (!canEdit) return value ? <span className={`cursus-pill ${value} on`}>{value === 'initial' ? 'Initial' : 'Recyclage'}</span> : null;
  return (
    <span className="cursus-toggle" role="group" aria-label="Initial ou recyclage">
      {(['initial', 'recyclage'] as Cursus[]).map((c) => (
        <button
          key={c}
          type="button"
          className={`cursus-pill ${c}${value === c ? ' on' : ''}`}
          aria-pressed={value === c}
          disabled={disabled}
          onClick={() => onChange(value === c ? null : c)}
        >
          {c === 'initial' ? 'Initial' : 'Recyclage'}
        </button>
      ))}
    </span>
  );
}
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
  qualifiedTrainerIds = [],
  dayTrainerIds = {},
  focusDay = null,
  isAdmin,
  isNew = false,
  formationLinks = [],
  reservations = [],
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
  enrolled: serverEnrolled,
  allTrainees,
  dayOverrides,
  tracking = null,
  staff = [],
  cursus: serverCursus = null,
  started = false,
  sessionEnded = false,
  isAdminUser = false,
  workPanels = null,
}: {
  /** Formateurs habilités pour la formation (seuls proposés ; vide = tous). */
  qualifiedTrainerIds?: string[];
  /** Remplaçants par jour : jour → formateur. */
  dayTrainerIds?: Record<string, string>;
  /** Jour ouvert depuis le planning (changement de formateur ce jour-là). */
  focusDay?: string | null;
  /** La session a commencé : liste des stagiaires figée. */
  started?: boolean;
  sessionEnded?: boolean;
  /** Administrateur : peut corriger une liste figée. */
  isAdminUser?: boolean;
  /** Pendant / après la session : blocs utiles affichés juste après les stagiaires. */
  workPanels?: React.ReactNode;
  /** Initial / recyclage par stagiaire (migration 29) ; null si la migration manque. */
  cursus?: Record<string, Cursus | null> | null;
  /** Organisation interne (migration 24) : qui a inscrit, qui relance. */
  tracking?: Record<string, TraineeTracking> | null;
  staff?: Staff[];
  isAdmin: boolean;
  /** Session qui vient d'être créée : l'ajout des stagiaires passe en premier. */
  isNew?: boolean;
  /** Supports de cours et documents de la formation. */
  formationLinks?: LinkItem[];
  /** Places réservées par entreprise (sans les noms). */
  reservations?: Reservation[];
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
  // Transition propre aux stagiaires : n'affiche pas « Enregistrement… » sur le formulaire de la session.
  const [traineesPending, startTrainees] = useTransition();
  const [traineeQuery, setTraineeQuery] = useState('');
  // Ajout rapide : initial / recyclage choisi une fois, stagiaires ajoutés masqués tout de suite.
  const [addCursus, setAddCursus] = useState<Cursus>('initial');
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const [unlocked, setUnlocked] = useState(false);
  const locked = started && !unlocked;
  // Inscriptions modifiables : bureau / admin, tant que la session n'a pas commencé.
  const canManageTrainees = isAdmin && !locked;

  // Affichage instantané : chaque ajout, retrait, changement de statut ou de
  // cursus s'applique tout de suite à l'écran, sans attendre le rechargement
  // des données du serveur (qui confirme ensuite).
  const [localAdds, setLocalAdds] = useState<Record<string, EnrolledTrainee>>({});
  const [localStatus, setLocalStatus] = useState<Record<string, 'validee' | 'en_attente'>>({});
  const [localRemoved, setLocalRemoved] = useState<Set<string>>(new Set());
  const [localCursus, setLocalCursus] = useState<Record<string, Cursus | null>>({});
  useEffect(() => {
    const ids = new Set(serverEnrolled.map((t) => t.id));
    setLocalAdds((a) => Object.fromEntries(Object.entries(a).filter(([id]) => !ids.has(id))));
    setLocalStatus((s) => Object.fromEntries(Object.entries(s).filter(([id, st]) => serverEnrolled.find((t) => t.id === id)?.status !== st)));
    setLocalRemoved((r) => new Set([...r].filter((id) => ids.has(id))));
  }, [serverEnrolled]);
  useEffect(() => {
    setLocalCursus((c) => Object.fromEntries(Object.entries(c).filter(([id, v]) => (serverCursus?.[id] ?? null) !== v)));
  }, [serverCursus]);
  const enrolled: EnrolledTrainee[] = [
    ...serverEnrolled.map((t) => (localStatus[t.id] ? { ...t, status: localStatus[t.id] } : t)),
    ...Object.values(localAdds).filter((t) => !serverEnrolled.some((s) => s.id === t.id)),
  ].filter((t) => !localRemoved.has(t.id));
  const cursus = serverCursus ? { ...serverCursus, ...localCursus } : null;

  const validated = enrolled.filter((t) => t.status === 'validee');
  const waiting = enrolled.filter((t) => t.status === 'en_attente');
  const capacity = session.max_trainees;
  // Places réservées par entreprise sans les noms (comptées dans la capacité).
  const resa = reservationStatus(reservations, validated.map((t) => t.company));
  const occupied = validated.length + resa.unnamed;
  const remaining = capacity != null ? capacity - occupied : null;
  const overCapacity = capacity != null && occupied > capacity;
  const enrolledIds = new Set(enrolled.map((e) => e.id));
  // Fiche stagiaire (base de données) : réservée à l'équipe, simple nom pour le formateur.
  const traineeName = (t: { id: string; full_name: string }) =>
    isAdmin ? <a href={`/stagiaires/${t.id}`}>{t.full_name}</a> : <strong>{t.full_name}</strong>;
  // Recherche rapide (nom, prénom dans n'importe quel ordre, entreprise), 8 résultats les plus pertinents.
  const matches =
    traineeQuery.trim().length < 2
      ? []
      : searchTrainees(allTrainees.filter((t) => !enrolledIds.has(t.id) && !justAdded.has(t.id)), traineeQuery, 8);

  const traineeBlock = (
    <>
      {canManageTrainees && <PasteImport sessionId={session.id} recyclage={Boolean(cursus)} />}
      {canManageTrainees && digiformaEnabled && <DigiformaPanel sessionId={session.id} digiformaRef={session.digiforma_ref || ''} />}

      <div className={`panel${locked ? ' trainees-locked' : ''}`}>
        <div className="panel-head">
          <h2 id="stagiaires">Stagiaires</h2>
          {started && (
            <span className="row-actions">
              {locked ? (
                <span className="badge brouillon"><Lock size={12} aria-hidden /> Liste figée</span>
              ) : (
                <span className="badge indisponible"><LockOpen size={12} aria-hidden /> Correction en cours</span>
              )}
              {isAdminUser && (
                <button type="button" className="small" onClick={() => setUnlocked((v) => !v)}>
                  {locked ? <><LockOpen size={14} aria-hidden /> Corriger la liste</> : <><Lock size={14} aria-hidden /> Refiger</>}
                </button>
              )}
            </span>
          )}
        </div>
        {started && (
          <p className="panel-intro">
            {locked
              ? `La session a commencé${sessionEnded ? ' (terminée)' : ''} : la liste des stagiaires est figée. Plus d’ajout, de retrait ni de modification${isAdminUser ? ' (l’administrateur peut corriger une erreur avec « Corriger la liste »)' : ''}.`
              : 'Mode correction (administrateur) : chaque changement est noté dans l’historique de la session.'}
          </p>
        )}
        {overCapacity && (
          <div role="alert" className="alert alert-warning">
            <AlertTriangle size={16} aria-hidden /> Capacité dépassée : {occupied} places occupées
            {resa.unnamed > 0 ? ` (dont ${resa.unnamed} réservée${resa.unnamed > 1 ? 's' : ''} sans nom)` : ''} pour {capacity} places prévues.
          </div>
        )}
        <div className="counters">
          <div className="counter-chip">
            <strong>{validated.length}{capacity != null ? ` / ${capacity}` : ''}</strong>
            <span>validés</span>
          </div>
          {resa.unnamed > 0 && (
            <div className="counter-chip">
              <strong>{resa.unnamed}</strong>
              <span>réservée{resa.unnamed > 1 ? 's' : ''} sans nom</span>
            </div>
          )}
          {!locked && (
            <div className="counter-chip">
              <strong>{waiting.length}</strong>
              <span>en attente</span>
            </div>
          )}
          {cursus && validated.some((t) => cursus[t.id]) && (
            <div className="counter-chip">
              <strong>{validated.filter((t) => cursus[t.id] === 'initial').length} · {validated.filter((t) => cursus[t.id] === 'recyclage').length}</strong>
              <span>initial · recyclage</span>
            </div>
          )}
          {remaining != null && !locked && (
            <div className={`counter-chip${remaining < 0 ? ' over' : ''}`}>
              <strong>{remaining}</strong>
              <span>places restantes</span>
            </div>
          )}
        </div>

        <ReservationsBox
          sessionId={session.id}
          rows={resa.rows}
          companies={[...new Set(allTrainees.map((t) => t.company).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'fr'))}
          canEdit={canManageTrainees}
        />

        {canManageTrainees && (
          <div className="trainee-search" style={{ marginTop: 16 }}>
            <div className="trainee-add-bar">
              <label className="search" style={{ maxWidth: 420, flex: 1 }}>
                <Search size={15} aria-hidden />
                <span className="sr-only">Rechercher un stagiaire à ajouter</span>
                <input
                  ref={searchRef}
                  placeholder="Ajouter un stagiaire : tape son nom… (Entrée = valider le 1er)"
                  value={traineeQuery}
                  onChange={(e) => setTraineeQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && matches[0]) {
                      e.preventDefault();
                      handleAddTrainee(matches[0].id, 'validee');
                    }
                  }}
                />
              </label>
              {cursus && (
                <span className="cursus-toggle add-cursus" role="group" aria-label="Inscrire en initial ou en recyclage">
                  <span className="hint">Inscrire en</span>
                  {(['initial', 'recyclage'] as Cursus[]).map((c) => (
                    <button key={c} type="button" className={`cursus-pill ${c}${addCursus === c ? ' on' : ''}`} aria-pressed={addCursus === c} onClick={() => setAddCursus(c)}>
                      {c === 'initial' ? 'Initial' : 'Recyclage'}
                    </button>
                  ))}
                </span>
              )}
            </div>
            {matches.length > 0 && (
              <div className="trainee-results">
                {matches.map((t) => (
                  <div key={t.id} className="trainee-result">
                    <span>
                      <strong>{t.full_name}</strong>
                      {t.company && <span className="hint"> · {t.company}</span>}
                    </span>
                    <span className="row-actions">
                      <button type="button" className="small primary" onClick={() => handleAddTrainee(t.id, 'validee')}>
                        + Valider{cursus ? ` (${addCursus === 'initial' ? 'initial' : 'recyclage'})` : ''}
                      </button>
                      <button type="button" className="small" onClick={() => handleAddTrainee(t.id, 'en_attente')}>+ En attente</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {traineeQuery.trim().length >= 2 && matches.length === 0 && (
              <p className="hint">Aucun stagiaire trouvé : ajoute-le avec « Coller une liste » ci-dessus, ou importe ton fichier Excel depuis la page Stagiaires.</p>
            )}
          </div>
        )}

        <div className="cursus-head">
          <h3 className="sub-heading">Stagiaires validés</h3>
          {cursus && canManageTrainees && validated.length > 1 && (
            <span className="row-actions">
              <span className="hint">Tous en :</span>
              <button type="button" className="small cursus-pill initial" disabled={traineesPending} onClick={() => handleCursus(validated.map((t) => t.id), 'initial')}>Initial</button>
              <button type="button" className="small cursus-pill recyclage" disabled={traineesPending} onClick={() => handleCursus(validated.map((t) => t.id), 'recyclage')}>Recyclage</button>
            </span>
          )}
        </div>
        {validated.length === 0 ? (
          <p className="empty">Aucun stagiaire validé pour l'instant.</p>
        ) : (
          <table className="data">
            <thead><tr><th>Nom</th>{modules.length > 0 && <th>Modules suivis</th>}<th>E-mail</th><th>Entreprise</th>{canManageTrainees && <th></th>}</tr></thead>
            <tbody>
              {validated.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className="name-cursus">
                      {traineeName(t)}
                      {cursus && <CursusToggle value={cursus[t.id]} canEdit={canManageTrainees} disabled={false} onChange={(v) => handleCursus([t.id], v)} />}
                    </span>
                    <AddedBy t={tracking?.[t.id]} staff={staff} />
                  </td>
                  {modules.length > 0 && (
                    <td>
                      <TraineeModuleToggles
                        sessionId={session.id}
                        traineeId={t.id}
                        modules={modules}
                        chosen={traineeModules[t.id] || []}
                        canEdit={canManageTrainees}
                      />
                    </td>
                  )}
                  <td>{t.email || '-'}</td>
                  <td>{t.company || '-'}</td>
                  {canManageTrainees && (
                    <td className="row-actions">
                      <button className="small" onClick={() => handleStatusChange(t.id, 'en_attente')}>Mettre en attente</button>
                      <button className="danger small" onClick={() => handleRemove(t.id)}>Retirer</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {locked ? (
          waiting.length > 0 && (
            <details className="waiting-locked">
              <summary className="hint">{waiting.length} stagiaire{waiting.length > 1 ? 's' : ''} resté{waiting.length > 1 ? 's' : ''} en attente (non inscrit{waiting.length > 1 ? 's' : ''} à la session)</summary>
              <ul>{waiting.map((t) => <li key={t.id}>{traineeName(t)}{t.company ? ` · ${t.company}` : ''}</li>)}</ul>
            </details>
          )
        ) : (<>
        <h3 className="sub-heading">Stagiaires en attente</h3>
        {waiting.length === 0 ? (
          <p className="empty">Aucun stagiaire en attente.</p>
        ) : (
          <table className="data">
            <thead><tr><th>Nom</th>{modules.length > 0 && <th>Modules suivis</th>}<th>E-mail</th><th>Entreprise</th>{tracking && <th>Suivi des relances</th>}{canManageTrainees && <th></th>}</tr></thead>
            <tbody>
              {waiting.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className="name-cursus">
                      {traineeName(t)}
                      {cursus && <CursusToggle value={cursus[t.id]} canEdit={canManageTrainees} disabled={false} onChange={(v) => handleCursus([t.id], v)} />}
                    </span>
                    <AddedBy t={tracking?.[t.id]} staff={staff} />
                  </td>
                  {modules.length > 0 && (
                    <td>
                      <TraineeModuleToggles
                        sessionId={session.id}
                        traineeId={t.id}
                        modules={modules}
                        chosen={traineeModules[t.id] || []}
                        canEdit={canManageTrainees}
                      />
                    </td>
                  )}
                  <td>{t.email || '-'}</td>
                  <td>{t.company || '-'}</td>
                  {tracking && (
                    <td><FollowupCell sessionId={session.id} traineeId={t.id} t={tracking[t.id]} staff={staff} canManage={canManageTrainees} /></td>
                  )}
                  {canManageTrainees && (
                    <td className="row-actions">
                      <button className="primary small" onClick={() => handleStatusChange(t.id, 'validee')}>Valider</button>
                      <button className="danger small" onClick={() => handleRemove(t.id)}>Retirer</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </>)}
      </div>
    </>
  );

  function handleUpdate(formData: FormData) {
    setError(null);
    setNotice(null);
    // Formateur changé pour un seul jour (pas le premier) : la session garde
    // son formateur, ce jour-là seulement est confié au formateur choisi.
    const day = String(formData.get('trainer_day') || '');
    const dayTrainer = String(formData.get('day_trainer_id') || '');
    const newPrincipal = String(formData.get('trainer_id') || '');
    startTransition(async () => {
      const result = await updateSessionDetails(session.id, formData);
      if (!result.ok) return setError(result.error);
      if (day) {
        const back = !dayTrainer || dayTrainer === newPrincipal;
        const r = await setDayTrainers(session.id, [day], back ? null : dayTrainer);
        if (!r.ok) return setError(r.error);
        const label = new Date(day + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
        setNotice(back ? `Session mise à jour · le ${label} revient au formateur principal.` : `Session mise à jour · formateur changé pour le ${label} uniquement.`);
      } else {
        // Premier jour / toute la formation : nouveau formateur sur tous les jours.
        const replaced = Object.keys(dayTrainerIds);
        if ((newPrincipal || null) !== (session.trainer_id || null) && replaced.length) {
          const r = await setDayTrainers(session.id, replaced, null);
          if (!r.ok) return setError(r.error);
        }
        setNotice('Session mise à jour.');
      }
      router.refresh();
    });
  }

  function handleAddTrainee(traineeId: string, status: 'validee' | 'en_attente') {
    setError(null);
    // Ajout immédiat à l'écran ; on peut enchaîner le stagiaire suivant sans attendre.
    setJustAdded((s) => new Set(s).add(traineeId));
    const base = allTrainees.find((t) => t.id === traineeId);
    if (base) setLocalAdds((a) => ({ ...a, [traineeId]: { ...base, status } }));
    setLocalRemoved((r) => {
      const n = new Set(r);
      n.delete(traineeId);
      return n;
    });
    if (cursus) setLocalCursus((c) => ({ ...c, [traineeId]: addCursus }));
    setTraineeQuery('');
    searchRef.current?.focus();
    startTrainees(async () => {
      const result = await addTraineeToSession(session.id, traineeId, status, cursus ? addCursus : null);
      if (!result.ok) {
        setError(result.error);
        setJustAdded((s) => {
          const n = new Set(s);
          n.delete(traineeId);
          return n;
        });
        setLocalAdds((a) => {
          const { [traineeId]: _, ...rest } = a;
          return rest;
        });
      } else router.refresh();
    });
  }

  function handleCursus(ids: string[], value: Cursus | null) {
    setLocalCursus((c) => ({ ...c, ...Object.fromEntries(ids.map((id) => [id, value])) }));
    startTrainees(async () => {
      const result = await setTraineeCursus(session.id, ids, value);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function handleRemove(traineeId: string) {
    setLocalRemoved((r) => new Set(r).add(traineeId));
    setJustAdded((s) => {
      const n = new Set(s);
      n.delete(traineeId);
      return n;
    });
    startTrainees(async () => {
      const result = await removeTraineeFromSession(session.id, traineeId);
      if (!result.ok) {
        setError(result.error);
        setLocalRemoved((r) => {
          const n = new Set(r);
          n.delete(traineeId);
          return n;
        });
      }
      else router.refresh();
    });
  }

  function handleStatusChange(traineeId: string, status: 'validee' | 'en_attente') {
    const before = enrolled.find((t) => t.id === traineeId)?.status;
    setLocalStatus((s) => ({ ...s, [traineeId]: status }));
    startTrainees(async () => {
      const result = await setTraineeStatus(session.id, traineeId, status);
      if (!result.ok) {
        setError(result.error);
        if (before) setLocalStatus((s) => ({ ...s, [traineeId]: before }));
      }
      else router.refresh();
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

      {isNew && (
        <>
          <div className="next-step" role="status">
            <h2><CheckCircle2 size={17} aria-hidden style={{ verticalAlign: '-3px' }} /> Session créée</h2>
            <p style={{ margin: 0 }}>
              <UserPlus size={15} aria-hidden style={{ verticalAlign: '-2px' }} /> Étape suivante : ajoute les stagiaires (recherche ou liste collée). Les informations de la session sont plus bas.
            </p>
            <div className="row-actions">
              <button type="button" className="small" onClick={() => router.replace(`/sessions/${session.id}`, { scroll: false })}>
                Masquer ce message
              </button>
            </div>
          </div>
          {traineeBlock}
        </>
      )}

      {/* Supports de cours : toujours avec les polices à installer. */}
      <div className="panel">
        <h2><Link2 size={18} aria-hidden /> Supports et documents de la formation</h2>
        <FontsKit compact />
        {formationLinks.length > 0 ? (
          <div className="link-grid">
            {formationLinks.map((l) => <LinkRow key={l.id} link={l} />)}
          </div>
        ) : (
          <p className="hint" style={{ margin: 0 }}>Aucun support enregistré pour cette formation (Formations › Modifier › Supports de cours).</p>
        )}
      </div>

      {started ? (
        <>
          {traineeBlock}
          {workPanels}
          <details className="panel session-infos-fold">
            <summary>
              <Settings2 size={16} aria-hidden /> <strong>Informations, horaires et modules</strong>
              <span className="hint"> · salle, formateur, dates, horaires par jour</span>
            </summary>
            <div className="session-infos-body">
      <div className="panel" id="infos">
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
          sessionId={session.id}
          showTemplate={false}
          disabled={!canEditSession}
          rooms={rooms}
          trainers={trainers}
          templates={[]}
          trainerDays={{ principalId: session.trainer_id, dayTrainers: dayTrainerIds, initialDay: focusDay }}
          qualifiedTrainerIds={qualifiedTrainerIds}
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

            </div>
          </details>
        </>
      ) : (
        <>
      <div className="panel" id="infos">
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
          sessionId={session.id}
          showTemplate={false}
          disabled={!canEditSession}
          rooms={rooms}
          trainers={trainers}
          templates={[]}
          trainerDays={{ principalId: session.trainer_id, dayTrainers: dayTrainerIds, initialDay: focusDay }}
          qualifiedTrainerIds={qualifiedTrainerIds}
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

          {!isNew && traineeBlock}
          {workPanels}
        </>
      )}
    </>
  );
}

function DayTimesPanel({
  isAdmin,
  ownTrainer,
  startOnly = false,
  sessionId,
  startAt,
  endAt,
  overrides,
}: {
  isAdmin: boolean;
  ownTrainer: boolean;
  /** Référent cadre : heure de début seulement. */
  startOnly?: boolean;
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
          ? `Tu peux changer l’heure de ${startOnly ? 'début' : 'début et de fin'} de chaque jour. Les autres informations de la session sont gérées par le bureau administratif.`
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
              startOnly={startOnly}
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
