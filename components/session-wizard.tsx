'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardPaste,
  ExternalLink,
  Layers,
  Link2,
  Loader2,
  Plus,
  Scissors,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { SessionForm, type FormTemplate, type SessionFormDefaults } from '@/components/session-form';
import { PasteImport } from '@/components/paste-import';
import { ModuleDays } from '@/components/module-days';
import { createSession, updateSessionStatus } from '@/app/sessions/actions';
import {
  addReservation,
  addSessionModule,
  addTraineeToSession,
  deleteSessionModule,
  removeTraineeFromSession,
  setDigiformaDocsUrl,
  setTraineeModules,
  setTraineeStatus,
  splitSessionByDay,
} from '@/app/sessions/[id]/actions';
import { searchTrainees, wizardState, type WizardState } from '@/app/sessions/wizard-actions';
import { formatHours } from '@/lib/week';
import type { Absence } from '@/lib/absences';

type Res = { ok: true; notice?: string; id?: string } | { ok: false; error: string };

const STEPS = [
  { key: 'infos', label: 'Informations', icon: CalendarDays },
  { key: 'modules', label: 'Modules', icon: Layers },
  { key: 'stagiaires', label: 'Stagiaires', icon: Users },
  { key: 'final', label: 'Finaliser', icon: CheckCircle2 },
] as const;
type Step = 0 | 1 | 2 | 3;

const fr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const dayLabel = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Création d'une session en 4 étapes (planning) :
 *  1. Informations (formation, dates, salle, formateur) → la session est créée ;
 *  2. Modules : ceux du catalogue, sinon proposition d'en ajouter (ou un par jour) ;
 *  3. Stagiaires : recherche, liste collée, places réservées par entreprise ;
 *  4. Finaliser : lien Digiforma (session 100 % dématérialisée), statut, récapitulatif.
 * Chaque étape s'enregistre aussitôt : fermer en cours de route garde ce qui est fait.
 */
export function SessionWizard({
  open,
  rooms,
  trainers,
  templates,
  absences,
  defaults,
  onClose,
  onCreated,
}: {
  open: boolean;
  rooms: any[];
  trainers: any[];
  templates: FormTemplate[];
  absences: Absence[];
  defaults: SessionFormDefaults;
  onClose: () => void;
  /** Session créée (étape 1) : la fiche s'ouvre à la fermeture, quelle qu'elle soit. */
  onCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [state, setState] = useState<WizardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [skippedModules, setSkippedModules] = useState(false);
  const [pending, start] = useTransition();
  const [formKey, setFormKey] = useState(0);

  // Nouvelle ouverture : assistant remis à zéro.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setState(null);
    setError(null);
    setNotice(null);
    setSkippedModules(false);
    setFormKey((k) => k + 1);
  }, [open]);

  async function reload(id = state?.id) {
    if (!id) return null;
    const res = await wizardState(id);
    if (res.ok) setState(res.state);
    else setError(res.error);
    return res.ok ? res.state : null;
  }
  function run(fn: () => Promise<Res>, after?: (r: Res) => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error);
      if ('notice' in r && r.notice) setNotice(r.notice);
      await reload();
      after?.(r);
    });
  }

  function create(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await createSession(fd);
      if (!res.ok) return setError(res.error);
      if (res.id) onCreated?.(res.id);
      const st = await reload(res.id);
      // Modules déjà prévus par la formation du catalogue : on passe directement aux stagiaires.
      setStep(st && st.modules.length ? 2 : 1);
    });
  }

  const done = (i: number) => (i === 0 ? Boolean(state) : i === 1 ? Boolean(state && (state.modules.length || skippedModules)) : i === 2 ? Boolean(state?.trainees.length) : false);

  return (
    <>
      <div className="modal-head wiz-head">
        <div>
          <h2 id="new-session-title">{state ? state.title : 'Nouvelle session'}</h2>
          {state && (
            <small className="hint">
              {state.start_at.slice(0, 10) === state.end_at.slice(0, 10) ? fr(state.start_at) : `du ${fr(state.start_at)} au ${fr(state.end_at)}`} · {formatHours(state.hours)}
              {state.room ? ` · ${state.room}` : ''}
              {state.trainer ? ` · ${state.trainer}` : ''}
            </small>
          )}
        </div>
        <button
          className="icon ghost"
          onClick={() => (state ? window.location.assign(`/sessions/${state.id}?nouvelle=1`) : onClose())}
          aria-label={state ? 'Fermer et ouvrir la fiche de la session' : 'Fermer'}
          title={state ? 'Fermer et ouvrir la fiche de la session' : undefined}
        >
          <X size={18} />
        </button>
      </div>

      {/* Étapes */}
      <ol className="wiz-steps" aria-label="Étapes">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const reachable = i === 0 ? !state : Boolean(state);
          return (
            <li key={s.key} className={`${step === i ? 'on' : ''}${done(i) ? ' done' : ''}`}>
              <button type="button" disabled={!reachable || pending} onClick={() => setStep(i as Step)} aria-current={step === i ? 'step' : undefined}>
                <span className="wiz-num">{done(i) && step !== i ? <Check size={13} aria-hidden /> : <Icon size={13} aria-hidden />}</span>
                <span className="wiz-label"><small>Étape {i + 1}</small>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="modal-body wiz-body">
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        {notice && (
          <div role="status" className="alert alert-success wiz-notice">
            <span>{notice}</span>
            <button type="button" className="icon ghost" onClick={() => setNotice(null)} aria-label="Fermer"><X size={14} /></button>
          </div>
        )}

        {step === 0 && !state && (
          <SessionForm key={formKey} formId="wizard-session-form" rooms={rooms} trainers={trainers} templates={templates} defaults={defaults} absences={absences} onSubmit={create} />
        )}
        {step === 0 && state && (
          <p className="hint">La session est créée. Les informations se modifient ensuite depuis sa fiche.</p>
        )}

        {step === 1 && state && <ModulesStep state={state} pending={pending} run={run} />}
        {step === 2 && state && <TraineesStep state={state} pending={pending} run={run} reload={() => reload()} />}
        {step === 3 && state && <FinalStep state={state} pending={pending} run={run} />}
      </div>

      <div className="modal-foot wiz-foot">
        {step === 0 && !state ? (
          <>
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" form="wizard-session-form" className="primary" disabled={pending}>
              {pending ? <><Loader2 size={15} className="spin" aria-hidden /> Création…</> : <>Créer et continuer <ArrowRight size={15} aria-hidden /></>}
            </button>
          </>
        ) : (
          <>
            {step > 1 && (
              <button type="button" onClick={() => setStep((step - 1) as Step)} disabled={pending}>
                <ArrowLeft size={15} aria-hidden /> Retour
              </button>
            )}
            <span style={{ flex: 1 }} />
            {step === 1 && !state?.modules.length && (
              <button type="button" onClick={() => { setSkippedModules(true); setStep(2); }} disabled={pending}>Pas de modules</button>
            )}
            {step === 2 && !state?.trainees.length && (
              <button type="button" onClick={() => setStep(3)} disabled={pending}>Ajouter plus tard</button>
            )}
            {step < 3 ? (
              <button type="button" className="primary" onClick={() => setStep((step + 1) as Step)} disabled={pending || (step === 1 && !state?.modules.length && !skippedModules)}>
                Suivant <ArrowRight size={15} aria-hidden />
              </button>
            ) : (
              <>
                <button type="button" className="primary" onClick={() => state && window.location.assign(`/sessions/${state.id}?nouvelle=1`)}>
                  Terminer et vérifier la fiche <ExternalLink size={14} aria-hidden />
                </button>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ---- Étape 2 : modules ----------------------------------------------------
export function ModulesStep({ state, pending, run }: { state: WizardState; pending: boolean; run: (fn: () => Promise<Res>) => void }) {
  const [adding, setAdding] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const days = state.days;
  return (
    <div className="wiz-step">
      <h3 className="wiz-title">Modules de la session</h3>
      {state.modules.length ? (
        <p className="hint">
          {state.templateModules ? 'Modules prévus par la formation, placés sur les jours de la session.' : 'Modules de la session.'} Chaque stagiaire pourra ensuite suivre tous les modules ou seulement certains.
        </p>
      ) : (
        <p className="hint">
          Cette formation n’a pas de modules. Ajoutes-en si les stagiaires ne suivent pas tous la même partie (ex. MA1, MA2, MA3), sinon passe à l’étape suivante.
        </p>
      )}

      {state.modules.length > 0 && (
        <ul className="wiz-list">
          {state.modules.map((m) => (
            <li key={m.id}>
              <Layers size={15} aria-hidden />
              <span className="wiz-list-main">
                <strong>{m.name}</strong>
                <small>{m.start_day === m.end_day ? dayLabel(m.start_day) : `${dayLabel(m.start_day)} → ${dayLabel(m.end_day)}`}{m.duration_hours ? ` · ${formatHours(m.duration_hours)}` : ''}</small>
              </span>
              <button type="button" className="icon ghost small" aria-label={`Supprimer ${m.name}`} disabled={pending} onClick={() => run(() => deleteSessionModule(state.id, m.id))}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!state.modules.length && (
        <div className="wiz-choices">
          {days.length > 1 && (
            <button type="button" className="wiz-choice" disabled={pending} onClick={() => run(() => splitSessionByDay(state.id))}>
              <Scissors size={18} aria-hidden />
              <strong>Un module par jour</strong>
              <small>{days.length} modules : Jour 1 à Jour {days.length}</small>
            </button>
          )}
          <button type="button" className="wiz-choice" onClick={() => setAdding(true)}>
            <Plus size={18} aria-hidden />
            <strong>Créer mes modules</strong>
            <small>Nom, jours et durée de chaque module</small>
          </button>
        </div>
      )}

      {(adding || state.modules.length > 0) && (
        <form
          ref={formRef}
          className="wiz-module-form"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => addSessionModule(state.id, fd));
            formRef.current?.reset();
          }}
        >
          <input name="name" required placeholder={`Nom du module (ex. MA${state.modules.length + 1})`} aria-label="Nom du module" />
          <ModuleDays
            key={state.modules.map((m) => m.id).join(',')}
            compact
            days={days}
            dayMinutes={state.dayMinutes}
            taken={state.modules.flatMap((m) => days.filter((d) => d >= m.start_day && d <= m.end_day))}
          />
          <button type="submit" className="small primary" disabled={pending}><Plus size={14} aria-hidden /> Ajouter</button>
        </form>
      )}
    </div>
  );
}

// ---- Étape 3 : stagiaires --------------------------------------------------
export function TraineesStep({ state, pending, run, reload }: { state: WizardState; pending: boolean; run: (fn: () => Promise<Res>) => void; reload: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; full_name: string; company: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [paste, setPaste] = useState(false);
  const [resa, setResa] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const enrolled = state.trainees.map((t) => t.id);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      setResults(await searchTrainees(q, enrolled));
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, state.trainees.length]);

  // Modules : choisis à l'ajout (par défaut toute la session), modifiables ensuite.
  const mods = state.modules;
  const [pick, setPick] = useState<string[]>([]);
  const allIds = mods.map((m) => m.id);
  /**
   * Clic sur un module : il remplace le choix précédent (MA1 → MA2 directement).
   * Ctrl / Cmd + clic : plusieurs modules (ajout ou retrait). Tous = toute la session.
   */
  const nextChoice = (current: string[], id: string, multi = false) => {
    const full = !current.length || current.length >= allIds.length;
    // Re-clic sur le seul module choisi : retour à toute la session.
    if (!multi) return allIds.length === 1 || (!full && current.length === 1 && current[0] === id) ? [] : [id];
    if (full) return [id];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    if (!next.length) return current;
    return next.length >= allIds.length ? [] : next;
  };
  const togglePick = (id: string, multi = false) => setPick((p) => nextChoice(p, id, multi));
  // Modules d'un stagiaire : affichage immédiat, enregistrement en arrière-plan.
  const [localMods, setLocalMods] = useState<Record<string, string[]>>({});
  useEffect(() => setLocalMods({}), [state]);
  const modsOf = (t: WizardState['trainees'][number]) => localMods[t.id] ?? t.modules;
  const add = (traineeId: string, status: 'validee' | 'en_attente') => {
    const chosen = pick.length && pick.length < mods.length ? [...pick] : null;
    run(async () => {
      const r = await addTraineeToSession(state.id, traineeId, status);
      if (r.ok && chosen) {
        const m = await setTraineeModules(state.id, traineeId, chosen);
        if (!m.ok) return m;
      }
      return r;
    });
    setQ('');
    inputRef.current?.focus();
  };
  // Clics rapides : seul le dernier choix est enregistré (pas d'enregistrements qui se croisent).
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toggleTraineeModule = (t: WizardState['trainees'][number], moduleId: string, multi = false) => {
    const next = nextChoice(modsOf(t), moduleId, multi);
    setLocalMods((m) => ({ ...m, [t.id]: next }));
    clearTimeout(saveTimers.current[t.id]);
    saveTimers.current[t.id] = setTimeout(() => run(() => setTraineeModules(state.id, t.id, next.length ? next : allIds)), 450);
  };

  const validated = state.trainees.filter((t) => t.status === 'validee').length;
  const waiting = state.trainees.length - validated;
  const resaValid = state.reservations.filter((r) => r.status !== 'en_attente').reduce((n, r) => n + r.seats, 0);
  const resaWait = state.reservations.filter((r) => r.status === 'en_attente').reduce((n, r) => n + r.seats, 0);

  return (
    <div className="wiz-step">
      <h3 className="wiz-title">Stagiaires</h3>
      <div className="wiz-counters">
        <span><strong>{validated}</strong>{state.max_trainees != null ? ` / ${state.max_trainees}` : ''} validé{validated > 1 ? 's' : ''}</span>
        <span><strong>{waiting + resaWait}</strong> en attente</span>
        {resaValid > 0 && <span><strong>{resaValid}</strong> place{resaValid > 1 ? 's' : ''} réservée{resaValid > 1 ? 's' : ''}</span>}
      </div>

      {mods.length > 0 && (
        <div className="wiz-modpick">
          <span className="wiz-field-label">Modules suivis par les stagiaires ajoutés</span>
          <small className="hint wiz-chips-hint">Un clic choisit le module (et remplace le précédent) · Ctrl + clic pour en cumuler plusieurs</small>
          <div className="wiz-chips" role="group" aria-label="Modules suivis">
            <button type="button" className={!pick.length ? 'on' : ''} aria-pressed={!pick.length} onClick={() => setPick([])}>Toute la session</button>
            {mods.map((m) => (
              <button key={m.id} type="button" className={pick.includes(m.id) ? 'on' : ''} aria-pressed={pick.includes(m.id)} onClick={(e) => togglePick(m.id, e.ctrlKey || e.metaKey)}>
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="search wiz-search">
        <Search size={15} aria-hidden />
        <span className="sr-only">Rechercher un stagiaire</span>
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un stagiaire (nom, prénom, entreprise)…" autoFocus />
        {searching && <Loader2 size={14} className="spin" aria-hidden />}
      </label>
      {results.length > 0 && (
        <ul className="wiz-list wiz-results">
          {results.map((t) => (
            <li key={t.id}>
              <UserPlus size={15} aria-hidden />
              <span className="wiz-list-main"><strong>{t.full_name}</strong><small>{t.company || 'Sans entreprise'}</small></span>
              <button type="button" className="small primary" disabled={pending} onClick={() => add(t.id, 'validee')}>
                <Plus size={13} aria-hidden /> Valider
              </button>
              <button type="button" className="small" disabled={pending} onClick={() => add(t.id, 'en_attente')}>
                En attente
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !searching && !results.length && (
        <p className="hint">Personne de ce nom dans la base : utilise « Coller une liste » pour le créer.</p>
      )}

      <div className="wiz-tools">
        <button type="button" className={`small${paste ? ' on' : ''}`} onClick={() => setPaste(!paste)}><ClipboardPaste size={14} aria-hidden /> Coller une liste</button>
        <button type="button" className={`small${resa ? ' on' : ''}`} onClick={() => setResa(!resa)}><Building2 size={14} aria-hidden /> Réserver des places (entreprise)</button>
      </div>
      {paste && (
        <div className="wiz-panel">
          <PasteImport sessionId={state.id} onImported={reload} />
        </div>
      )}
      {resa && (
        <form
          className="wiz-module-form wiz-panel"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => addReservation(state.id, fd));
            e.currentTarget.reset();
          }}
        >
          <input name="company" required placeholder="Entreprise" aria-label="Entreprise" />
          <input name="seats" type="number" min={1} max={200} defaultValue={1} required aria-label="Nombre de places" style={{ width: 80 }} />
          <select name="status" defaultValue="validee" aria-label="Statut des places">
            <option value="validee">Validées</option>
            <option value="en_attente">En attente</option>
          </select>
          <button type="submit" className="small primary" disabled={pending}><Plus size={14} aria-hidden /> Réserver</button>
        </form>
      )}
      {state.reservations.length > 0 && (
        <p className="hint">Places réservées : {state.reservations.map((r) => `${r.company} · ${r.seats}${r.status === 'en_attente' ? ' en attente' : ''}`).join(' · ')}</p>
      )}

      {state.trainees.length > 0 ? (
        <ul className="wiz-list">
          {state.trainees.map((t) => (
            <li key={t.id}>
              <span className={`wiz-dot ${t.status}`} aria-hidden />
              <span className="wiz-list-main">
                <strong>{t.full_name}</strong>
                <small>{t.company || 'Sans entreprise'}</small>
                {mods.length > 0 && (
                  <span className="wiz-chips small" role="group" aria-label={`Modules suivis par ${t.full_name}`}>
                    {mods.map((m) => {
                      const cur = modsOf(t);
                      const on = !cur.length || cur.includes(m.id);
                      return (
                        <button key={m.id} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={(e) => toggleTraineeModule(t, m.id, e.ctrlKey || e.metaKey)}>
                          {m.name}
                        </button>
                      );
                    })}
                  </span>
                )}
              </span>
              <button
                type="button"
                className={`small${t.status === 'validee' ? '' : ' primary'}`}
                disabled={pending}
                onClick={() => run(() => setTraineeStatus(state.id, t.id, t.status === 'validee' ? 'en_attente' : 'validee'))}
              >
                {t.status === 'validee' ? 'Mettre en attente' : <><Check size={13} aria-hidden /> Valider</>}
              </button>
              <button type="button" className="icon ghost small" aria-label={`Retirer ${t.full_name}`} disabled={pending} onClick={() => run(() => removeTraineeFromSession(state.id, t.id))}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty wiz-empty">Aucun stagiaire pour l’instant. Tu peux aussi les ajouter plus tard depuis la fiche.</p>
      )}
    </div>
  );
}

// ---- Étape 4 : finaliser ------------------------------------------------------
export function FinalStep({ state, pending, run }: { state: WizardState; pending: boolean; run: (fn: () => Promise<Res>) => void }) {
  const [url, setUrl] = useState(state.digiforma_docs_url || '');
  const validated = state.trainees.filter((t) => t.status === 'validee').length;
  const waiting = state.trainees.length - validated;
  const checks = [
    { ok: true, label: 'Session créée', detail: `${state.start_at.slice(0, 10) === state.end_at.slice(0, 10) ? fr(state.start_at) : `du ${fr(state.start_at)} au ${fr(state.end_at)}`} · ${formatHours(state.hours)}` },
    { ok: Boolean(state.room), label: state.room ? `Salle : ${state.room}` : 'Salle à choisir', detail: state.room ? '' : 'À faire depuis la fiche' },
    { ok: Boolean(state.trainer), label: state.trainer ? `Formateur : ${state.trainer}` : 'Formateur à définir', detail: '' },
    { ok: state.modules.length > 0, label: state.modules.length ? `${state.modules.length} module${state.modules.length > 1 ? 's' : ''}` : 'Sans modules', detail: '', neutral: !state.modules.length },
    { ok: validated > 0, label: `${validated} stagiaire${validated > 1 ? 's' : ''} validé${validated > 1 ? 's' : ''}${waiting ? ` · ${waiting} en attente` : ''}`, detail: validated ? '' : 'À compléter avant le début' },
    { ok: Boolean(state.digiforma_docs_url), label: state.digiforma_docs_url ? 'Lien Digiforma renseigné' : 'Lien Digiforma manquant', detail: state.digiforma_docs_url ? '' : 'Pour une session 100 % dématérialisée' },
  ];
  return (
    <div className="wiz-step">
      <h3 className="wiz-title">Finaliser</h3>

      <div className="wiz-card">
        <label className="wiz-field">
          <span><Link2 size={14} aria-hidden /> Lien Digiforma des autres documents</span>
          <span className="wiz-inline">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" />
            <button type="button" className="small primary" disabled={pending || url.trim() === (state.digiforma_docs_url || '')} onClick={() => run(() => setDigiformaDocsUrl(state.id, url))}>
              Enregistrer
            </button>
          </span>
          <small className="hint">Le formateur y trouve les documents à remplir sur Digiforma : la session est 100 % dématérialisée.</small>
        </label>
      </div>

      <div className="wiz-card">
        <span className="wiz-field-label">Statut de la session</span>
        <div className="wiz-status" role="radiogroup" aria-label="Statut">
          {[
            { v: 'confirmee', l: 'Confirmée', d: 'Elle aura lieu' },
            { v: 'planifiee', l: 'Planifiée', d: 'En attente de confirmation' },
            { v: 'brouillon', l: 'Brouillon', d: 'Pas encore définitive' },
          ].map((s) => (
            <button key={s.v} type="button" role="radio" aria-checked={state.status === s.v} className={state.status === s.v ? 'on' : ''} disabled={pending} onClick={() => run(() => updateSessionStatus(state.id, s.v) as Promise<Res>)}>
              <strong>{s.l}</strong>
              <small>{s.d}</small>
            </button>
          ))}
        </div>
      </div>

      <ul className="wiz-checks">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? 'ok' : (c as any).neutral ? 'neutral' : 'todo'}>
            {c.ok ? <CheckCircle2 size={15} aria-hidden /> : <span className="wiz-todo" aria-hidden />}
            <span><strong>{c.label}</strong>{c.detail && <small> · {c.detail}</small>}</span>
          </li>
        ))}
      </ul>
      <p className="hint">Ensuite : le formateur remplit le dossier de formation pendant la session, puis le bureau boucle la facturation.</p>
    </div>
  );
}
