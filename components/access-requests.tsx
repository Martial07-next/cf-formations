'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, KeyRound, UserPlus, X } from 'lucide-react';
import { acceptAccessRequest, dismissRequest, refuseAccessRequest, resolvePasswordRequest } from '@/app/acces/actions';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import { askText } from '@/lib/confirm-dialog';

export type AccessRequest = {
  id: string;
  kind: 'acces' | 'mot_de_passe';
  full_name: string | null;
  email: string;
  role_wanted: string | null;
  message: string | null;
  status: 'en_attente' | 'acceptee' | 'refusee' | 'traitee';
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
};

const ROLES: Role[] = ['formateur', 'referent', 'bureau', 'consultation', 'admin'];
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `il y a ${Math.max(m, 1)} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : new Date(iso).toLocaleDateString('fr-FR');
};
const STATUS: Record<string, string> = { acceptee: 'Acceptée', refusee: 'Refusée', traitee: 'Traitée' };

/** Demandes reçues depuis la page de connexion : accès à créer, mots de passe oubliés. */
export function AccessRequests({ pending, recent }: { pending: AccessRequest[]; recent: AccessRequest[] }) {
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [done, setDone] = useState<Record<string, { email: string; password: string; note?: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<any>, id: string) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        if (r.password) setDone((d) => ({ ...d, [id]: { email: r.email, password: r.password, note: r.trainerLinked ? 'Fiche formateur liée.' : undefined } }));
      }
    });

  const copy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const credentials = Object.entries(done);

  return (
    <section className="panel access-requests" id="demandes">
      <div className="panel-head">
        <h2><UserPlus size={17} aria-hidden /> Demandes reçues {pending.length > 0 && <span className="req-count">{pending.length}</span>}</h2>
        <span className="hint">Depuis la page de connexion : demandes d’accès et mots de passe oubliés.</span>
      </div>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      {credentials.map(([id, c]) => (
        <div key={id} className="req-credentials" role="status">
          <strong>Identifiants à transmettre</strong>
          <span>E-mail : <code>{c.email}</code></span>
          <span>Mot de passe : <code>{c.password}</code></span>
          {c.note && <span className="hint">{c.note}</span>}
          <span className="row-actions">
            <button type="button" className="small" onClick={() => copy(id, `Adresse : ${location.origin}\nE-mail : ${c.email}\nMot de passe : ${c.password}`)}>
              <Copy size={13} aria-hidden /> {copied === id ? 'Copié' : 'Copier'}
            </button>
            <a className="btn small" href={`mailto:${c.email}?subject=${encodeURIComponent('Ton accès CF PLANNING')}&body=${encodeURIComponent(`Bonjour,\n\nTon accès à la plateforme CF PLANNING :\nAdresse : ${location.origin}\nE-mail : ${c.email}\nMot de passe : ${c.password}\n\nTu pourras le changer depuis « Mon profil ».`)}`}>
              Envoyer par e-mail
            </a>
            <button type="button" className="small ghost" onClick={() => setDone((d) => { const n = { ...d }; delete n[id]; return n; })}>Fermer</button>
          </span>
        </div>
      ))}

      {!pending.length ? (
        <p className="empty" style={{ margin: 0 }}>Aucune demande en attente.</p>
      ) : (
        <ul className="req-list">
          {pending.map((r) => (
            <li key={r.id} className={`req-item ${r.kind}`}>
              <span className="req-icon">{r.kind === 'acces' ? <UserPlus size={16} aria-hidden /> : <KeyRound size={16} aria-hidden />}</span>
              <span className="req-main">
                <strong>{r.kind === 'acces' ? r.full_name || r.email : 'Mot de passe oublié'}</strong>
                <span className="hint">
                  {r.email} · {ago(r.created_at)}
                  {r.kind === 'acces' && r.role_wanted ? ` · se présente comme ${ROLE_LABELS[r.role_wanted as Role] ?? r.role_wanted}` : ''}
                </span>
                {r.message && <span className="req-msg">« {r.message} »</span>}
              </span>
              <span className="row-actions req-actions">
                {r.kind === 'acces' ? (
                  <>
                    <select
                      className="input"
                      aria-label="Type d'accès à donner"
                      value={roles[r.id] || (ROLES.includes(r.role_wanted as Role) ? (r.role_wanted as Role) : 'formateur')}
                      onChange={(e) => setRoles((m) => ({ ...m, [r.id]: e.target.value as Role }))}
                    >
                      {ROLES.map((x) => <option key={x} value={x}>{ROLE_LABELS[x]}</option>)}
                    </select>
                    <button
                      type="button"
                      className="small primary"
                      disabled={isPending}
                      onClick={() => run(() => acceptAccessRequest(r.id, roles[r.id] || (ROLES.includes(r.role_wanted as Role) ? (r.role_wanted as Role) : 'formateur')), r.id)}
                    >
                      <Check size={14} aria-hidden /> Accepter
                    </button>
                    <button
                      type="button"
                      className="small danger"
                      disabled={isPending}
                      onClick={async () => {
                        const note = await askText(`Refuser la demande de ${r.full_name || r.email} ?\n\nLe motif est facultatif.`, {
                          confirmLabel: 'Refuser',
                          danger: true,
                          input: { label: 'Motif', placeholder: 'Ex. compte déjà existant, personne hors CF Réseaux…' },
                        });
                        if (note !== null) run(() => refuseAccessRequest(r.id, note), r.id);
                      }}
                    >
                      <X size={14} aria-hidden /> Refuser
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="small primary" disabled={isPending} onClick={() => run(() => resolvePasswordRequest(r.id), r.id)}>
                      <KeyRound size={14} aria-hidden /> Nouveau mot de passe
                    </button>
                    <button type="button" className="small ghost" disabled={isPending} onClick={() => run(() => dismissRequest(r.id), r.id)}>
                      Classer
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <details className="req-history">
          <summary className="hint">Demandes traitées récemment ({recent.length})</summary>
          <ul className="req-list">
            {recent.map((r) => (
              <li key={r.id} className="req-item done">
                <span className="req-main">
                  <strong>{r.kind === 'acces' ? r.full_name || r.email : `Mot de passe · ${r.email}`}</strong>
                  <span className="hint">{r.kind === 'acces' ? `${r.email} · ` : ''}{r.decided_at ? new Date(r.decided_at).toLocaleDateString('fr-FR') : ''}{r.decision_note ? ` · ${r.decision_note}` : ''}</span>
                </span>
                <span className={`badge ${r.status === 'refusee' ? 'indisponible' : 'validee'}`}>{STATUS[r.status]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
