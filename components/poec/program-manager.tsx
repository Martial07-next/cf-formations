'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Plus, X, Trash2, UserPlus, Search, Link2, Mail, Copy, Pencil, RefreshCcw, PenLine, Unlink, Briefcase, Check, RotateCcw,
} from 'lucide-react';
import {
  addProgramTrainees, createProgramTrainee, updateProgramTrainee, removeProgramTrainee, searchTrainees,
  attachSessions, detachSession, syncProgramSessions, addPeriod, updatePeriod, deletePeriod,
  saveConvention, signAsCf, resetConventionSignatures, renewConventionLinks, renewFtLink, deleteProgram,
} from '@/app/poec/actions';
import { createSession } from '@/app/sessions/actions';
import { SessionForm, type FormRoom, type FormTrainer, type FormTemplate } from '@/components/session-form';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { ConventionPdfButton, SignatureSteps, type ConventionPdfData } from '@/components/poec/convention-public';
import { ProgramForm } from '@/components/poec/program-form';
import {
  COMPANY_FIELDS, CONVENTION_STATUS_LABEL, conventionStatus, frShort, type Convention, type PoecPeriod, type PoecProgram,
} from '@/lib/poec';
import type { ProgramMember, ProgramSession } from '@/lib/poec-data';
import type { Absence } from '@/lib/absences';
import type { Legal } from '@/lib/pdf-brand';
import type { Director } from '@/lib/poec-public';

type Result = { ok: true } | { ok: false; error: string };

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<Result | void>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res && !res.ok) setError(res.error);
      else {
        setError(null);
        after?.();
      }
    });
  return { error, setError, isPending, run };
}

function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`modal${wide ? ' modal-full' : ''}`} onClose={onClose} aria-label={title}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon ghost" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
      </div>
      <div className="modal-body" style={{ paddingBottom: 18 }}>{open && children}</div>
    </dialog>
  );
}

const linkOf = (path: string) => (typeof window === 'undefined' ? path : `${window.location.origin}${path}`);

function CopyButton({ text, label = 'Copier le lien' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(linkOf(text));
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          window.prompt('Copie ce lien :', linkOf(text));
        }
      }}
    >
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {done ? 'Copié' : label}
    </button>
  );
}

function mailto(to: string | null | undefined, subject: string, body: string) {
  return `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Ouvre la messagerie avec le lien déjà rédigé (construit au clic : l'adresse du site n'est connue que dans le navigateur). */
function MailButton({ to, subject, body, label = 'E-mail' }: { to: string | null | undefined; subject: string; body: () => string; label?: string }) {
  return (
    <button type="button" className="small" onClick={() => { window.location.href = mailto(to, subject, body()); }}>
      <Mail size={14} aria-hidden /> {label}
    </button>
  );
}

// ------------------------------------------------------------
// En-tête : modifier / supprimer le parcours
// ------------------------------------------------------------

export function ProgramHeaderActions({ program }: { program: PoecProgram }) {
  const [edit, setEdit] = useState(false);
  const { error, isPending, run } = useAction();
  return (
    <>
      <button type="button" onClick={() => setEdit(true)}><Pencil size={15} aria-hidden /> Modifier</button>
      <button
        type="button"
        className="danger"
        disabled={isPending}
        onClick={() =>
          confirm(`Supprimer le parcours « ${program.title} » ?\n\nToutes ses formations (sessions du planning, inscriptions, dossiers) et ses conventions seront supprimées définitivement.`) &&
          run(() => deleteProgram(program.id))
        }
      >
        <Trash2 size={15} aria-hidden /> Supprimer
      </button>
      {error && <span className="field-error">{error}</span>}
      <Modal open={edit} onClose={() => setEdit(false)} title="Modifier le parcours" wide>
        <ProgramForm program={program} onDone={() => setEdit(false)} />
      </Modal>
    </>
  );
}

// ------------------------------------------------------------
// Groupe de stagiaires
// ------------------------------------------------------------

export function GroupPanel({ programId, members }: { programId: string; members: ProgramMember[] }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; full_name: string; company: string | null }[]>([]);
  const [picked, setPicked] = useState<{ id: string; full_name: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProgramMember | null>(null);
  const { error, isPending, run } = useAction();
  const memberIds = new Set(members.map((m) => m.trainee_id));

  useEffect(() => {
    const t = setTimeout(async () => setFound(q.trim().length >= 2 ? await searchTrainees(q) : []), 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Groupe de stagiaires <span className="badge validee">{members.length}</span></h2>
        <button type="button" onClick={() => setCreating(true)}><UserPlus size={15} aria-hidden /> Nouveau stagiaire</button>
      </div>
      <p className="panel-intro">Toujours les mêmes stagiaires sur tout le parcours : ils sont inscrits automatiquement à chaque formation ajoutée.</p>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      <div className="poec-search">
        <Search size={15} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter un stagiaire existant : nom ou entreprise…" aria-label="Rechercher un stagiaire" />
      </div>
      {found.length > 0 && (
        <ul className="poec-found">
          {found.map((t) => {
            const inGroup = memberIds.has(t.id);
            const sel = picked.some((p) => p.id === t.id);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={`small${sel ? ' primary' : ''}`}
                  disabled={inGroup}
                  onClick={() => setPicked(sel ? picked.filter((p) => p.id !== t.id) : [...picked, t])}
                >
                  {inGroup ? <Check size={14} aria-hidden /> : <Plus size={14} aria-hidden />} {t.full_name}
                  {t.company ? <span className="hint"> · {t.company}</span> : null}
                  {inGroup ? <span className="hint"> (déjà dans le groupe)</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {picked.length > 0 && (
        <div className="form-actions" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="primary"
            disabled={isPending}
            onClick={() => run(() => addProgramTrainees(programId, picked.map((p) => p.id)), () => { setPicked([]); setQ(''); })}
          >
            Ajouter {picked.length} stagiaire{picked.length > 1 ? 's' : ''} au groupe
          </button>
          <button type="button" onClick={() => setPicked([])}>Annuler</button>
        </div>
      )}

      {members.length === 0 ? (
        <p className="empty">Aucun stagiaire dans le groupe.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Stagiaire</th><th>Adresse (convention)</th><th>Identifiant France Travail</th><th></th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.trainee_id}>
                  <td><Link href={`/stagiaires/${m.trainee_id}`}><strong>{m.full_name}</strong></Link>{m.email && <div className="hint">{m.email}</div>}</td>
                  <td>{m.address || <span className="hint">—</span>}</td>
                  <td>{m.ft_id || <span className="hint">—</span>}</td>
                  <td className="row-actions">
                    <button type="button" className="small icon ghost" aria-label={`Modifier ${m.full_name}`} onClick={() => setEditing(m)}><Pencil size={14} /></button>
                    <button
                      type="button"
                      className="small icon ghost"
                      aria-label={`Retirer ${m.full_name}`}
                      disabled={isPending}
                      onClick={() =>
                        confirm(`Retirer ${m.full_name} du groupe ? Il quitte aussi les formations à venir du parcours.`) &&
                        run(() => removeProgramTrainee(programId, m.trainee_id))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nouveau stagiaire du groupe">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => createProgramTrainee(programId, fd), () => setCreating(false));
          }}
        >
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          <div className="form-row">
            <label>Prénom<input name="first_name" /></label>
            <label>Nom *<input name="last_name" required /></label>
          </div>
          <div className="form-row">
            <label>E-mail<input type="email" name="email" /></label>
            <label>Entreprise<input name="company" placeholder="Ex. France Travail" /></label>
          </div>
          <div className="form-actions"><button type="submit" className="primary" disabled={isPending}>Ajouter au groupe</button></div>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.full_name || ''}>
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => updateProgramTrainee(programId, editing.trainee_id, fd), () => setEditing(null));
            }}
          >
            <div className="form-row">
              <label style={{ gridColumn: '1 / -1' }}>Adresse (reprise sur les conventions)<textarea name="address" rows={2} defaultValue={editing.address || ''} /></label>
            </div>
            <div className="form-row"><label>Identifiant France Travail<input name="ft_id" defaultValue={editing.ft_id || ''} /></label></div>
            <div className="form-actions"><button type="submit" className="primary" disabled={isPending}>Enregistrer</button></div>
          </form>
        )}
      </Modal>
    </section>
  );
}

// ------------------------------------------------------------
// Formations du parcours + périodes de stage
// ------------------------------------------------------------

export function ProgramPlanningActions({
  program,
  sessions,
  attachable,
  periods,
  rooms,
  trainers,
  templates,
  absences,
  memberCount,
}: {
  program: PoecProgram;
  sessions: ProgramSession[];
  attachable: { id: string; title: string; start_at: string; end_at: string }[];
  periods: PoecPeriod[];
  rooms: FormRoom[];
  trainers: FormTrainer[];
  templates: FormTemplate[];
  absences: Absence[];
  memberCount: number;
}) {
  const [mode, setMode] = useState<null | 'session' | 'attach' | 'period'>(null);
  const [period, setPeriod] = useState<PoecPeriod | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const { error, setError, isPending, run } = useAction();
  const lastEnd = sessions.length ? sessions[sessions.length - 1].end_at.slice(0, 10) : program.start_date;

  return (
    <>
      <div className="form-actions" style={{ marginBottom: 14 }}>
        <button type="button" className="primary" onClick={() => { setError(null); setMode('session'); }}><Plus size={15} aria-hidden /> Ajouter une formation</button>
        <button type="button" onClick={() => { setError(null); setMode('period'); setPeriod(null); }}><Briefcase size={15} aria-hidden /> Ajouter une période de stage</button>
        {attachable.length > 0 && (
          <button type="button" onClick={() => { setChosen([]); setMode('attach'); }}><Link2 size={15} aria-hidden /> Rattacher une session du planning</button>
        )}
        {sessions.length > 0 && memberCount > 0 && (
          <button type="button" className="ghost" disabled={isPending} onClick={() => run(() => syncProgramSessions(program.id))} title="Inscrit tout le groupe sur toutes les formations du parcours">
            <RefreshCcw size={15} aria-hidden /> Réinscrire le groupe partout
          </button>
        )}
      </div>
      {error && !mode && <div role="alert" className="alert alert-error">{error}</div>}

      {(sessions.length > 0 || periods.length > 0) && (
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table className="data">
            <thead><tr><th>Formation / stage</th><th>Dates</th><th>Formateur · salle</th><th>Groupe inscrit</th><th></th></tr></thead>
            <tbody>
              {[
                ...periods.map((p) => ({ kind: 'period' as const, key: p.start_date, p })),
                ...sessions.map((s) => ({ kind: 'session' as const, key: s.start_at.slice(0, 10), s })),
              ]
                .sort((a, b) => a.key.localeCompare(b.key))
                .map((row) =>
                  row.kind === 'period' ? (
                    <tr key={row.p.id} className="poec-row-stage">
                      <td><Briefcase size={14} aria-hidden /> <strong>{row.p.label}</strong></td>
                      <td>du {frShort(row.p.start_date)} au {frShort(row.p.end_date)}</td>
                      <td className="hint">En entreprise</td>
                      <td className="hint">Conventions ci-dessous</td>
                      <td className="row-actions">
                        <button type="button" className="small icon ghost" aria-label="Modifier la période" onClick={() => { setError(null); setPeriod(row.p); setMode('period'); }}><Pencil size={14} /></button>
                        <button
                          type="button"
                          className="small icon ghost"
                          aria-label="Supprimer la période"
                          onClick={() => confirm(`Supprimer « ${row.p.label} » et ses conventions ?`) && run(() => deletePeriod(program.id, row.p.id))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.s.id}>
                      <td><Link href={`/sessions/${row.s.id}`}><strong>{row.s.title}</strong></Link></td>
                      <td>{row.s.start_at.slice(0, 10) === row.s.end_at.slice(0, 10) ? frShort(row.s.start_at) : `du ${frShort(row.s.start_at)} au ${frShort(row.s.end_at)}`}</td>
                      <td>{[row.s.trainer || 'Formateur à définir', row.s.room].filter(Boolean).join(' · ')}</td>
                      <td>
                        <span className={`badge ${row.s.enrolled >= memberCount ? 'validee' : 'en_attente'}`}>{row.s.enrolled}/{memberCount}</span>
                      </td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="small icon ghost"
                          aria-label="Détacher du parcours"
                          title="Détacher du parcours (la session reste au planning)"
                          onClick={() => confirm(`Détacher « ${row.s.title} » du parcours ? La session reste au planning.`) && run(() => detachSession(program.id, row.s.id))}
                        >
                          <Unlink size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={mode === 'session'} onClose={() => setMode(null)} title="Ajouter une formation au parcours" wide>
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        <p className="hint" style={{ marginTop: 0 }}>
          Choisis la formation du catalogue (EME hors tension, AIPR, monteur réseaux…), les dates, la salle et le formateur. Les {memberCount} stagiaires du groupe sont inscrits automatiquement.
        </p>
        <SessionForm
          formId="poec-session-form"
          rooms={rooms}
          trainers={trainers}
          templates={templates}
          absences={absences}
          defaults={{ start_date: lastEnd > program.start_date ? lastEnd : program.start_date, status: 'confirmee' }}
          onSubmit={(fd) => {
            fd.set('poec_id', program.id);
            run(() => createSession(fd) as Promise<Result>, () => setMode(null));
          }}
        />
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button type="submit" form="poec-session-form" className="primary" disabled={isPending}>{isPending ? 'Enregistrement…' : 'Ajouter au parcours'}</button>
        </div>
      </Modal>

      <Modal open={mode === 'period'} onClose={() => setMode(null)} title={period ? 'Modifier la période de stage' : 'Nouvelle période de stage'}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => (period ? updatePeriod(program.id, period.id, fd) : addPeriod(program.id, fd)), () => setMode(null));
          }}
        >
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          <div className="form-row">
            <label style={{ gridColumn: '1 / -1' }}>Intitulé<input name="label" defaultValue={period?.label || `Stage en entreprise n°${periods.length + 1}`} /></label>
          </div>
          <div className="form-row">
            <label>Du *<input type="date" name="start_date" required defaultValue={period?.start_date} min={program.start_date} max={program.end_date} /></label>
            <label>Au *<input type="date" name="end_date" required defaultValue={period?.end_date} min={program.start_date} max={program.end_date} /></label>
          </div>
          {!period && <p className="hint">Une convention de stage est préparée pour chaque stagiaire du groupe.</p>}
          <div className="form-actions"><button type="submit" className="primary" disabled={isPending}>Enregistrer</button></div>
        </form>
      </Modal>

      <Modal open={mode === 'attach'} onClose={() => setMode(null)} title="Rattacher des sessions du planning">
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        <p className="hint" style={{ marginTop: 0 }}>Sessions déjà au planning pendant le parcours. Le groupe y sera inscrit.</p>
        <div className="poec-attach">
          {attachable.map((s) => (
            <label key={s.id} className="check-line">
              <input type="checkbox" checked={chosen.includes(s.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, s.id] : chosen.filter((x) => x !== s.id))} />
              <span><strong>{s.title}</strong> <span className="hint">· {frShort(s.start_at)}{s.start_at.slice(0, 10) !== s.end_at.slice(0, 10) ? ` → ${frShort(s.end_at)}` : ''}</span></span>
            </label>
          ))}
        </div>
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button type="button" className="primary" disabled={isPending || !chosen.length} onClick={() => run(() => attachSessions(program.id, chosen), () => setMode(null))}>
            Rattacher {chosen.length || ''}
          </button>
        </div>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------
// Conventions de stage
// ------------------------------------------------------------

export function ConventionsPanel({
  program,
  periods,
  members,
  conventions,
  director,
  legal,
  signerName,
}: {
  program: PoecProgram;
  periods: PoecPeriod[];
  members: ProgramMember[];
  conventions: Convention[];
  director: Director;
  legal: Legal;
  signerName: string;
}) {
  const [editing, setEditing] = useState<Convention | null>(null);
  const [signing, setSigning] = useState<string[] | null>(null);
  const [signer, setSigner] = useState(director.name.replace(/^(Madame|Monsieur)\s+/i, ''));
  const [empty, setEmpty] = useState(true);
  const pad = useRef<SignaturePadHandle>(null);
  const { error, setError, isPending, run } = useAction();

  const member = (id: string) => members.find((m) => m.trainee_id === id);
  const name = (id: string) => member(id)?.full_name || 'Stagiaire (retiré du groupe)';
  const periodOf = (c: Convention) => periods.find((p) => p.id === c.period_id)!;
  const pdf = (c: Convention): ConventionPdfData => ({ convention: c, traineeName: name(c.trainee_id), period: periodOf(c), programTitle: program.title, director, legal });
  const toSign = conventions.filter((c) => !c.cf_signed_at);

  if (!periods.length) {
    return <p className="empty">Ajoute une période de stage : une convention sera préparée pour chaque stagiaire.</p>;
  }

  return (
    <>
      {error && !editing && !signing && <div role="alert" className="alert alert-error">{error}</div>}
      <div className="form-actions" style={{ marginBottom: 14 }}>
        {toSign.length > 0 && (
          <button type="button" className="primary" onClick={() => { setError(null); setSigning(toSign.map((c) => c.id)); }}>
            <PenLine size={15} aria-hidden /> Signer pour CF Réseaux ({toSign.length})
          </button>
        )}
        <ConventionPdfButton items={conventions.map(pdf)} fileName={`Conventions POEC - ${program.title}.pdf`} label="Toutes les conventions (PDF)" />
      </div>

      {periods.map((p) => {
        const list = conventions.filter((c) => c.period_id === p.id).sort((a, b) => name(a.trainee_id).localeCompare(name(b.trainee_id), 'fr'));
        return (
          <div key={p.id} className="poec-period">
            <h3 className="sub-heading"><Briefcase size={15} aria-hidden /> {p.label} · du {frShort(p.start_date)} au {frShort(p.end_date)}</h3>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Stagiaire</th><th>Entreprise d’accueil</th><th>Signatures</th><th>Liens à envoyer</th><th></th></tr></thead>
                <tbody>
                  {list.map((c) => {
                    const st = conventionStatus(c);
                    const m = member(c.trainee_id);
                    const subject = `Convention de stage POEC – ${name(c.trainee_id)}`;
                    return (
                      <tr key={c.id}>
                        <td>
                          <strong>{name(c.trainee_id)}</strong>
                          <div><span className={`poec-status ${st}`}>{CONVENTION_STATUS_LABEL[st]}</span></div>
                        </td>
                        <td>
                          {c.company_name || <span className="hint">En attente de l’entreprise</span>}
                          {c.company_tutor && <div className="hint">Tuteur : {c.company_tutor}</div>}
                        </td>
                        <td><SignatureSteps c={c} /></td>
                        <td>
                          <div className="poec-links">
                            <span className="poec-link-label">Entreprise</span>
                            {c.company_signed_at ? <span className="hint poec-link-done">signé</span> : (
                              <>
                                <CopyButton text={`/convention/${c.company_token}`} label="Copier" />
                                <MailButton to={c.company_email} subject={subject} body={() => `Bonjour,\n\nVoici le lien pour compléter et signer en ligne la convention de stage de ${name(c.trainee_id)} (du ${frShort(p.start_date)} au ${frShort(p.end_date)}) :\n${linkOf(`/convention/${c.company_token}`)}\n\nCordialement,\nCF Réseaux`} />
                              </>
                            )}
                            <span className="poec-link-label">Stagiaire</span>
                            {c.trainee_signed_at ? <span className="hint poec-link-done">signé</span> : (
                              <>
                                <CopyButton text={`/convention/${c.trainee_token}`} label="Copier" />
                                <MailButton to={m?.email} subject={subject} body={() => `Bonjour ${name(c.trainee_id)},\n\nVoici le lien pour relire et signer ta convention de stage (du ${frShort(p.start_date)} au ${frShort(p.end_date)}) :\n${linkOf(`/convention/${c.trainee_token}`)}\n\nCF Réseaux`} />
                              </>
                            )}
                          </div>
                        </td>
                        <td className="row-actions">
                          <button type="button" className="small icon ghost" aria-label="Compléter la convention" title="Compléter / corriger" onClick={() => { setError(null); setEditing(c); }}><Pencil size={14} /></button>
                          <ConventionPdfButton items={[pdf(c)]} fileName={`Convention de stage - ${name(c.trainee_id)}.pdf`} label="PDF" className="small" />
                          {!c.cf_signed_at && (
                            <button type="button" className="small icon ghost" aria-label="Signer pour CF Réseaux" title="Signer pour CF Réseaux" onClick={() => { setError(null); setSigning([c.id]); }}><PenLine size={14} /></button>
                          )}
                          <button
                            type="button"
                            className="small icon ghost"
                            aria-label="Nouveaux liens"
                            title="Générer de nouveaux liens (les anciens ne fonctionneront plus)"
                            onClick={() => confirm('Générer de nouveaux liens ? Les liens déjà envoyés ne fonctionneront plus.') && run(() => renewConventionLinks(program.id, c.id))}
                          >
                            <RefreshCcw size={14} />
                          </button>
                          {(c.cf_signed_at || c.company_signed_at || c.trainee_signed_at || c.ft_signed_at) && (
                            <button
                              type="button"
                              className="small icon ghost"
                              aria-label="Annuler les signatures"
                              title="Annuler toutes les signatures (pour corriger la convention)"
                              onClick={() => confirm('Annuler toutes les signatures de cette convention ? Chaque partie devra signer de nouveau.') && run(() => resetConventionSignatures(program.id, c.id))}
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Convention · ${name(editing.trainee_id)}` : ''} wide>
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => saveConvention(program.id, editing.id, fd), () => setEditing(null));
            }}
          >
            {error && <div role="alert" className="alert alert-error">{error}</div>}
            <p className="hint" style={{ marginTop: 0 }}>
              Tu peux pré-remplir ou corriger les informations ; l’entreprise et le stagiaire peuvent aussi les compléter eux-mêmes via leur lien. Chaque partie verrouille sa partie en signant.
            </p>
            <fieldset disabled={!!editing.company_signed_at} className="poec-fieldset">
              <legend>B · Entreprise d’accueil {editing.company_signed_at && '(signée)'}</legend>
              <div className="form-row">
                {COMPANY_FIELDS.map((f) => (
                  <label key={f.key} style={'multiline' in f && f.multiline ? { gridColumn: '1 / -1' } : undefined}>
                    {f.label}
                    {'multiline' in f && f.multiline ? (
                      <textarea name={f.key} rows={f.key === 'missions' ? 3 : 2} defaultValue={(editing as any)[f.key] || ''} />
                    ) : (
                      <input name={f.key} defaultValue={(editing as any)[f.key] || ''} />
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="form-row">
              <label>
                Adresse du stagiaire {editing.trainee_signed_at && '(signée)'}
                <textarea name="trainee_address" rows={2} defaultValue={editing.trainee_address || member(editing.trainee_id)?.address || ''} disabled={!!editing.trainee_signed_at} />
              </label>
              <label>
                Tuteur pédagogique CF Réseaux
                <input name="pedagogical_tutor" defaultValue={editing.pedagogical_tutor || program.pedagogical_tutor || ''} disabled={!!editing.cf_signed_at} />
              </label>
            </div>
            <div className="form-actions"><button type="submit" className="primary" disabled={isPending}>Enregistrer</button></div>
          </form>
        )}
      </Modal>

      <Modal open={!!signing} onClose={() => setSigning(null)} title="Signature CF Réseaux">
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        <p className="hint" style={{ marginTop: 0 }}>
          {signing && signing.length > 1
            ? `Une seule signature pour les ${signing.length} conventions non signées par CF Réseaux.`
            : 'Signature de la convention pour CF Réseaux.'}{' '}
          Fait à {legal.city || 'Cuincy'}, le {new Date().toLocaleDateString('fr-FR')}.
        </p>
        <label className="field" style={{ marginBottom: 12 }}>
          Signataire
          <input value={signer} onChange={(e) => setSigner(e.target.value)} placeholder={signerName} />
        </label>
        <SignaturePad ref={pad} height={170} onChange={setEmpty} />
        <div className="sign-actions">
          <button
            type="button"
            className="primary"
            disabled={isPending || empty}
            onClick={() => {
              const sig = pad.current?.toDataURL();
              if (!sig || !signing) return setError('Signe dans le cadre.');
              run(() => signAsCf(program.id, signing, signer, sig), () => setSigning(null));
            }}
          >
            Signer {signing && signing.length > 1 ? `les ${signing.length} conventions` : 'la convention'}
          </button>
        </div>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------
// France Travail
// ------------------------------------------------------------

export function FranceTravailLink({ program }: { program: PoecProgram }) {
  const { error, isPending, run } = useAction();
  const path = program.ft_token ? `/france-travail/${program.ft_token}` : null;
  return (
    <>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <p className="panel-intro">
        Un lien unique pour le conseiller France Travail{program.ft_advisor ? ` (${program.ft_advisor})` : ''} : il suit le programme, les stagiaires et l’avancement des conventions, télécharge les PDF et vise toutes les conventions signées en une seule signature.
      </p>
      <div className="form-actions">
        {path ? (
          <>
            <CopyButton text={path} />
            <MailButton to={program.ft_email} subject={`Suivi POEC – ${program.title}`} body={() => `Bonjour,\n\nVoici le lien de suivi du parcours POEC « ${program.title} » (programme, stagiaires, conventions de stage à viser) :\n${linkOf(path)}\n\nCordialement,\nCF Réseaux`} label="Envoyer par e-mail" />
            <a className="btn small" href={path} target="_blank" rel="noreferrer"><Link2 size={14} aria-hidden /> Ouvrir l’espace</a>
          </>
        ) : null}
        <button
          type="button"
          className="small ghost"
          disabled={isPending}
          onClick={() => (!path || confirm('Générer un nouveau lien ? L’ancien ne fonctionnera plus.')) && run(() => renewFtLink(program.id))}
        >
          <RefreshCcw size={14} aria-hidden /> {path ? 'Nouveau lien' : 'Créer le lien'}
        </button>
      </div>
    </>
  );
}
