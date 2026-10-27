'use client';

import { useState, useTransition } from 'react';
import { createProgram, updateProgram } from '@/app/poec/actions';
import type { PoecProgram, ProgramKind } from '@/lib/poec';

const plusMonths = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Création / modification d'un parcours : POEC (France Travail, conventions)
 * ou parcours personnalisé (groupe, formations et stages, sans France Travail).
 */
export function ProgramForm({ program, onDone, defaultKind = 'poec' }: { program?: PoecProgram; onDone?: () => void; defaultKind?: ProgramKind }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [start, setStart] = useState(program?.start_date || '');
  const [end, setEnd] = useState(program?.end_date || '');
  const [kind, setKind] = useState<ProgramKind>(program ? (program.kind === 'personnalise' ? 'personnalise' : 'poec') : defaultKind);
  const poec = kind === 'poec';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = program ? await updateProgram(program.id, fd) : await createProgram(fd);
          if (res && !res.ok) setError(res.error);
          else {
            setError(null);
            onDone?.();
          }
        });
      }}
    >
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <input type="hidden" name="kind" value={kind} />
      <div className="program-kind" role="radiogroup" aria-label="Type de parcours">
        {([
          ['poec', 'Parcours POEC', 'Avec France Travail : conventions de stage tripartites, espace de suivi du conseiller.'],
          ['personnalise', 'Parcours personnalisé', 'Pour un groupe ou une entreprise : formations et stages enchaînés, sans France Travail.'],
        ] as const).map(([k, label, desc]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={`program-kind-opt${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>
            <strong>{label}</strong>
            <small>{desc}</small>
          </button>
        ))}
      </div>
      <div className="form-row">
        <label style={{ gridColumn: 'span 2' }}>
          Nom du parcours *
          <input name="title" required defaultValue={program?.title} placeholder={poec ? 'Ex. POEC Monteur réseaux · Groupe 3' : 'Ex. Parcours habilitations · Entreprise X'} />
        </label>
        <label>Référence<input name="reference" defaultValue={program?.reference || ''} placeholder={poec ? 'N° de convention FT' : 'N° de devis, de commande…'} /></label>
      </div>
      <div className="form-row">
        <label>Début *
          <input
            type="date"
            name="start_date"
            required
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              // 3 mois par défaut
              if (!end && e.target.value) setEnd(plusMonths(e.target.value, 3));
            }}
          />
        </label>
        <label>Fin *<input type="date" name="end_date" required value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></label>
        <label>{poec ? 'Chargée de recrutement' : 'Référent du parcours'}<input name="recruiter" defaultValue={program?.recruiter || ''} /></label>
        <label>Tuteur pédagogique CF Réseaux<input name="pedagogical_tutor" defaultValue={program?.pedagogical_tutor || ''} placeholder="Repris sur les conventions" /></label>
      </div>
      {poec ? (
        <div className="form-row">
          <label>Conseiller France Travail<input name="ft_advisor" defaultValue={program?.ft_advisor || ''} /></label>
          <label>Agence France Travail<input name="ft_agency" defaultValue={program?.ft_agency || ''} /></label>
          <label>E-mail du conseiller<input type="email" name="ft_email" defaultValue={program?.ft_email || ''} /></label>
        </div>
      ) : (
        <>
          {/* Parcours personnalisé : pas de France Travail (valeurs conservées si on change de type). */}
          <input type="hidden" name="ft_advisor" value={program?.ft_advisor || ''} />
          <input type="hidden" name="ft_agency" value={program?.ft_agency || ''} />
          <input type="hidden" name="ft_email" value={program?.ft_email || ''} />
        </>
      )}
      <div className="form-row">
        <label style={{ gridColumn: '1 / -1' }}>
          Objectifs du parcours
          <textarea name="objectives" rows={4} defaultValue={program?.objectives || ''} placeholder="Ex. Acquérir les habilitations et compétences pour occuper un poste de monteur réseaux électriques…" />
        </label>
      </div>
      <div className="form-row">
        <label style={{ gridColumn: '1 / -1' }}>Notes internes<textarea name="notes" rows={2} defaultValue={program?.notes || ''} /></label>
      </div>
      <div className="form-actions">
        <button type="submit" className="primary" disabled={isPending}>{isPending ? 'Enregistrement…' : program ? 'Enregistrer' : 'Créer le parcours'}</button>
      </div>
    </form>
  );
}
